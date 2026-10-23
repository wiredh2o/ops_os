// Zebra Browser Print client — talks to the local Zebra Browser Print service
// over the loopback ports (https://localhost:9101, http://localhost:9100).
// Raw ZPL goes straight to the printer with no browser print dialog and no
// driver scaling, so barcodes print at true 203 DPI hardware resolution.

export interface ZebraServiceInfo {
  available: boolean;
  baseUrl?: string;
  error?: string;
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
const TIMEOUT_MS = 3000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Detects whether the Zebra Browser Print service is running on this machine. */
export async function checkZebraService(): Promise<ZebraServiceInfo> {
  // The app is served over HTTPS, so the browser blocks the plain-HTTP port
  // (9100) as mixed content and refuses the HTTPS port (9101) until the user
  // has trusted Zebra's self-signed localhost certificate once.
  const pageIsSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const urls = pageIsSecure ? ["https://localhost:9101"] : CANDIDATE_URLS;

  let sawNetworkFailure = false;
  for (const baseUrl of urls) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/available`);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.available === true || res.status === 200) {
          return { available: true, baseUrl };
        }
      }
    } catch {
      sawNetworkFailure = true;
    }
  }

  if (pageIsSecure && sawNetworkFailure) {
    return {
      available: false,
      needsCertApproval: true,
      error:
        "The browser has not trusted Zebra Browser Print's local security certificate yet. This is a one-time step per computer.",
    };
  }
  return {
    available: false,
    error:
      "Zebra Browser Print was not detected on this computer. Install it from zebra.com/browserprint, start it, and set your ZP 500 as the default printer.",
  };
}

/** Returns the printer the user set as default inside Zebra Browser Print. */
export async function getDefaultPrinter(baseUrl: string): Promise<ZebraPrinter> {
  const res = await fetchWithTimeout(`${baseUrl}/default`);
  if (!res.ok) throw new Error("Could not read the default printer from Zebra Browser Print.");
  const data = await res.json();
  if (!data?.name) {
    throw new Error("No default printer is selected. Open Zebra Browser Print and choose your ZP 500 as the default device.");
  }
  return data as ZebraPrinter;
}

/** Builds the JSON payload Zebra Browser Print expects on POST /write. */
export function buildWritePayload(printer: ZebraPrinter, zpl: string): string {
  return JSON.stringify({
    device: {
      name: printer.name,
      uid: printer.uid,
      connection: printer.connection,
      deviceType: printer.deviceType,
    },
    data: zpl,
  });
}

/** Sends raw ZPL to the default printer. Throws with a readable reason on failure. */
export async function sendZplToPrinter(baseUrl: string, printer: ZebraPrinter, zpl: string): Promise<void> {
  const res = await fetchWithTimeout(`${baseUrl}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
