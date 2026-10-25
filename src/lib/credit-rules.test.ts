import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CREDIT_LIMIT, availableCredit, canManageCredit, canViewCredit,
  depositFraction, termKind, isOnCreditHold, orderExceedsCredit, parseCreditLimit,
  invoiceCreditShipping, openOrderCreditUsed, canInvoiceQuantity,
} from './credit-rules.ts';

const net30 = { uses_credit: true };
const prepay = { uses_credit: false };

test('default credit limit is $0.00', () => {
  assert.equal(DEFAULT_CREDIT_LIMIT, 0);
});

test('admin and accounting can manage credit; sales and marketing cannot', () => {
  assert.equal(canManageCredit(['admin']), true);
  assert.equal(canManageCredit(['accounting']), true);
  assert.equal(canManageCredit(['sales_support']), false);
  assert.equal(canManageCredit(['marketing']), false);
  assert.equal(canManageCredit(['car_wash_admin']), false);
});

test('sales and marketing can view credit; production and customers cannot', () => {
  assert.equal(canViewCredit(['sales_support']), true);
  assert.equal(canViewCredit(['marketing']), true);
  assert.equal(canViewCredit(['production']), false);
  assert.equal(canViewCredit(['distributor_admin']), false);
});

test('available credit is limit minus used', () => {
  assert.equal(availableCredit(1000, 250.5), 749.5);
  assert.equal(availableCredit(0, 10), -10);
});

test('hold only when term uses credit and used exceeds limit', () => {
  assert.equal(isOnCreditHold(net30, 1000, 1000.01), true);
  assert.equal(isOnCreditHold(net30, 1000, 1000), false);
  assert.equal(isOnCreditHold(prepay, 0, 5000), false);
});

test('hold releases once usage drops back within the limit', () => {
  assert.equal(isOnCreditHold(net30, 500, 600), true);
  assert.equal(isOnCreditHold(net30, 500, 400), false);
});

test('an order larger than available credit on terms exceeds credit', () => {
  assert.equal(orderExceedsCredit(net30, 100, 100.01), true);
  assert.equal(orderExceedsCredit(net30, 100, 100), false);
  assert.equal(orderExceedsCredit(prepay, 0, 100), false);
});

test('deposit fraction from term percent', () => {
  assert.equal(depositFraction({ deposit_percent: 50 }), 0.5);
  assert.equal(depositFraction({ deposit_percent: 0 }), 0);
});

test('credit limit input parsing', () => {
  assert.equal(parseCreditLimit('$1,250.555'), 1250.56);
  assert.equal(parseCreditLimit('-5'), null);
  assert.equal(parseCreditLimit(''), 0);
});

test('term kind comes from the deposit percent, unknown is prepay', () => {
  assert.equal(termKind({ deposit_percent: 100 }), 'prepay');
  assert.equal(termKind({ deposit_percent: 50 }), 'deposit');
  assert.equal(termKind({ deposit_percent: 0 }), 'net');
  assert.equal(termKind(undefined), 'prepay');
});
