-- Fix missing inbound_package_items links for packages with repair items
-- This will create the missing links between packages and their repair items

INSERT INTO inbound_package_items (package_id, repair_item_id, unboxing_order)
SELECT 
  ri.package_id,
  ri.id as repair_item_id,
  ROW_NUMBER() OVER (PARTITION BY ri.package_id ORDER BY ri.created_at) as unboxing_order
FROM repair_items ri
WHERE NOT EXISTS (
  SELECT 1 FROM inbound_package_items ipi 
  WHERE ipi.repair_item_id = ri.id
)
AND ri.package_id IS NOT NULL;