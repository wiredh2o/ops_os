// Pure, runtime-agnostic rules for tenant integration credentials.
// Shared by the edge functions and the frontend tests. No Deno / DOM APIs here.

export type Provider = 'stripe' | 'fedex' | 'ups' | 'usps' | 'mouser' | 'digikey';
export type KeyMode = 'sandbox' | 'live' | 'unknown';

export interface FieldDef {
  name: string;
  label: string;
  secret: boolean; // secret fields are encrypted and never returned
}

export const PROVIDERS: Record<Provider, { label: string; fields: FieldDef[] }> = {
  stripe: {
    label: 'Stripe',
    fields: [
      { name: 'publishable_key', label: 'Publishable Key', secret: false },
      { name: 'secret_key', label: 'Secret Key', secret: true },
    ],
  },
  fedex: {
    label: 'FedEx',
    fields: [
      { name: 'api_key', label: 'API Key', secret: true },
      { name: 'secret_key', label: 'Secret Key', secret: true },
      { name: 'account_number', label: 'Account Number', secret: true },
    ],
  },
  ups: {
    label: 'UPS',
    fields: [
      { name: 'client_id', label: 'Client ID', secret: true },
      { name: 'client_secret', label: 'Client Secret', secret: true },
      { name: 'account_number', label: 'Account Number', secret: true },
    ],
  },
  usps: {
    label: 'USPS',
    fields: [
      { name: 'client_id', label: 'Client ID', secret: true },
      { name: 'client_secret', label: 'Client Secret', secret: true },
      { name: 'account_id', label: 'Account (EPS) ID', secret: true },
    ],
  },
  mouser: {
    label: 'Mouser',
    fields: [{ name: 'api_key', label: 'Order API Key', secret: true }],
  },
  digikey: {
    label: 'DigiKey',
    fields: [
      { name: 'client_id', label: 'Client ID', secret: true },
      { name: 'client_secret', label: 'Client Secret', secret: true },
    ],
  },
};

export function isProvider(v: unknown): v is Provider {
  return typeof v === 'string' && v in PROVIDERS;
}

/** Stripe mode comes purely from the key prefix — no toggle. */
export function stripeKeyMode(key: string): KeyMode {
  if (/^(pk|sk|rk)_test_/.test(key)) return 'sandbox';
  if (/^(pk|sk|rk)_live_/.test(key)) return 'live';
  return 'unknown';
}

/** Returns an error message, or null when the submitted values are acceptable. */
export function validateIntegration(provider: Provider, values: Record<string, string>): string | null {
  const def = PROVIDERS[provider];
  for (const f of def.fields) {
    const v = (values[f.name] ?? '').trim();
    if (!v) return `${def.label} ${f.label} is required.`;
    if (v.length > 500) return `${def.label} ${f.label} is too long.`;
    if (/\s/.test(v)) return `${def.label} ${f.label} must not contain spaces.`;
  }
  if (provider === 'stripe') {
    const pk = values.publishable_key.trim();
    const sk = values.secret_key.trim();
    if (!pk.startsWith('pk_')) return 'Stripe Publishable Key must start with pk_test_ or pk_live_.';
    if (!/^(sk|rk)_/.test(sk)) return 'Stripe Secret Key must start with sk_test_ or sk_live_.';
    const pm = stripeKeyMode(pk);
    const sm = stripeKeyMode(sk);
    if (pm === 'unknown' || sm === 'unknown') return 'Stripe keys must be test (sandbox) or live keys.';
    if (pm !== sm) return 'Stripe keys do not match: one is a sandbox key and the other is a live key.';
  }
  if (provider === 'ups' && !/^[A-Za-z0-9]{6}$/.test(values.account_number.trim())) {
    return 'UPS Account Number must be 6 letters or digits.';
  }
  if (provider === 'fedex' && !/^\d{9,12}$/.test(values.account_number.trim())) {
    return 'FedEx Account Number must be 9 to 12 digits.';
  }
  return null;
}

/** Masked preview: only the last 4 characters are ever shown. */
export function maskValue(v: string): string {
  const t = v.trim();
  if (t.length <= 4) return '••••';
  return '••••' + t.slice(-4);
}

/**
 * Maps a company's decrypted values to the environment-style names the
 * existing functions read. Only the owning company's values are ever mapped;
 * there is no shared or platform fallback.
 */
export function toEnvKeys(
  provider: Provider,
  values: Record<string, string>,
  mode: KeyMode,
): Record<string, string> {
  switch (provider) {
    case 'stripe':
      return { STRIPE_SECRET_KEY: values.secret_key };
    case 'fedex': {
      const p = mode === 'live' ? 'FEDEX_' : 'FEDEX_SANDBOX_';
      return {
        [`${p}API_KEY`]: values.api_key,
        [`${p}SECRET_KEY`]: values.secret_key,
        [`${p}ACCOUNT`]: values.account_number,
      };
    }
    case 'ups':
      return {
        UPS_CLIENT_ID: values.client_id,
        UPS_CLIENT_SECRET: values.client_secret,
        UPS_ACCOUNT_NUMBER: values.account_number,
      };
    case 'usps':
      return {
        USPS_CLIENT_ID: values.client_id,
        USPS_CLIENT_SECRET: values.client_secret,
        USPS_ACCOUNT_ID: values.account_id,
      };
    case 'mouser':
      return { MOUSER_ALLBUT_SEARCH_KEY: values.api_key };
    case 'digikey':
      return { DIGIKEY_CLIENT_ID: values.client_id, DIGIKEY_CLIENT_SECRET: values.client_secret };
  }
}

/**
 * Decides which company's keys a request uses.
 * - A signed-in internal staff member always uses their own company.
 * - Otherwise (customer self-pay, scheduled jobs) only when exactly one company
 *   has that provider configured. Zero or several = refuse. Never guesses.
 */
export function chooseCompany(staffCompanyId: string | null, configuredCompanyIds: string[]): string | null {
  if (staffCompanyId) return staffCompanyId;
  const unique = Array.from(new Set(configuredCompanyIds));
  return unique.length === 1 ? unique[0] : null;
}
