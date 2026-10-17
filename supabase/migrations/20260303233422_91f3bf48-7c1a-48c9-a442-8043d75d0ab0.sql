
-- Fix stale data for CO-20260215-001: reset quantity_invoiced since no production orders remain
UPDATE customer_order_items 
SET quantity_invoiced = 0 
WHERE customer_order_id = '45f1b0e3-481a-4e62-874f-c58391f2345e';

UPDATE customer_orders 
SET order_status = 'pending' 
WHERE id = '45f1b0e3-481a-4e62-874f-c58391f2345e';

-- Create a reusable function to recalculate fulfillment for a customer order
-- This replaces the fragile source_order_item_id-based approach
CREATE OR REPLACE FUNCTION public.recalculate_customer_order_fulfillment(p_customer_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_ordered numeric := 0;
  v_total_invoiced numeric := 0;
BEGIN
  -- Recalculate quantity_invoiced for each customer_order_item
  -- by aggregating from remaining production_order_items across all surviving production_orders
  UPDATE customer_order_items coi
  SET quantity_invoiced = LEAST(coi.quantity_ordered, COALESCE(agg.total_qty, 0))
  FROM (
    SELECT 
      coi_inner.id AS customer_order_item_id,
      SUM(poi.quantity) AS total_qty
    FROM customer_order_items coi_inner
    LEFT JOIN production_orders po 
      ON po.parent_customer_order_id = coi_inner.customer_order_id
      AND po.status != 'cancelled'
    LEFT JOIN production_order_items poi 
      ON poi.production_order_id = po.id
      AND poi.item_type = coi_inner.item_type
      AND (
        (coi_inner.item_type = 'inventory_item' AND poi.inventory_item_id = coi_inner.inventory_item_id)
        OR (coi_inner.item_type = 'assembly' AND poi.assembly_id = coi_inner.assembly_id)
        OR (coi_inner.item_type = 'labor' AND poi.labor_item_id = coi_inner.labor_item_id)
      )
    WHERE coi_inner.customer_order_id = p_customer_order_id
    GROUP BY coi_inner.id
  ) agg
  WHERE coi.id = agg.customer_order_item_id
    AND coi.customer_order_id = p_customer_order_id;

  -- Also handle items with no matching production orders at all (set to 0)
  UPDATE customer_order_items coi
  SET quantity_invoiced = 0
  WHERE coi.customer_order_id = p_customer_order_id
    AND NOT EXISTS (
      SELECT 1 FROM production_orders po
      JOIN production_order_items poi ON poi.production_order_id = po.id
      WHERE po.parent_customer_order_id = p_customer_order_id
        AND po.status != 'cancelled'
        AND poi.item_type = coi.item_type
        AND (
          (coi.item_type = 'inventory_item' AND poi.inventory_item_id = coi.inventory_item_id)
          OR (coi.item_type = 'assembly' AND poi.assembly_id = coi.assembly_id)
          OR (coi.item_type = 'labor' AND poi.labor_item_id = coi.labor_item_id)
        )
    );

  -- Recompute order status
  SELECT 
    SUM(quantity_ordered), 
    SUM(quantity_invoiced)
  INTO v_total_ordered, v_total_invoiced
  FROM customer_order_items
  WHERE customer_order_id = p_customer_order_id;

  UPDATE customer_orders
  SET order_status = CASE
    WHEN v_total_invoiced >= v_total_ordered THEN 'fulfilled'
    WHEN v_total_invoiced > 0 THEN 'partially_fulfilled'
    ELSE 'pending'
  END
  WHERE id = p_customer_order_id
    AND order_status != 'cancelled';
END;
$$;
