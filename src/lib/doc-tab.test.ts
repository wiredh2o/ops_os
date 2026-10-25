import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { docTabRows, formatDocTabDate } from './doc-tab';

test('doc tab date reads like 23OCT26', () => {
  assert.equal(formatDocTabDate(new Date(2026, 9, 23)), '23OCT26');
});

test('doc tab total = shipping + special + handling', () => {
  const { right } = docTabRows({
    invoice: '50762', customer: 'Acme', date: new Date(2026, 9, 23), weightLbs: 4,
    shipping: 12.98, special: 23.33, handling: 0,
  });
  assert.equal(right.find(([k]) => k === 'Total')?.[1], '36.31');
});
