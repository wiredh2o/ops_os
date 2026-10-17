## Permanently Preserve Repair Item Numbers After Diagnosis

**Category:** Precision Work / Regression Fix

### Confirmed Root Cause

Item numbers are still correctly stored in `inbound_package_items`. The database currently has 95 linked repair items, zero null item numbers, a non-null requirement, and uniqueness per package.

Closing the diagnosis window stops the repair timer and emits `repair-item-updated`. Two queue components handle that event by fetching only the `repair_items` row, then replacing the complete item in local state. Because `unboxing_order` belongs to `inbound_package_items`, the replacement drops the number from the UI even though the database value remains intact.

### Fix

1. **Preserve package-link metadata during targeted refreshes**
   - Update the dashboard queue refresh in `RepairOrderQueueKanban.tsx` to merge refreshed repair fields into the existing item instead of reconstructing it.
   - Update the package card refresh in `InboundPackageCard.tsx` the same way.
   - This preserves `unboxing_order`, `priority_order`, and other package-scoped metadata whenever diagnosis or timer cleanup refreshes an item.

2. **Use explicit null handling for item numbers**
   - Replace truthy fallbacks such as `unboxing_order || 1` and `unboxing_order || 0` in the affected queue paths with null-aware handling, so valid values are never silently substituted and missing metadata remains detectable.

3. **Lock the number permanently in the database**
   - Add a database rule that rejects any change to an item's assigned number once it exists. After assignment the value becomes immutable: it cannot be edited, shifted, renumbered, or reused by any modal, script, or future code path.
   - Manual reordering of the work queue is unaffected, because priority ordering is stored in a separate field on the repair item and is not the item number.

4. **Verify every diagnosis-close path**
   - Test both Cancel/close and Save/close from the diagnosis window.
   - Confirm item numbers remain unchanged immediately after closing and after a full queue reload.
   - Check both the dashboard queue and full-screen Repair Order Queue.
   - Confirm reprioritizing items does not alter their item numbers.

### Files

| File | Change |
|---|---|
| Database migration | Reject any modification to an already-assigned item number |
| `src/components/receiving/RepairOrderQueueKanban.tsx` | Preserve junction-table metadata during targeted item refresh |
| `src/components/receiving/InboundPackageCard.tsx` | Preserve item number during local refresh and remove truthy fallback |

### Permanent Guarantee

The database is the sole authority for item numbers: assigned automatically, unique per package, never null, and now permanently immutable. Frontend refreshes will no longer replace a complete queue item with a partial row from another table, so diagnosis, timer, and future item-update events cannot erase or alter a number in the UI.