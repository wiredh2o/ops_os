import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { notificationAllowed, contactCanAttempt, automaticAttemptDue, MANDATORY_NOTIFICATION_KINDS } from './notification-rules';
test('off means both preferences false, without a master switch', () => {
  assert.equal(notificationAllowed('account', false, true), false);
  assert.equal(notificationAllowed('marketing', true, false), false);
  assert.equal(notificationAllowed('account', true, false), true);
  assert.equal(notificationAllowed('marketing', false, true), true);
});
for (const kind of MANDATORY_NOTIFICATION_KINDS) test(`${kind} is mandatory with both preferences off`, () => assert.equal(notificationAllowed(kind, false, false), true));
test('five contact failures block all attempts', () => {
  assert.equal(contactCanAttempt(4), true);
  assert.equal(contactCanAttempt(5), false);
  assert.equal(contactCanAttempt(0), true);
});
test('automatic attempts wait 24 hours and stop at three', () => {
  assert.equal(automaticAttemptDue(1, 0, 86400000 - 1), false);
  assert.equal(automaticAttemptDue(2, 0, 86400000), true);
  assert.equal(automaticAttemptDue(3, 0, 86400000), false);
});