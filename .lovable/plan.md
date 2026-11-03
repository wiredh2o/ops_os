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
- Top: one adjustment date, required batch description, offset account.
- Table of all inventory items: name/SKU, current qty, current value, counted qty, counted value. Search box; blank counted cells mean "no change".
- Summary bar: lines changed, total value increase, total decrease, net.
- "Post adjustments" posts every changed line at once: each line gets its own journal entry dated with the entered date, all grouped under the batch description.

## Accounting rules
- Value decrease: credit Inventory Asset, debit COGS/Inventory Adjustment.
- Value increase: debit Inventory Asset, credit COGS/Inventory Adjustment.
- Quantity-only change: value moves at the current unit cost. Value-only change: quantity stays, unit cost is recalculated. Both: new unit cost = new value / new quantity.
- Quantity change with zero value effect (e.g. zero cost) updates the item with no journal lines.
- New quantity cannot be negative; value cannot be positive when quantity is zero.

## Technical details
- Existing `accounts`, `transactions`, `transaction_lines` are reused (no new chart of accounts). The Inventory Asset account is the active `account_subtype = inventory` account; offset defaults to `cost_of_goods_sold`. Posting fails with a clear message if either is missing.
- Minimal new schema:
  - `journal_batches` (company_id, description required, adjustment_date, created_by) — groups the entries; GRANTs + RLS for Admin/Accounting.
  - `inventory_adjustments` (batch_id nullable, inventory_item_id, adjustment_date, old/new qty, old/new value, reason, transaction_id, created_by) — audit trail.
  - `transactions.batch_id` nullable column.
- Private-schema RPC `post_inventory_adjustments(date, description, offset_account_id, lines jsonb, request_key)` with public invoker wrapper: checks Admin/Accounting role and company, locks item rows, recomputes current values server-side (client numbers are not trusted), updates `quantity_on_hand`/`unit_cost`, writes transaction + balanced lines + audit row, updates account balances, all in one transaction. Request key prevents double-posting on retry. Single-item dialog calls the same RPC with one line and no batch description required (reason becomes the entry memo).
- Pure helper `src/lib/inventory-adjustment-rules.ts` (delta math, debit/credit side, validation) with tests.
- Files: InventoryManagement.tsx and InventoryItemForm.tsx (button), new `InventoryAdjustmentDialog.tsx` in src/components/inventory, new `src/pages/InventoryPhysicalCount.tsx`, route in `src/App.tsx`, AGENTS.md rule.
- No general-journal UI.
