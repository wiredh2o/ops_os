// Pure rules for inventory quantity/value adjustments and general journal balancing.
// The server RPCs re-apply the same rules; these keep the screens honest before posting.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface AdjustmentResult {
  newQuantity: number;
  newUnitCost: number;
  oldValue: number;
  newValue: number;
  valueChange: number;
  changed: boolean;
  error?: string;
}

/** Total value is always quantity × per-item cost. A typed value becomes a new per-item cost. */
export function computeAdjustment(
  oldQuantity: number, oldUnitCost: number, newQuantity?: number | null, newValue?: number | null,
): AdjustmentResult {
  const oq = oldQuantity || 0;
  const oc = oldUnitCost || 0;
  const oldValue = round2(oq * oc);
  const nq = newQuantity ?? oq;
  let cost = oc;
  let error: string | undefined;
  if (nq < 0) error = "Quantity on hand can't go below 0";
  if (newValue != null) {
    if (newValue < 0) error = "Value can't be negative";
    else if (nq === 0) {
      if (newValue !== 0) error = 'Value must be 0 when quantity is 0';
    } else cost = round6(newValue / nq);
  }
  const value = round2(nq * cost);
  return {
    newQuantity: nq, newUnitCost: cost, oldValue, newValue: value,
    valueChange: round2(value - oldValue), changed: nq !== oq || cost !== oc, error,
  };
}

/** One net entry: positive net debits Inventory Asset, negative net credits it. */
export function adjustmentEntry(netChange: number) {
  const amt = round2(Math.abs(netChange));
  if (amt === 0) return null;
  return netChange > 0
    ? { inventory: { debit: amt, credit: 0 }, offset: { debit: 0, credit: amt } }
    : { inventory: { debit: 0, credit: amt }, offset: { debit: amt, credit: 0 } };
}

export function netChange(results: AdjustmentResult[]): number {
  return round2(results.reduce((s, r) => s + (r.changed && !r.error ? r.valueChange : 0), 0));
}

export interface JournalLine { debit?: number | null; credit?: number | null }

export function journalTotals(lines: JournalLine[]) {
  const debit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const credit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit, credit, difference: round2(debit - credit), balanced: debit === credit && debit > 0 };
}

/** QuickBooks pre-fills the next row with whatever is needed to balance. */
export function balancingLine(lines: JournalLine[]): { debit: number; credit: number } {
  const { difference } = journalTotals(lines);
  return difference > 0 ? { debit: 0, credit: difference } : { debit: -difference, credit: 0 };
}
