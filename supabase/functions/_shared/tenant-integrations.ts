import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chooseCompany, type KeyMode, type Provider, PROVIDERS, toEnvKeys } from './integration-rules.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Array.from(atob(s), (c) => c.charCodeAt(0)));
}

async function masterKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('INTEGRATIONS_ENCRYPTION_KEY');
  if (!raw) throw new Error('Integration encryption is not set up.');
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(raw));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecrets(values: Record<string, string>): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await masterKey(), enc.encode(JSON.stringify(values)));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}

export async function decryptSecrets(ciphertext: string, iv: string): Promise<Record<string, string>> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await masterKey(), unb64(ciphertext));
  return JSON.parse(dec.decode(pt));
}

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** Returns the caller's user id and company when they are signed in. */
export async function getCaller(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const uid = data.user.id;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from('profiles').select('company_id').eq('id', uid).maybeSingle(),
    admin.from('user_roles').select('role').eq('user_id', uid),
  ]);
  const roleList = (roles ?? []).map((r: { role: string }) => r.role);
  const staff = roleList.some((r) => ['admin', 'sales_support', 'production', 'accounting', 'tech_support'].includes(r));
  return { userId: uid, companyId: (profile?.company_id as string | null) ?? null, roles: roleList, isStaff: staff };
}

async function resolveCompany(req: Request, provider: Provider): Promise<string | null> {
  const caller = await getCaller(req).catch(() => null);
  const staffCompany = caller?.isStaff ? caller.companyId : null;
  if (staffCompany) return staffCompany;
  const { data } = await adminClient().from('company_integrations').select('company_id').eq('provider', provider);
  return chooseCompany(null, (data ?? []).map((r: { company_id: string }) => r.company_id));
}

/** Decrypted values for one provider of one company, or null when not configured. */
export async function getCompanyIntegration(companyId: string, provider: Provider) {
  const { data } = await adminClient()
    .from('company_integrations')
    .select('encrypted_secrets, encryption_iv, public_config')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .maybeSingle();
  if (!data) return null;
  const secrets = await decryptSecrets(data.encrypted_secrets, data.encryption_iv);
  const pub = (data.public_config ?? {}) as Record<string, unknown>;
  const values: Record<string, string> = { ...secrets };
  for (const f of PROVIDERS[provider].fields) if (!f.secret && typeof pub[f.name] === 'string') values[f.name] = pub[f.name] as string;
  return { values, mode: (pub.mode as KeyMode) ?? 'unknown' };
}

/**
 * Loads the requesting company's keys under the names existing functions read
 * (e.g. STRIPE_SECRET_KEY). Missing providers are simply absent — there is no
 * platform or environment fallback, so a request can never bill another account.
 */
export async function loadTenantKeys(req: Request, providers: Provider[]): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const p of providers) {
    try {
      const companyId = await resolveCompany(req, p);
      if (!companyId) continue;
      const row = await getCompanyIntegration(companyId, p);
      if (row) Object.assign(out, toEnvKeys(p, row.values, row.mode));
    } catch (e) {
      console.error(`Could not load ${p} keys:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
