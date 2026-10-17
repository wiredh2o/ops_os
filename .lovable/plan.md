# Connect Ops_OS to this app

## Your step (only you can do this)
1. In the Lovable editor, open **Connectors → Supabase** (or the Cloud view, then "Already have a Supabase project? Connect it here").
2. Sign in to Supabase in the popup and pick the **Ops_OS** project.
3. Come back to chat and say "connected".

## My steps after you connect
1. Point the app's connection settings at Ops_OS, replacing the original project's address.
2. Since Ops_OS is already populated, check its tables against this app's expected setup instead of re-applying everything. Only missing pieces get added; no data gets overwritten.
3. Deploy the background services (payments, shipping rates, labels, emails, texts, vendor ordering) to Ops_OS.
4. Open secure forms where you enter the keys for Stripe, FedEx, UPS, USPS, Mouser, DigiKey, Twilio and Resend, plus your site address.
5. Sign in on the sign-in page and load orders, customers and inventory to confirm real data shows up.

## Technical details
- Update the client URL and anon key, then regenerate the types from the live schema.
- Diff the live schema against `supabase/migrations/`. Apply only the missing migrations, and mark the ones already applied.
- Deploy every function in `supabase/functions/`, then request the secrets listed in the project notes.
