# Finish connecting Ops_OS

Ops_OS is linked to the project, and its tables are already there. The app itself still points at the original project's backend, so sign-in and data pages won't reach Ops_OS until that's fixed.

## Steps
1. Point the app at Ops_OS so sign-in and all data pages use it.
2. Check that Ops_OS has everything the app expects (tables, rules, automations). Add only what's missing. Existing data stays untouched.
3. Deploy the 61 background services (payments, shipping rates and labels, emails, texts, vendor ordering) to Ops_OS.
4. Open secure forms for your Stripe, FedEx, UPS, USPS, Mouser, DigiKey, Twilio and Resend keys, plus your site address.
5. Sign in and confirm orders, customers and inventory load from Ops_OS.

## Technical details
- `src/integrations/supabase/client.ts` hardcodes the old ref `pnawosyjmvibwjpegnrs`. Switch it to the `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` env values (ref `tycaownqbhtexkvdkuor`).
- Change `supabase/config.toml` `project_id` to `tycaownqbhtexkvdkuor`.
- Compare the live functions, triggers and cron jobs against the migrations before applying any of them.
- Deploy all functions in `supabase/functions/`, then request the secrets listed in the project notes.
