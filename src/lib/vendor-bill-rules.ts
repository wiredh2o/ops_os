// Pure rules for PO item receipts, vendor bills and vendor payments.
// The database RPCs (record_po_receipt, convert_receipt_to_bill, record_vendor_payment)
// enforce the same rules server-side; these helpers drive what the screens show.

export type ShipVariance = 'exact' | 'over' | 'under';
export type BillStatus = 'none' | 'open' | 'partial' | 'paid';

const cents = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function canManageVendorBills(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('accounting');
}

export function canRecordReceipts(roles: string[]): boolean {
  return canManageVendorBills(roles) || roles.includes('production');
}

/** Compare everything received so far on a PO line with what was ordered. */
export function shipVariance(ordered: number, receivedTotal: number): ShipVariance {
  if (receivedTotal > ordered) return 'over';
  if (receivedTotal < ordered) return 'under';
  return 'exact';
}

/** Pieces still expected on a line (never negative; short-closed pieces are not expected). */
export function openQuantity(ordered: number, received: number, shortClosed = 0): number {
  return Math.max(0, ordered - received - shortClosed);
}

/** Pieces received beyond the order quantity. */
export function overShippedQuantity(ordered: number, received: number): number {
  return Math.max(0, received - ordered);
}

export interface ReceiptLineAmount { quantity_received: number; unit_cost: number }

/** Bill subtotal for one receipt: only what arrived on that receipt, at PO cost. */
export function receiptSubtotal(lines: ReceiptLineAmount[]): number {
  return cents(lines.reduce((s, l) => s + (Number(l.quantity_received) || 0) * (Number(l.unit_cost) || 0), 0));
}

export function billTotal(subtotal: number, tax = 0, shipping = 0): number {
  return cents(cents(subtotal) + cents(tax) + cents(shipping));
}

/** A receipt can become a bill only once. */
export function canBillReceipt(receipt: { is_billed: boolean }): boolean {
  return !receipt.is_billed;
}

export function billBalance(total: number, paid: number): number {
  return Math.max(0, cents(total - paid));
}

export function billStatus(receipt: { is_billed: boolean; bill_total: number | null; bill_amount_paid: number | null }): BillStatus {
  if (!receipt.is_billed) return 'none';
  const total = cents(receipt.bill_total || 0);
  const paid = cents(receipt.bill_amount_paid || 0);
  if (paid <= 0) return total <= 0 ? 'paid' : 'open';
  return paid + 0.004 >= total ? 'paid' : 'partial';
}

/** Overall bill state for a PO with many receipts. */
export function poBillStatus(receipts: Array<{ is_billed: boolean; bill_total: number | null; bill_amount_paid: number | null }>): BillStatus {
  const billed = receipts.filter(r => r.is_billed);
  if (billed.length === 0) return 'none';
  const states = billed.map(billStatus);
  if (states.every(s => s === 'paid')) return 'paid';
  if (states.some(s => s === 'paid' || s === 'partial')) return 'partial';
  return 'open';
}

/** Most that can still be paid on a PO: the larger of the PO total and its billed total, less payments. */
export function maxPayment(poTotal: number, billedTotal: number, paidSoFar: number): number {
  return Math.max(0, cents(Math.max(cents(poTotal), cents(billedTotal)) - cents(paidSoFar)));
}

export interface OpenBill { id: string; balance: number }
export interface Allocation { billId: string | null; amount: number }

/**
 * Split a payment across open bills, earliest first. Whatever is left is an advance (billId null)
 * and is applied to the next bill when it is entered.
 */
export function allocatePayment(amount: number, openBills: OpenBill[]): Allocation[] {
  let left = cents(amount);
  const out: Allocation[] = [];
  for (const bill of openBills) {
    if (left <= 0) break;
    const take = Math.min(left, cents(bill.balance));
    if (take > 0) { out.push({ billId: bill.id, amount: cents(take) }); left = cents(left - take); }
  }
  if (left > 0) out.push({ billId: null, amount: left });
  return out;
}

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  none: 'No bill', open: 'Open', partial: 'Partially paid', paid: 'Paid',
};
