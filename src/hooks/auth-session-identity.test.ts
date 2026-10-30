import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import { nextAuthUser } from './auth-session-identity';

const u = (id: string) => ({ id }) as User;

test('keeps the same object on a routine renewal for the same account', () => {
  const prev = u('a');
  assert.equal(nextAuthUser(prev, u('a')), prev);
});
test('switches when a different account signs in', () => {
  assert.equal(nextAuthUser(u('a'), u('b'))?.id, 'b');
});
test('clears on sign out', () => {
  assert.equal(nextAuthUser(u('a'), null), null);
});
