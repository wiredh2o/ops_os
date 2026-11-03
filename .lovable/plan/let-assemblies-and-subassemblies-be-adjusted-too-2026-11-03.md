# Let assemblies and subassemblies be adjusted too

## Answer on the "Inventory Asset account" message
A posting moves money between two accounts in your chart of accounts: the Inventory Asset account and the offset account (Cost of Goods Sold unless you pick another). The posting looks for an active account marked as type "Inventory". If none exists, or it is switched off, the posting stops with that message rather than guess. Nothing changes here. Today the Accounting screen creates a starter chart of accounts on first open, including "Inventory" (1200) and "Cost of Goods Sold" (5000). You can't add, edit or switch off accounts anywhere in the app yet, so normally that message shouldn't appear.

## Add and edit accounts (new)
- The Accounting screen gets a Chart of Accounts list with **New account** and **Edit** (Admin and Accounting only): name, number, type, subtype, description, and an active switch.
- Accounts used in journal entries can be switched off but not deleted.
- Account numbers must be unique.

## Why assemblies were left out
I left them out to keep the first version small, not for a business reason. Assemblies and subassemblies already have their own on-hand quantity and unit cost, and they belong in the same Inventory Asset balance. So they should be adjustable too.

## What you will see
- Assemblies and subassemblies get the same "Adjust Quantity/Value on Hand" button as inventory items (Admin and Accounting only).
- The Physical Count worksheet lists inventory items, assemblies and subassemblies together, with a Type filter (Item / Assembly / Subassembly).
- Same rules as items: on-hand can't go below 0, value = quantity times unit cost, and one posting creates one net debit/credit entry, whether it has 1 line or hundreds.
- The adjustment history and General Journal entries show the type of each line.

## Technical details
- Audit table: add `assembly_id` (nullable, FK to assemblies) beside `inventory_item_id`, with a check that exactly one is set.
- `post_inventory_adjustments`: each line carries `kind` ('item' | 'assembly'); lock and update `inventory_items` or `assemblies` (`quantity_on_hand`, `unit_cost`) the same way; keep a single net two-line entry.
- Rules helper and tests: cover a mixed item+assembly batch netting to one entry.
- UI: reuse InventoryAdjustmentDialog on the assembly list; worksheet merges both sources.
- Changing an assembly's on-hand doesn't consume or restore its components. That's the same as a QuickBooks quantity adjustment; builds still go through production.
