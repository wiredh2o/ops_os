# Inventory adjustments (QuickBooks Desktop style)

## What you will see

**Single item (Inventory list and item edit window)**
- New "Adjust Quantity/Value on Hand" button, shown only to Admin and Accounting.
- Dialog shows current on-hand quantity, unit cost and total value.
- Enter a new quantity, a new total value, or both. Live preview of quantity change, value change and new average cost.
- One adjustment date (defaults to today). Optional reason.
- Optional choice of offset account: COGS (default) or an Inventory Adjustment expense account if one exists.
- Save updates the item and posts one balanced journal entry.

**Physical Inventory Worksheet (new page, `/inventory/physical-count`)**
- Opened from an "Physical Count" button on the Inventory screen; Admin and Accounting only (others are sent back).
- Top: one adjustment date and offset account. No description is required.
- Table of all inventory items: name/SKU, current qty, current value, counted qty, counted value. Counted value is not typed in; it is calculated as counted qty times the item's per-item cost. Search box; blank counted cells mean "no change".
- Summary bar: lines changed, total value increase, total decrease, net.
- Change one item or many, as in QuickBooks Desktop. "Post adjustments" posts every changed line at once: each changed item gets exactly one general journal entry that rebalances Inventory Asset against the offset account, dated with the entered date. No batch description is attached.

## Accounting rules
- Value decrease: credit Inventory Asset, debit COGS/Inventory Adjustment.
- Value increase: debit Inventory Asset, credit COGS/Inventory Adjustment.
- Quantity-only change: value moves at the current unit cost. Value-only change: quantity stays, unit cost is recalculated. Both: new unit cost = new value / new quantity.
- Total value is always quantity times per-item cost for each part, assembly or subassembly. Any quantity change changes total value by (quantity change times per-item cost), and that change is what gets posted. A value entry is stored as a new per-item cost (value / quantity), never as a separate total.
- Quantity on hand can never go below 0, since physical stock can't be negative, so on-hand value is never negative either. An adjustment to a negative quantity is blocked with a clear message. Orders for stock not on hand or not yet ordered are still accepted: the shortfall shows in the other existing quantities (allocated, available to promise, available to sell, which can go negative), not in on-hand. Per-item cost can never be negative. When quantity is zero, a new value can't be entered (no quantity to spread it over); only the per-item cost can be changed.

## Technical details
- Existing `accounts`, `transactions`, `transaction_lines` are reused (no new chart of accounts). The Inventory Asset account is the active `account_subtype = inventory` account; offset defaults to `cost_of_goods_sold`. Posting fails with a clear message if either is missing.
- Minimal new schema:
  - `inventory_adjustments` (inventory_item_id, adjustment_date, old/new qty, old/new value, reason, transaction_id, request_key, created_by) — audit trail; GRANTs + RLS for Admin/Accounting.
- Private-schema RPC `post_inventory_adjustments(date, offset_account_id, lines jsonb, request_key)` with public invoker wrapper: checks Admin/Accounting role and company, locks item rows, recomputes current values server-side (client numbers are not trusted), updates `quantity_on_hand`/`unit_cost`, writes one transaction + balanced lines + audit row per changed item, updates account balances, all in one transaction. Request key prevents double-posting on retry. Single-item dialog calls the same RPC with one line (optional reason becomes the entry memo).
- Pure helper `src/lib/inventory-adjustment-rules.ts` (delta math, debit/credit side, validation) with tests.
- Files: InventoryManagement.tsx and InventoryItemForm.tsx (button), new `InventoryAdjustmentDialog.tsx` in src/components/inventory, new `src/pages/InventoryPhysicalCount.tsx`, route in `src/App.tsx`, AGENTS.md rule.
- General Journal screen (new page `src/pages/GeneralJournal.tsx`, route `/accounting/general-journal`, opened from the Accounting screen; Admin and Accounting only), modeled on QuickBooks Desktop "Make General Journal Entries":
  - Header: Date, Entry No. (auto-numbered, editable), Adjusting Entry checkbox, Previous / Next buttons to page through entries, and "List of Selected General Journal Entries" toggle showing recent entries.
  - Grid: Account, Debit, Credit, Memo, Name columns; new rows add automatically; the remaining difference pre-fills the next row so the entry balances like QuickBooks.
  - Running debit/credit totals; Save and Close / Save and New / Clear are disabled until debits equal credits.
  - Inventory adjustment entries open read-only with a link back to the adjustment (edit by posting a new adjustment).
  - Manual entries save through a private-schema RPC `post_journal_entry` (role/company check, balanced-lines check, account balance update, request key); adds `transactions.entry_number` and `is_adjusting` columns.
