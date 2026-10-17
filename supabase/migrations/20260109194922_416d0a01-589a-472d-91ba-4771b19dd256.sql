-- Step 1: Delete duplicate entries within the same order (keep only one per repair_item per order)
WITH duplicates AS (
  SELECT id, repair_item_id, production_order_id,
         ROW_NUMBER() OVER (PARTITION BY repair_item_id, production_order_id ORDER BY id) as rn
  FROM production_order_items
  WHERE repair_item_id IS NOT NULL
)
DELETE FROM production_order_items
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 2: For items appearing in multiple orders, keep only the most recent order entry
WITH ranked_items AS (
  SELECT poi.id, poi.repair_item_id, poi.production_order_id, po.created_at,
         ROW_NUMBER() OVER (PARTITION BY poi.repair_item_id ORDER BY po.created_at DESC) as rn
  FROM production_order_items poi
  JOIN production_orders po ON po.id = poi.production_order_id
  WHERE poi.repair_item_id IS NOT NULL
)
DELETE FROM production_order_items
WHERE id IN (SELECT id FROM ranked_items WHERE rn > 1);

-- Step 3: Add unique partial index to prevent future duplicates
-- This ensures a repair_item can only exist in ONE production order
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_repair_item_per_order 
ON production_order_items(repair_item_id) 
WHERE repair_item_id IS NOT NULL;