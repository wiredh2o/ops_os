/**
 * Shipping label doc-tab: the 3/4" peel-off summary strip at the bottom of a
 * 4" x 6.75" label. FedEx prints it natively (trailing doc-tab stock); UPS
 * labels stay their standard 4" x 6" and the strip is printed below them.
 */

export interface DocTabData {
  invoice: string;
  customer: string;
  dept?: string;
  date: Date;
  weightLbs: number;
  cod?: number | null;
  declaredValue?: number | null;
  shipping: number;
  special?: number;
  handling?: number;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** 24 Oct 2026 -> "24OCT26" (the carrier doc-tab date style). */
export function formatDocTabDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}${MONTHS[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
}

const money = (n?: number | null) => (n == null ? "" : n.toFixed(2));

/** Two columns of label/value rows, in the same order as the FedEx tab. */
export function docTabRows(d: DocTabData): { left: [string, string][]; right: [string, string][] } {
  const special = d.special ?? 0;
  const handling = d.handling ?? 0;
  return {
    left: [
      ["Invoice", d.invoice],
      ["Custo", d.customer],
      ["Dept", d.dept ?? ""],
      ["Date", formatDocTabDate(d.date)],
      ["Weight", d.weightLbs.toFixed(1)],
      ["COD", money(d.cod)],
      ["DV", money(d.declaredValue)],
    ],
    right: [
      ["Shipping", money(d.shipping)],
      ["Special", money(special)],
      ["Handling", money(handling)],
      ["Total", money(d.shipping + special + handling)],
    ],
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** HTML for the 4" x 0.75" strip printed under a 4" x 6" label image. */
export function docTabHtml(d: DocTabData): string {
  const { left, right } = docTabRows(d);
  const col = (rows: [string, string][]) =>
    rows.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join("");
  return `<div class="doc-tab"><div class="col">${col(left)}</div><div class="col">${col(right)}</div></div>`;
}
