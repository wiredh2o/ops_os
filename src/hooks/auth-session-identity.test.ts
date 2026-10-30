import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { nextAuthUser } from './auth-session-identity';

const u = (id: string) => ({ id }) as User;

describe('nextAuthUser', () => {
  it('keeps the same object on a routine renewal for the same account', () => {
    const prev = u('a');
    expect(nextAuthUser(prev, u('a'))).toBe(prev);
  });
  it('switches when a different account signs in', () => {
    expect(nextAuthUser(u('a'), u('b'))?.id).toBe('b');
  });
  it('clears on sign out', () => {
    expect(nextAuthUser(u('a'), null)).toBeNull();
  });
});
