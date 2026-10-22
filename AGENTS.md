# Project Notes

- Packing slips share allocated production-order item mapping between active shipping cards and the shipping modal; customer-order requests are never a print source, preventing partial-shipment quantity errors.

- Staff tab selection is driven by explicit `/staff/:tab` routes in App.tsx and the current pathname in Index.tsx, so direct links, refreshes, and browser history preserve the selected screen.
- Staff tab filtering uses server-loaded user_roles in AuthProvider and the pure staff-tab-access helper; marketing View access uses has_permission so tab visibility never depends on editable profile metadata or browser storage.
- Staff financial displays use FinancialGuard with independently loaded per-user profile flags; role-level View permissions must never unlock those displays.
- Queue archives are derived from physical handoff or complete item resolutions without deleting records; shared lifecycle predicates keep queue entry points consistent, and paginated relation reads prevent incomplete archives.
- External RMAs use authorized company-scoped RPCs and issued inbound packages; receipt updates that package instead of duplicating it, and the existing unboxing and diagnosis flows remain authoritative.
- Tax jurisdictions and ZIP assignments are authoritative settings; server-side order triggers calculate snapshots, paid invoices lock them, and all displays consume separate tax lines instead of a global rate. Private-schema tax RPC implementations retain role/company checks while public wrappers use invoker permissions.
- Monthly ZIP comparison uses a free community directory, transactional completeness guards and review alerts; source changes never overwrite ZIP jurisdiction assignments.
- External notifications use a service-only outbox and private authorization RPCs; a leased worker applies recipient preferences, contact blocking and bounded retries so delivery credentials can be added independently.

## Backend
- This project is a remix; it runs on the user's own Supabase project named "Ops_OS" (connected manually in the editor, not from chat). The baked-in client URL may still point at the original project's Supabase — it must be repointed after Ops_OS is connected.
- Never suggest Lovable Cloud here; the user chose BYO Supabase.
- All 323 migrations in `supabase/migrations/` define the full schema and must be applied to Ops_OS on connect.

## Secrets
- Remixes do not copy secrets. All third-party keys (Stripe, FedEx, UPS, USPS, Mouser, DigiKey, Twilio, Resend) must be re-entered by the user via secure secret forms after the backend is connected.
- Edge functions expect: STRIPE_SECRET_KEY, CHECKOUT_COMPLETED_SANDBOX_WEBHOOK_SECRET, FEDEX_API_KEY, FEDEX_SECRET_KEY, FEDEX_ACCOUNT, FEDEX_SANDBOX_* variants, UPS_CLIENT_ID, UPS_CLIENT_SECRET, UPS_ACCOUNT_NUMBER, USPS_CLIENT_ID, USPS_CLIENT_SECRET, USPS_ACCOUNT_ID, MOUSER_ALLBUT_SEARCH_KEY, DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, RESEND_API_KEY, PUBLIC_SITE_URL.
- Distributor drop-ship addresses live in their own owner-scoped table, never in car-wash company addresses; orders and invoices keep a server-built snapshot, and database triggers enforce ownership, USPS eligibility and direct-contact shipment notices so client screens cannot bypass them.
