# Tasks
## Shipment packing slips
- [x] Remove printing from Customer Orders and add it to active Shipping Queue cards with allocated quantities and ship-to address.
- [x] Retain printing in the shipping Packing step and test shipment data (43 focused tests pass; browser print document checked).
- [ ] Verify printing from a real signed-in shipment card — external Supabase has no managed browser session.
## External notification preferences
- [x] Add preferences and company-admin employee locks with server-side enforcement.
- [x] Add own preference settings and staff failure list with manual retry.
- [x] Integrate existing sends and mandatory account/RMA/payment events; bounded retries and contact blocking.
- [x] Test notification rules and available signed-out flow; 36 focused notification/RMA/tax tests passed.
- [ ] Verify actual email/text delivery and retries — user will add Resend/Twilio credentials later; Stripe failure webhook subscriptions also require configuration.
- [ ] Verify signed-in preference saving, employee locks and staff failure list — external Supabase has no managed browser session.
## Sales tax jurisdictions
- [ ] Add jurisdiction settings, ZIP assignments, authoritative calculation and order tax snapshots.
- [x] Integrate order forms, cards and invoice/receipt tax lines; scoped company visibility.
- [ ] Add monthly ZIP change review and management for Admin/Accounting.
- [ ] Test eligibility, precedence, fees and access; identify live checks blocked by external sign-in.
## External RMA workflow
- [x] Add company-scoped requests, staff approval/appointment invitation, and requester status access.
- [x] Feed issued RMA data into existing receiving packages without rebuilding unboxing or diagnosis.
- [x] Add return tracking; limit purchased return carriers to UPS/FedEx.
- [ ] Enable paid UPS/FedEx return labels — blocked by missing Stripe/carrier credentials and required live-payment/carrier validation; no mock labels or charges are enabled.
- [x] Test authorization and lifecycle rules (57 tests); record unavailable signed-in checks.
- [ ] Verify signed-in RMA submit/review/receipt/status end-to-end — external Supabase has no managed test session; user preview checks required.

- [x] Read existing role and marketing flags.
- [x] Add admin-only per-user marketing revenue, margin and supplier-price flags if missing, independently of View switches.
- [x] Hide marketing financial fields inside permitted tabs unless the corresponding per-user flag is enabled.
- [x] Filter existing staff triggers and content using server-loaded roles; handle inaccessible URLs safely.
- [x] Test role combinations and verify available signed-out navigation (23 tests passed; no browser errors).
- [ ] Verify signed-in marketing visibility and admin flag saving end-to-end — blocked by external Supabase without a managed test session.

## Queue lifecycle and archives
- [x] Archive shipping cards on carrier possession or customer pickup, independently of unpaid balances.
- [x] Keep repair packages open with subordinate unresolved items until every item is shipped or scrapped.
- [x] Add searchable, customer-filtered archives using existing cards; preserve orphan manual attention and add no reset/clear/bulk-delete controls.
- [x] Test lifecycle rules and verify available live views — 57 focused regression tests pass; build OK; both staff URLs retain sign-in protection with no runtime errors.
- [ ] Verify signed-in queue movement and archives end-to-end — blocked by external Supabase without a managed test session.## Drop-ship addresses
- [x] Distributor-owned reusable drop-ship addresses with USPS-eligible flag and optional email/phone.
- [x] Select/save in order form; show on order cards; label uses only the car wash name; USPS blocked unless eligible.
- [x] Shipment notice to drop-ship email/phone when a label is created (delivery awaits Resend/Twilio keys).
- [ ] Verify signed-in order → label flow — external Supabase has no managed test session.
- [ ] Distributor self-service web ordering screen does not exist yet; database access is ready for it.
