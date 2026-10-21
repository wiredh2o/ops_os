# Tasks
## External RMA workflow
- [ ] Add company-scoped requests, staff approval/appointment invitation, and requester status access.
- [ ] Feed issued RMA data into existing receiving packages without rebuilding unboxing or diagnosis.
- [ ] Add return tracking and UPS/FedEx paid-label path; exclude USPS.
- [ ] Test authorization and lifecycle rules; record unavailable signed-in checks.

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
- [ ] Verify signed-in queue movement and archives end-to-end — blocked by external Supabase without a managed test session.