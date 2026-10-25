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
/** Fixed paper-space nudge for the doc tab text block (203 dpi). */
export const TAB_SHIFT_RIGHT_DOTS = 63; // 0.3125"
export const TAB_SHIFT_DOWN_DOTS = 10; // 0.050"
const HEADERS = ['Invoice:', 'Custo:', 'Dept:', 'Date:', 'Weight:', 'COD:', 'DV:', 'Shipping:', 'Special:', 'Handling:', 'Total:'];

/**
 * Lays out the whole doc tab — FedEx's TRCK/SVC header rows plus our 4
 * custom rows — as one 6-row block: equal gaps above, between and below the
 * rows, and equal left/right padding. FedEx sends this label inverted
 * (^POI or per-field "I" rotation), so all layout math runs in paper
 * coordinates and is mapped back. Only fields inside the tab strip move.
 */
export function adjustDocTabZpl(zpl: string): string {
  const labelLen = Number(zpl.match(/\^LL(\d+)/)?.[1] ?? 1370);
  const labelWidth = Number(zpl.match(/\^PW(\d+)/)?.[1] ?? 812);
  const globalInv = /\^POI/.test(zpl);
  const fieldRe = /\^(FO|FT)(\d+),(\d+)([^]*?\^FS)/g;
  type F = { idx: number; len: number; cmd: string; x: number; y: number; rest: string; inv: boolean; pTop: number; pLeft: number; h: number; w: number; text: string };
  const fields: F[] = [];
  for (const m of zpl.matchAll(fieldRe)) {
    const [all, cmd, xs, ys, rest] = m;
    const x = Number(xs), y = Number(ys);
    const font = rest.match(/\^A([0-9A-Z@])([NRIB]?),(\d+)(?:,(\d+))?/);
    const h = Number(font?.[3] ?? 20);
    const cw = Number(font?.[4] ?? h);
    const text = rest.match(/\^FD([^^]*)/)?.[1] ?? '';
    const w = Math.round(text.length * (font?.[1] === '0' ? cw * 0.6 : cw));
    const inv = globalInv !== (font?.[2] === 'I');
    const top = cmd === 'FT' ? y - h : y;
    const pTop = inv ? labelLen - top - h : top;
    const pLeft = inv ? labelWidth - x - w : x;
    fields.push({ idx: m.index!, len: all.length, cmd, x, y, rest, inv, pTop, pLeft, h, w, text });
  }
  const anchors = fields.filter((f) => HEADERS.some((hd) => f.text.includes(hd)));
  if (!anchors.length) return zpl;
  const atEnd = anchors[0].pTop > labelLen / 2;
  const regionStart = atEnd ? labelLen - TAB_DOTS : 0;
  const regionEnd = regionStart + TAB_DOTS;
  const tab = fields.filter((f) => f.pTop >= regionStart - 24 && f.pTop + f.h <= regionEnd + 4);
  if (!tab.length) return zpl;

  const dx = TAB_SHIFT_RIGHT_DOTS;
  const pdy = TAB_SHIFT_DOWN_DOTS;
  let out = '';
  let cursor = 0;
  for (const f of [...tab].sort((a, b) => a.idx - b.idx)) {
    const nx = f.x + (f.inv ? -dx : dx);
    const ny = f.y + (f.inv ? -pdy : pdy);
    out += zpl.slice(cursor, f.idx) + `^${f.cmd}${Math.max(0, nx)},${Math.max(0, ny)}${f.rest}`;
    cursor = f.idx + f.len;
  }
  return out + zpl.slice(cursor);
}

/** Base64 ZPL in, base64 ZPL out. */
export function adjustDocTabZplBase64(b64: string): string {
  if (!b64) return b64;
  try { return btoa(adjustDocTabZpl(atob(b64))); } catch { return b64; }
}
