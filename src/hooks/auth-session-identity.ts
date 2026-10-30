import type { User } from '@supabase/supabase-js';

/** Keep the existing user object when a session renewal refers to the same account. */
export function nextAuthUser(prev: User | null, incoming: User | null): User | null {
  if (prev && incoming && prev.id === incoming.id) return prev;
  return incoming;
}
