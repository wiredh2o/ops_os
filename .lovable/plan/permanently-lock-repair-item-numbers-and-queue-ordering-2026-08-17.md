## Permanently Lock Repair Item Numbers and Queue Ordering

**Category:** Precision Work / Regression Prevention

### Confirmed behavior and cause

- Repair item numbers are stored as `inbound_package_items.unboxing_order`; the database already assigns them on insert and enforces non-null uniqueness within a package.
- Closing diagnosis emits a targeted refresh. The dashboard queue then replaces the complete local item with a partial `repair_items` row, which does not contain the package-link `unboxing_order`, so the number disappears from the UI even though it remains in the database.
- Packages are initially queried by `created_at` descending, while items currently sort by `unboxing_order` ascending. Some refresh paths rebuild these collections without consistently preserving those guarantees.
- A drag-and-drop prioritization modal currently permits manual ordering through `repair_items.priority_order`.

### Permanent fix

1. **Make assigned item identity immutable in the database**
   - Add a database trigger that rejects changes to an existing junction row's `package_id`, `repair_item_id`, or assigned `unboxing_order`.
   - Keep automatic assignment, non-null enforcement, and per-package uniqueness intact.
   - This makes an item's package and number permanent regardless of any future frontend regression.

2. **Preserve item numbers through every diagnosis refresh**
   - In `RepairOrderQueueKanban.tsx` and `InboundPackageCard.tsx`, merge refreshed repair fields into the existing local item instead of replacing the complete object.
   - Preserve `unboxing_order` and other package-link metadata on Save, Cancel, timer cleanup, and realtime refresh paths.
   - Replace truthy number fallbacks with explicit null-aware handling so missing metadata cannot be silently converted to `0` or `1`.

3. **Remove manual repair-queue reordering completely**
   - Remove the reorder button, tooltip, modal state, and modal rendering from the package card.
   - Delete `ItemPrioritizationModal.tsx` so drag-and-drop ordering cannot be reintroduced through another queue screen.
   - Remove the obsolete "set item priorities" instruction shown after opening a box.
   - Do not rewrite existing historical `priority_order` data; the repair queue will no longer read or update it for visual ordering.

4. **Enforce deterministic visual ordering on every queue path**
   - **Packages:** newest package first using `created_at` descending, with a stable ID tie-breaker.
   - **Items within each package:** opposite chronological direction—assigned item number ascending, so Item #1 is at the top and later-added items appear below it—with a stable ID tie-breaker.
   - Apply the same ordering after initial load, targeted updates, package refreshes, realtime updates, and on both dashboard and full-screen repair queues.
   - Sort copied arrays rather than mutating React state during render.

### Files

| File | Change |
|---|---|
| Database migration | Prevent changes to an assigned item's number, package, or repair-item link |
| `src/components/receiving/RepairOrderQueueKanban.tsx` | Preserve link metadata and enforce package/item ordering after refreshes |
| `src/pages/RepairOrderQueueFullScreen.tsx` | Enforce the same deterministic package/item ordering |
| `src/components/receiving/InboundPackageCard.tsx` | Preserve numbers locally, render a copied ascending item list, remove reorder UI |
| `src/components/receiving/ItemPrioritizationModal.tsx` | Delete manual drag-and-drop queue ordering |
| `src/components/receiving/UnifiedOpenBoxModal.tsx` | Remove obsolete prioritization instruction |

### Verification

- Open and close diagnosis through both Save and Cancel; confirm every item number remains visible immediately and after a full reload.
- Confirm an attempted database update to an assigned number or package link is rejected.
- Confirm no manual reorder control or prioritization instruction remains.
- Confirm both repair queue views show newest packages at the top and Item #1, Item #2, Item #3 in ascending top-to-bottom order within each package.
- Confirm targeted and realtime refreshes do not change either ordering.
