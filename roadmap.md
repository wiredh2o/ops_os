# Tasks
- [x] Read existing role and marketing flags.
- [x] Add admin-only per-user marketing revenue, margin and supplier-price flags if missing, independently of View switches.
- [x] Hide marketing financial fields inside permitted tabs unless the corresponding per-user flag is enabled.
- [x] Filter existing staff triggers and content using server-loaded roles; handle inaccessible URLs safely.
- [x] Test role combinations and verify available signed-out navigation (23 tests passed; no browser errors).
- [ ] Verify signed-in marketing visibility and admin flag saving end-to-end — blocked by external Supabase without a managed test session.

## Queue lifecycle and archives
- [ ] Archive shipping cards on carrier possession or customer pickup, independently of unpaid balances.
- [ ] Keep repair packages open with subordinate unresolved items until every item is shipped or scrapped.
- [ ] Add searchable, customer-filtered archives using existing cards; preserve orphan manual attention and add no reset/clear/bulk-delete controls.
- [ ] Test lifecycle rules and verify available live views.