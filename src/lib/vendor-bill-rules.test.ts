import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocatePayment, billStatus, billTotal, canBillReceipt, canManageVendorBills, canRecordReceipts,
  maxPayment, openQuantity, overShippedQuantity, poBillStatus, receiptSubtotal, shipVariance,
} from './vendor-bill-rules.ts';

test('only admin and accounting can enter bills and payments', () => {
  assert.equal(canManageVendorBills(['admin']), true);
  assert.equal(canManageVendorBills(['accounting']), true);
  assert.equal(canManageVendorBills(['production']), false);
  assert.equal(canRecordReceipts(['production']), true);
  assert.equal(canRecordReceipts(['sales_support']), false);
});

test('bill covers only the received quantity on its receipt', () => {
  assert.equal(receiptSubtotal([{ quantity_received: 6, unit_cost: 2.5 }, { quantity_received: 1, unit_cost: 10 }]), 25);
  assert.equal(billTotal(25, 1.5, 8), 34.5);
});

test('a receipt can be billed only once', () => {
  assert.equal(canBillReceipt({ is_billed: false }), true);
  assert.equal(canBillReceipt({ is_billed: true }), false);
});

test('over-shipment: 12 received on an order of 10 is over by 2, nothing left open', () => {
  assert.equal(shipVariance(10, 12), 'over');
  assert.equal(overShippedQuantity(10, 12), 2);
  assert.equal(openQuantity(10, 12), 0);
});

test('under-shipment: 8 of 10 stays open for 2 unless short-closed', () => {
  assert.equal(shipVariance(10, 8), 'under');
  assert.equal(openQuantity(10, 8), 2);
  assert.equal(openQuantity(10, 8, 2), 0);
});

test('payment cannot exceed what is still owed', () => {
  assert.equal(maxPayment(100, 0, 30), 70);
  assert.equal(maxPayment(100, 120, 30), 90); // over-shipped bills raise the cap
});

test('payments apply to the earliest open bill first; remainder is an advance', () => {
  assert.deepEqual(allocatePayment(50, [{ id: 'a', balance: 20 }, { id: 'b', balance: 20 }]),
    [{ billId: 'a', amount: 20 }, { billId: 'b', amount: 20 }, { billId: null, amount: 10 }]);
  assert.deepEqual(allocatePayment(30, []), [{ billId: null, amount: 30 }]);
});

test('bill status follows payments', () => {
  assert.equal(billStatus({ is_billed: false, bill_total: null, bill_amount_paid: 0 }), 'none');
  assert.equal(billStatus({ is_billed: true, bill_total: 50, bill_amount_paid: 0 }), 'open');
  assert.equal(billStatus({ is_billed: true, bill_total: 50, bill_amount_paid: 20 }), 'partial');
  assert.equal(billStatus({ is_billed: true, bill_total: 50, bill_amount_paid: 50 }), 'paid');
  assert.equal(poBillStatus([
    { is_billed: true, bill_total: 50, bill_amount_paid: 50 },
    { is_billed: true, bill_total: 40, bill_amount_paid: 0 },
  ]), 'partial');
});
