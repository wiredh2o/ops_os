// Pure credit/terms rules shared by screens and tests. The server enforces
// the same rules (RLS, get_customer_credit, credit-hold trigger).

export interface PaymentTerm {
  code: string;
  label: string;
  net_days: number;
  deposit_percent: number;
  uses_credit: boolean;
  active: boolean;
  sort_order: number;
}

export const DEFAULT_CREDIT_LIMIT = 0;
export const DEFAULT_TERM_CODE = 'due_in_advance';

const MANAGE_ROLES = ['admin', 'accounting'];
const VIEW_ROLES = [...MANAGE_ROLES, 'sales_support', 'marketing'];

/** Admin/accounting (incl. the tenant admin) may set limits and terms. */
export const canManageCredit = (roles: readonly string[]) => roles.some((r) => MANAGE_ROLES.includes(r));
/** Sales and marketing may also see limit and available credit. */
export const canViewCredit = (roles: readonly string[]) => roles.some((r) => VIEW_ROLES.includes(r));

export const availableCredit = (limit: number, used: number) => round2(limit - used);

/** On hold only when the customer's term uses credit and usage exceeds the limit. */
export const isOnCreditHold = (term: Pick<PaymentTerm, 'uses_credit'> | undefined, limit: number, used: number) =>
  Boolean(term?.uses_credit) && used > limit;

/** Would this new order push the customer over their limit? */
export const orderExceedsCredit = (term: Pick<PaymentTerm, 'uses_credit'> | undefined, available: number, orderTotal: number) =>
  Boolean(term?.uses_credit) && orderTotal > available;

export const findTerm = (terms: readonly PaymentTerm[], code: string | null | undefined) =>
  terms.find((t) => t.code === (code || DEFAULT_TERM_CODE));

/** Deposit fraction (0..1) a term requires before shipping work, e.g. 50/50 = 0.5. */
export const depositFraction = (term: Pick<PaymentTerm, 'deposit_percent'> | undefined) =>
  Math.min(Math.max(Number(term?.deposit_percent ?? 100), 0), 100) / 100;

export type TermKind = 'prepay' | 'deposit' | 'net';
/** How a term is collected: full prepay, partial deposit, or billed on net days. Unknown terms are treated as prepay. */
export const termKind = (term: Pick<PaymentTerm, 'deposit_percent'> | undefined): TermKind => {
  if (!term) return 'prepay';
  const pct = Number(term.deposit_percent);
  if (pct >= 100) return 'prepay';
  return pct > 0 ? 'deposit' : 'net';
};

export const parseCreditLimit = (input: string): number | null => {
  const n = Number(String(input).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
};

export const formatMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
