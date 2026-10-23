# Tenant Integrations Manager (per-company API keys)

Let each company (tenant) admin enter their own Stripe, FedEx, UPS, USPS, Mouser, and DigiKey keys in Settings. Keys are encrypted at rest, decrypted only inside Edge Functions at call time. Tenants never touch Supabase. Sandbox vs live is just whichever keys they paste.

**Fallback rule (important):** the platform-level env keys belong to the platform owner's company only. Edge Functions resolve the owning company first and use ONLY that company's keys. If a tenant has no key for a provider, that provider is "not configured" for them — the UI shows a setup prompt and no API call is made. A tenant's payment or shipment can never silently bill the platform owner's (or another tenant's) account. The env fallback applies only when the owning company IS the platform company, preserving current behavior for your own operations.

## Phase 1 — Encrypted storage (one migration)

- Enable `pgcrypto`.
- Create `private.app_secrets` table holding one platform master encryption key (generated server-side; no grants to anon/authenticated — readable only by SECURITY DEFINER functions).
- Create `public.company_integrations` (one row per company):
  - Plaintext: `stripe_publishable_key` (safe to expose — it ships to browsers anyway).
  - Encrypted BYTEA columns (AES-256 via `pgp_sym_encrypt`): `stripe_secret_key`, `fedex_api_key`, `fedex_secret_key`, `fedex_account`, `ups_client_id`, `ups_client_secret`, `ups_account_number`, `usps_client_id`, `usps_client_secret`, `usps_account_id`, `mouser_api_key`, `digikey_client_id`, `digikey_client_secret`.
  - GRANTs + RLS: no direct table access for anyone; all access through RPCs.
- SECURITY DEFINER RPCs:
  - `set_company_integrations(keys jsonb)` — caller must be `admin` of their own company (via `has_role` + profile `company_id`); encrypts and upserts only that company's row; blank values leave existing keys untouched.
  - `get_company_integrations_status()` — returns booleans ("is set") + masked publishable key for the caller's company. Never returns secret material.
  - `get_company_integrations_keys(p_company_id uuid)` — decrypts and returns keys; executable only by `service_role` (Edge Functions), never by authenticated users.

## Phase 2 — Shared resolver for Edge Functions

- New `supabase/functions/_shared/tenant-integrations.ts`:
  - `resolveIntegrationKeys(adminClient, companyId)` → decrypted tenant keys, or `null`.
  - Fallback: when a tenant has no key for a provider, use the platform `Deno.env` key (current behavior preserved).

## Phase 3 — Wire Edge Functions (24 functions)

- Stripe (12 functions: charge-saved-card, create-payment-intent, get-stripe-payment-methods, create-stripe-customer, sync-stripe-customers, update-stripe-customer, link-stripe-customer, batch-create-stripe-customers, create-stripe-setup-intent, create-stripe-setup-session, create-stripe-checkout, detach-stripe-payment-method, process-token-payment, stripe-webhook): resolve the owning `company_id` from the order/customer in the request, then use that company's key.
- Carriers (get-fedex-rates, get-ups-rates, get-usps-rates, create-/void- shipments, check-fedex-tracking, check-usps-eps-balance, get-all-carrier-rates, get-available-carriers): resolve company from the shipment/order; FedEx sandbox vs prod decided by which keys the tenant saved (a `use_sandbox` boolean column per carrier row, default false).
- Suppliers (mouser-submit-order, mouser-check-order-status, digikey-submit-order, digikey-check-order-status, digikey-get-token, weekly-component-price-update): resolve company from the purchase order.
- `get-available-carriers` reports a carrier as configured when the tenant OR platform fallback has keys.

## Phase 4 — Settings UI

- Extend `src/components/settings/SystemSettings.tsx` with an "Integrations & API Keys" section (visible to company admins only):
  - One collapsible card per provider (Stripe, FedEx, UPS, USPS, Mouser, DigiKey).
  - Password inputs, "Configured" badges from `get_company_integrations_status`, per-carrier sandbox toggle.
  - Client-side validation: Stripe `pk_`/`sk_` prefixes must both be test or both live; warn on mismatch.
  - Save calls `set_company_integrations`; secrets travel only browser → RPC → encrypted column.
- `useStripePublishableKey` switches to the tenant's publishable key from the integrations status (fallback: existing `system_settings` value).

## Phase 5 — Tests & verification

- Unit tests for pure helpers: key masking, pk/sk mode-match validation, env-fallback resolution logic.
- Migration applied via the migration tool; Edge Functions deploy automatically.
- Verify: save test keys as an admin, confirm status badges appear, confirm a Stripe call succeeds with tenant keys.

## Explicitly out of scope

- No Stripe Connect OAuth (tenants paste their own keys).
- No change to PCI posture: card data still never touches the app; only API keys are stored.
- Platform env keys stay in place as fallback; nothing existing is removed.
