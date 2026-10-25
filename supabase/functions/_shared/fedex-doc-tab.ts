// FedEx native leading doc tab (3/4" peel-off strip on 4" x 6.75" thermal stock).
// Shared so production and certification labels carry an identical tab.

export interface DocTabInput { invoice?: unknown; customer?: unknown; dept?: unknown; handling?: unknown }

const lit = (v: unknown) => (v == null ? '' : String(v)).slice(0, 30);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 24 Oct 2026 -> "24OCT26" */
export function docTabDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}${MONTHS[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(-2)}`;
}

// FedEx ZONE001 is a 3-column x 4-row grid filled column by column (zones 1-4, 5-8, 9-12).
export function fedexDocTabLabelSpec(doc: DocTabInput | undefined, shipDate = new Date()) {
  const zones = [
    { zoneNumber: 1, header: 'Invoice', literalValue: lit(doc?.invoice) },
    { zoneNumber: 2, header: 'Custo', literalValue: lit(doc?.customer) },
    { zoneNumber: 3, header: 'Dept', literalValue: lit(doc?.dept) },
    { zoneNumber: 5, header: 'Date', literalValue: docTabDate(shipDate) },
    { zoneNumber: 6, header: 'Weight', dataField: 'REQUEST/PACKAGE/Weight/Value' },
    { zoneNumber: 7, header: 'COD', dataField: 'REQUEST/SHIPMENT/SpecialServicesRequested/CodDetail/CodCollectionAmount/Amount' },
    { zoneNumber: 8, header: 'DV', dataField: 'REQUEST/PACKAGE/InsuredValue/Amount' },
    { zoneNumber: 9, header: 'Shipping', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalBaseCharge/Amount' },
    { zoneNumber: 10, header: 'Special', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalSurcharges/Amount' },
    { zoneNumber: 11, header: 'Handling', literalValue: lit(doc?.handling ?? '0.00') },
    { zoneNumber: 12, header: 'Total', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalNetCharge/Amount' },
  ];
  return {
    imageType: 'ZPLII',
    labelStockType: 'STOCK_4X675_LEADING_DOC_TAB',
    labelPrintingOrientation: 'BOTTOM_EDGE_OF_TEXT_FIRST',
    customerSpecifiedDetail: {
      docTabContent: { docTabContentType: 'ZONE001', zone001: { docTabZoneSpecifications: zones } },
    },
  };
}

const TAB_DOTS = 152; // 3/4" at 203 dpi
const HEADERS = ['Invoice:', 'Custo:', 'Dept:', 'Date:', 'Weight:', 'COD:', 'DV:', 'Shipping:', 'Special:', 'Handling:', 'Total:'];

/**
 * Re-centres the doc-tab text inside its 3/4" strip so the gap to the
 * perforation equals the gap to the outer edge, with the same side margin.
 * Only fields inside the tab strip move; the shipping label is untouched.
 */
export function adjustDocTabZpl(zpl: string): string {
  const labelLen = Number(zpl.match(/\^LL(\d+)/)?.[1] ?? 1370);
  // Each field: positioning command up to ^FS
  const fieldRe = /\^(FO|FT)(\d+),(\d+)([^]*?\^FS)/g;
  type F = { idx: number; len: number; cmd: string; x: number; y: number; rest: string; top: number; bottom: number; text: string };
  const fields: F[] = [];
  for (const m of zpl.matchAll(fieldRe)) {
    const [all, cmd, xs, ys, rest] = m;
    const x = Number(xs), y = Number(ys);
    const h = Number(rest.match(/\^A[0-9A-Z@][NRIB]?,(\d+)/)?.[1] ?? 20);
    const top = cmd === 'FT' ? y - h : y;
    fields.push({ idx: m.index!, len: all.length, cmd, x, y, rest, top, bottom: top + h, text: rest.match(/\^FD([^^]*)/)?.[1] ?? '' });
  }
  const anchors = fields.filter((f) => HEADERS.some((h) => f.text.includes(h)));
  if (!anchors.length) return zpl;
  const atEnd = anchors[0].top > labelLen / 2;
  const regionStart = atEnd ? labelLen - TAB_DOTS : 0;
  const regionEnd = regionStart + TAB_DOTS;
  const tab = fields.filter((f) => f.top >= regionStart - 4 && f.bottom <= regionEnd + 4 && !/TRCK|SVC/i.test(f.text));
  if (!tab.length) return zpl;
  const minTop = Math.min(...tab.map((f) => f.top));
  const maxBottom = Math.max(...tab.map((f) => f.bottom));
  const pad = Math.max(0, Math.round((TAB_DOTS - (maxBottom - minTop)) / 2));
  const dy = regionStart + pad - minTop;
  const minX = Math.min(...tab.map((f) => f.x));
  const dx = pad - minX;
  if (!dy && !dx) return zpl;
  let out = '';
  let cursor = 0;
  for (const f of tab.sort((a, b) => a.idx - b.idx)) {
    out += zpl.slice(cursor, f.idx) + `^${f.cmd}${Math.max(0, f.x + dx)},${Math.max(0, f.y + dy)}${f.rest}`;
    cursor = f.idx + f.len;
  }
  return out + zpl.slice(cursor);
}

/** Base64 ZPL in, base64 ZPL out. */
export function adjustDocTabZplBase64(b64: string): string {
  if (!b64) return b64;
  try { return btoa(adjustDocTabZpl(atob(b64))); } catch { return b64; }
}
