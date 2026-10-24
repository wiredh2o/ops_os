// Zebra Browser Print client — talks to the local Zebra Browser Print service
// over the loopback ports (https://localhost:9101, http://localhost:9100).
// Raw ZPL goes straight to the printer with no browser print dialog and no
// driver scaling, so barcodes print at true 203 DPI hardware resolution.

export interface ZebraServiceInfo {
  available: boolean;
  baseUrl?: string;
  error?: string;
  /** Printer reported directly by /available, when present. */
  printer?: ZebraPrinter;
  /** True when the service is likely running but the browser has not yet
   *  trusted its self-signed localhost certificate (one-time approval). */
  needsCertApproval?: boolean;
}

export interface ZebraPrinter {
  name: string;
  uid?: string;
  connection?: string;
  deviceType?: string;
}

const CANDIDATE_URLS = ["https://localhost:9101", "http://localhost:9100"];
// Long enough for the user to click "Allow" on Zebra's desktop prompt the
// first time this website asks for printer access.
const DETECT_TIMEOUT_MS = 30000;
const TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Extracts the first printer from an /available response, if any. */
export function pickPrinterFromAvailable(data: unknown): ZebraPrinter | undefined {
  const list = (data as { printer?: unknown })?.printer;
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  const p = arr.find((x: any) => x && typeof x.name === "string");
  return p as ZebraPrinter | undefined;
}

/** Detects whether the Zebra Browser Print service is running on this machine. */
export async function checkZebraService(): Promise<ZebraServiceInfo> {
  const pageIsSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const urls = pageIsSecure ? ["https://localhost:9101"] : CANDIDATE_URLS;

  let lastError = "";
  let sawNetworkFailure = false;
  for (const baseUrl of urls) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/available`, undefined, DETECT_TIMEOUT_MS);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { available: true, baseUrl, printer: pickPrinterFromAvailable(data) };
      }
      lastError = `Zebra Browser Print answered with status ${res.status}.`;
    } catch (err) {
      sawNetworkFailure = true;
      lastError =
        (err as Error).name === "AbortError"
          ? "Timed out waiting for Zebra Browser Print. No one clicked Allow on its prompt."
          : (err as Error).message;
    }
  }

  if (pageIsSecure && sawNetworkFailure) {
    return {
      available: false,
      needsCertApproval: true,
      error: `Could not reach Zebra Browser Print (${lastError}). Either the certificate isn't trusted yet or the Allow prompt was missed.`,
    };
  }
  return {
    available: false,
    error: lastError || "Zebra Browser Print was not detected on this computer.",
  };
}

/** Returns the printer the user set as default inside Zebra Browser Print. */
export async function getDefaultPrinter(baseUrl: string): Promise<ZebraPrinter> {
  // ?type=printer is required — without it the service answers with plain
  // text ("Device: ...") instead of a JSON device object.
  const res = await fetchWithTimeout(`${baseUrl}/default?type=printer`);
  if (!res.ok) throw new Error("Could not read the default printer from Zebra Browser Print.");
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Zebra Browser Print returned an unexpected response: ${text.slice(0, 120)}`);
  }
  const printer = (Array.isArray(data) ? data[0] : data) as ZebraPrinter | undefined;
  if (!printer?.name) {
    throw new Error("No default printer is selected. Open Zebra Browser Print and choose your ZP 500 as the default device.");
  }
  return printer;
}

/** Zebra's own SDK always stamps devices with its client API level (2). */
const BROWSER_PRINT_API_VERSION = 2;

/** Builds the JSON payload Zebra Browser Print expects on POST /write. */
export function buildWritePayload(printer: ZebraPrinter, zpl: string): string {
  // Mirrors Zebra's official BrowserPrint.js Device.send(): the service
  // rejects writes without "version" ("No value for version"), and the
  // device records it reports do not include that field themselves.
  const p = printer as ZebraPrinter & { provider?: string; manufacturer?: string };
  return JSON.stringify({
    device: {
      name: p.name,
      uid: p.uid,
      connection: p.connection,
      deviceType: p.deviceType,
      version: BROWSER_PRINT_API_VERSION,
      provider: p.provider,
      manufacturer: p.manufacturer,
    },
    data: zpl,
  });
}

/** Sends raw ZPL to the default printer. Throws with a readable reason on failure. */
export async function sendZplToPrinter(baseUrl: string, printer: ZebraPrinter, zpl: string): Promise<void> {
  const res = await fetchWithTimeout(`${baseUrl}/write`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: buildWritePayload(printer, zpl),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `The printer refused the label (status ${res.status}).`);
  }
}

/**
 * A simple 4" x 6.75" connection-test label. Pure text and one Code-128
 * barcode — enough to confirm the pipeline end to end without carrier data.
 */
export function buildTestLabelZpl(): string {
  return [
    "^XA",
    "^CI28",
    "^PW812",
    "^LL1350",
    "^FO50,50^A0N,48,48^FDZebra Browser Print^FS",
    "^FO50,110^A0N,36,36^FDConnection test — Ops OS^FS",
    "^FO50,170^BY2,3,120^BCN,120,Y,N,N^FDZEBRA-TEST-OK^FS",
    "^FO50,330^A0N,28,28^FDIf you can read this and the barcode scans,^FS",
    "^FO50,365^A0N,28,28^FDraw ZPL printing is working correctly.^FS",
    "^XZ",
  ].join("\n");
}
