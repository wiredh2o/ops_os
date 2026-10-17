-- Step 1: Drop the overly restrictive constraint that prevents multiple 
-- line items per repair_item within the same order
DROP INDEX IF EXISTS idx_unique_repair_item_per_order;

-- Step 2: Clean up orphaned production orders (created during failed attempts)
DELETE FROM production_orders 
WHERE id NOT IN (
  SELECT DISTINCT production_order_id FROM production_order_items
);