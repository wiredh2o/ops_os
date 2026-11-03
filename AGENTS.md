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
- Tenant integration keys (Stripe, FedEx, UPS, USPS, Mouser, DigiKey) live AES-GCM encrypted per company in service-only company_integrations, saved via the admin-only manage-integrations function; edge functions read them through _shared/tenant-integrations.ts with no environment fallback, so no request can use another company's account. Sandbox/live is detected from the keys themselves, never a toggle.
- Remixes do not copy secrets. All third-party keys (Stripe, FedEx, UPS, USPS, Mouser, DigiKey, Twilio, Resend) must be re-entered by the user via secure secret forms after the backend is connected.
- Platform env secrets: INTEGRATIONS_ENCRYPTION_KEY, CHECKOUT_COMPLETED_SANDBOX_WEBHOOK_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, RESEND_API_KEY, PUBLIC_SITE_URL.
- Distributor drop-ship addresses live in their own owner-scoped table, never in car-wash company addresses; orders and invoices keep a server-built snapshot, and database triggers enforce ownership, USPS eligibility and direct-contact shipment notices so client screens cannot bypass them.
- Payment terms come from the payment_terms settings table and behave by attributes (deposit percent, net days, uses credit), never hard-coded codes; credit limits live in their own role-restricted table, are written only through set_customer_credit_terms, and credit hold is computed live server-side and enforced by a production_orders trigger plus a label-function precheck so no screen can ship a held order.

- Available credit counts every unpaid invoice's items, fees, tax and stored shipping (one invoice = one shipment; carrier rate then label price), plus open orders' uninvoiced share of tax and estimated shipping, all in customer_credit_used so holds and displays agree; paid-invoice shipping is locked by trigger.
- PO item receipts (po_receipts/po_receipt_lines) are the billing unit: a receipt becomes a bill once via convert_receipt_to_bill, and all receipt, bill, payment and check writes go through private-schema RPCs with public invoker wrappers so billed-once, no-overpay and earliest-bill-first rules can't be bypassed.
- Vendor checks render client-side with pdf-lib and the bundled GnuMICR font (public/fonts); layout math lives in src/lib/check-layout.ts so MICR field positions stay testable.
- Vendor checks are numbered from the check_register (unique per account, voids kept) and issued with a client request key so retries replay instead of paying twice; next_check_number can never rewind onto a used number.
