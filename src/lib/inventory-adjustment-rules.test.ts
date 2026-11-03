import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustmentEntry, balancingLine, computeAdjustment, journalTotals, netChange } from './inventory-adjustment-rules.ts';

test('quantity change moves value at the per-item cost', () => {
  const r = computeAdjustment(10, 100, 7, null);
  assert.equal(r.newValue, 700);
  assert.equal(r.valueChange, -300);
});

test('a typed value becomes a new per-item cost', () => {
  const r = computeAdjustment(10, 100, null, 1200);
  assert.equal(r.newUnitCost, 120);
  assert.equal(r.newQuantity, 10);
  assert.equal(r.valueChange, 200);
});

test('on-hand quantity cannot go below 0', () => {
  assert.ok(computeAdjustment(5, 10, -1, null).error);
});

test('value must be 0 when quantity is 0', () => {
  assert.ok(computeAdjustment(5, 10, 0, 50).error);
  assert.equal(computeAdjustment(5, 10, 0, null).newValue, 0);
});

test('a decrease credits Inventory Asset and debits the offset', () => {
  assert.deepEqual(adjustmentEntry(-300), { inventory: { debit: 0, credit: 300 }, offset: { debit: 300, credit: 0 } });
});

test('an increase debits Inventory Asset and credits the offset', () => {
  assert.deepEqual(adjustmentEntry(200), { inventory: { debit: 200, credit: 0 }, offset: { debit: 0, credit: 200 } });
});

test('many items post as one net entry', () => {
  const net = netChange([computeAdjustment(10, 100, 7, null), computeAdjustment(2, 50, 4, null)]);
  assert.equal(net, -200);
  assert.equal(adjustmentEntry(0), null);
});

test('journal balancing pre-fills the difference', () => {
  assert.deepEqual(balancingLine([{ debit: 150 }, { credit: 100 }]), { debit: 0, credit: 50 });
  assert.equal(journalTotals([{ debit: 50 }, { credit: 50 }]).balanced, true);
  assert.equal(journalTotals([{ debit: 50 }, { credit: 40 }]).balanced, false);
});
