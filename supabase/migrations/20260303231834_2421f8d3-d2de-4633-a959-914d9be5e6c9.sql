
-- Backfill quantity_invoiced from production order items
-- Match by parent_customer_order_id + item identity (item_type + inventory_item_id)
-- Aggregate across all completed production orders

WITH invoiced_totals AS (
  SELECT 
    coi.id AS customer_order_item_id,
    LEAST(coi.quantity_ordered, COALESCE(SUM(poi.quantity), 0)) AS computed_invoiced
  FROM customer_order_items coi
  JOIN customer_orders co ON co.id = coi.customer_order_id
  JOIN production_orders po ON po.parent_customer_order_id = co.id
  JOIN production_order_items poi ON poi.production_order_id = po.id
    AND poi.item_type = coi.item_type
    AND (
      (coi.item_type = 'inventory_item' AND poi.inventory_item_id = coi.inventory_item_id)
      OR (coi.item_type = 'assembly' AND poi.assembly_id = coi.assembly_id)
      OR (coi.item_type = 'labor' AND poi.labor_item_id = coi.labor_item_id)
    )
  WHERE co.order_status != 'cancelled'
    AND po.status = 'completed'
  GROUP BY coi.id, coi.quantity_ordered
)
UPDATE customer_order_items coi
SET quantity_invoiced = it.computed_invoiced
FROM invoiced_totals it
WHERE coi.id = it.customer_order_item_id
  AND coi.quantity_invoiced != it.computed_invoiced;

-- Recompute customer_orders.order_status based on updated quantity_invoiced
WITH order_totals AS (
  SELECT 
    co.id,
    SUM(coi.quantity_ordered) AS total_ordered,
    SUM(coi.quantity_invoiced) AS total_invoiced
  FROM customer_orders co
  JOIN customer_order_items coi ON coi.customer_order_id = co.id
  WHERE co.order_status != 'cancelled'
  GROUP BY co.id
)
UPDATE customer_orders co
SET order_status = CASE
  WHEN ot.total_invoiced >= ot.total_ordered THEN 'fulfilled'
  WHEN ot.total_invoiced > 0 THEN 'partially_fulfilled'
  ELSE 'pending'
END
FROM order_totals ot
WHERE co.id = ot.id
  AND co.order_status != 'cancelled';
