import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountInWords, isValidRoutingNumber, micrLine, micrCharX, partTops, PART_HEIGHT_IN, stubTotal, protectedAmount,
} from './check-layout.ts';

test('page splits into three equal parts: check on top third, two stubs below', () => {
  const t = partTops();
  assert.equal(t.check, 0);
  assert.ok(Math.abs(PART_HEIGHT_IN - 11 / 3) < 1e-9);
  assert.ok(Math.abs(t.stub2 - 22 / 3) < 1e-9);
});

test('amount in words', () => {
  assert.equal(amountInWords(1234.56), 'One Thousand Two Hundred Thirty-Four and 56/100');
  assert.equal(amountInWords(45), 'Forty-Five and 00/100');
  assert.equal(amountInWords(0.5), 'Zero and 50/100');
  assert.equal(amountInWords(1000000), 'One Million and 00/100');
  assert.equal(protectedAmount(1234.5), '**1,234.50');
});

test('routing number checksum', () => {
  assert.equal(isValidRoutingNumber('011000015'), true);
  assert.equal(isValidRoutingNumber('011000016'), false);
  assert.equal(isValidRoutingNumber('12345678'), false);
});

test('MICR line puts routing in positions 33-43 and account ending at 14', () => {
  const line = micrLine('011000015', '123456789', 1001);
  const at = (p: number) => line.find(c => c.position === p)?.char;
  assert.equal(at(43), 'A');
  assert.equal(at(33), 'A');
  assert.equal(at(34), '5');
  assert.equal(at(14), 'C');
  assert.equal(at(15), '9');
  assert.equal(at(13), undefined); // amount field blank for the bank
  assert.equal(line.filter(c => c.position >= 45).map(c => c.char).reverse().join(''), 'C001001C'.split('').reverse().join('').split('').reverse().join(''));
  assert.equal(micrCharX(1), 8.5 - 5 / 16 - 0.125);
});

test('stub total is the sum paid on this check', () => {
  assert.equal(stubTotal([
    { billNumber: 'A', poNumber: 'P', billDate: '', billAmount: 45, paid: 15 },
    { billNumber: 'B', poNumber: 'P', billDate: '', billAmount: 50, paid: 35 },
  ]), 50);
});
