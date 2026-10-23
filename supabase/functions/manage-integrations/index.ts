import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { isProvider, maskValue, PROVIDERS, type KeyMode, stripeKeyMode, validateIntegration } from '../_shared/integration-rules.ts';
import { adminClient, encryptSecrets, getCaller, getCompanyIntegration } from '../_shared/tenant-integrations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// FedEx keys carry no prefix, so the mode is found by asking which FedEx sign-in accepts them.
async function detectFedExMode(apiKey: string, secret: string): Promise<KeyMode | null> {
  for (const [mode, base] of [['live', 'https://apis.fedex.com'], ['sandbox', 'https://apis-sandbox.fedex.com']] as const) {
    try {
      const r = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: apiKey, client_secret: secret }).toString(),
      });
      await r.body?.cancel();
      if (r.ok) return mode;
    } catch { /* try next */ }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const caller = await getCaller(req);
    if (!caller) return json({ error: 'Please sign in.' }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const admin = adminClient();

    // Publishable Stripe key for the caller's own company (safe to show in the browser).
    if (action === 'publishable') {
      if (!caller.companyId) return json({ publishable_key: null });
      const { data } = await admin.from('company_integrations').select('public_config')
        .eq('company_id', caller.companyId).eq('provider', 'stripe').maybeSingle();
      return json({ publishable_key: (data?.public_config as any)?.publishable_key ?? null });
    }

    // Everything else: only an admin, only for their own company.
    if (!caller.roles.includes('admin')) return json({ error: 'Only company admins can manage integration keys.' }, 403);
    if (!caller.companyId) return json({ error: 'Your account is not linked to a company.' }, 400);
    const companyId = caller.companyId;

    if (action === 'status') {
      const { data } = await admin.from('company_integrations').select('provider, public_config, updated_at').eq('company_id', companyId);
      const status: Record<string, unknown> = {};
      for (const p of Object.keys(PROVIDERS)) {
        const row = (data ?? []).find((r: any) => r.provider === p);
        status[p] = row
          ? { configured: true, mode: row.public_config?.mode ?? 'unknown', masked: row.public_config?.masked ?? {}, updated_at: row.updated_at }
          : { configured: false };
      }
      return json({ status });
    }

    if (!isProvider(body?.provider)) return json({ error: 'Unknown provider.' }, 400);
    const provider = body.provider;

    if (action === 'remove') {
      await admin.from('company_integrations').delete().eq('company_id', companyId).eq('provider', provider);
      return json({ ok: true });
    }

    if (action === 'save') {
      const incoming = (body.values ?? {}) as Record<string, unknown>;
      // Blank fields keep the currently saved value, so one key can be replaced on its own.
      const existing = await getCompanyIntegration(companyId, provider).catch(() => null);
      const values: Record<string, string> = {};
      for (const f of PROVIDERS[provider].fields) {
        const v = typeof incoming[f.name] === 'string' ? (incoming[f.name] as string).trim() : '';
        values[f.name] = v || existing?.values[f.name] || '';
      }
      const err = validateIntegration(provider, values);
      if (err) return json({ error: err }, 400);

      let mode: KeyMode = 'unknown';
      if (provider === 'stripe') mode = stripeKeyMode(values.secret_key);
      if (provider === 'fedex') {
        const m = await detectFedExMode(values.api_key, values.secret_key);
        if (!m) return json({ error: 'FedEx did not accept these keys (checked both sandbox and live).' }, 400);
        mode = m;
      }

      const secretVals: Record<string, string> = {};
      const publicCfg: Record<string, unknown> = { mode, masked: {} };
      for (const f of PROVIDERS[provider].fields) {
        if (f.secret) {
          secretVals[f.name] = values[f.name];
          (publicCfg.masked as Record<string, string>)[f.name] = maskValue(values[f.name]);
        } else {
          publicCfg[f.name] = values[f.name];
          (publicCfg.masked as Record<string, string>)[f.name] = values[f.name];
        }
      }
      const { ciphertext, iv } = await encryptSecrets(secretVals);
      const { error } = await admin.from('company_integrations').upsert(
        { company_id: companyId, provider, encrypted_secrets: ciphertext, encryption_iv: iv, public_config: publicCfg, updated_by: caller.userId },
        { onConflict: 'company_id,provider' },
      );
      if (error) throw error;
      return json({ ok: true, mode });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('manage-integrations error:', e instanceof Error ? e.message : e);
    return json({ error: 'Could not process the request.' }, 500);
  }
});
