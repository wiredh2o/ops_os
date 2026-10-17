BEGIN;

-- 1) Ensure revenue timestamps exist
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ NULL;

-- 2) Drop old immediate deduction trigger on order items (if it exists)
DROP TRIGGER IF EXISTS trg_process_inventory_deduction ON public.production_order_items;

-- 3) Ensure availability recalculation triggers exist on inventory_items and assemblies
DROP TRIGGER IF EXISTS set_inventory_availability ON public.inventory_items;
CREATE TRIGGER set_inventory_availability
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.update_inventory_availability();

DROP TRIGGER IF EXISTS set_assembly_availability ON public.assemblies;
CREATE TRIGGER set_assembly_availability
BEFORE UPDATE ON public.assemblies
FOR EACH ROW EXECUTE FUNCTION public.update_assembly_availability();

-- 4) Create inventory sales allocation trigger function and attach it to production_order_items
CREATE OR REPLACE FUNCTION public.handle_inventory_sales_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
      DECLARE qty_diff INTEGER := NEW.quantity;
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          qty_diff := NEW.quantity - OLD.quantity;
        END IF;

        UPDATE public.inventory_items
        SET 
          quantity_allocated = quantity_allocated + qty_diff
        WHERE id = NEW.inventory_item_id;
      END;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'inventory_item' AND OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items
      SET 
        quantity_allocated = quantity_allocated - OLD.quantity
      WHERE id = OLD.inventory_item_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_sales_allocation ON public.production_order_items;
CREATE TRIGGER trg_inventory_sales_allocation
AFTER INSERT OR UPDATE OR DELETE ON public.production_order_items
FOR EACH ROW EXECUTE FUNCTION public.handle_inventory_sales_allocation();

-- 5) Create shipment-time deduction function and trigger on production_orders
CREATE OR REPLACE FUNCTION public.handle_order_shipment_inventory_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only act when status transitions to 'shipped'
  IF (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'shipped') THEN
    
    -- Deduct inventory items and release their allocations
    UPDATE public.inventory_items ii
    SET 
      quantity_on_hand = GREATEST(ii.quantity_on_hand - COALESCE(p.sum_qty, 0), 0),
      quantity_allocated = GREATEST(ii.quantity_allocated - COALESCE(p.sum_qty, 0), 0)
    FROM (
      SELECT poi.inventory_item_id, SUM(poi.quantity) AS sum_qty
      FROM public.production_order_items poi
      WHERE poi.production_order_id = NEW.id
        AND poi.item_type = 'inventory_item'
        AND poi.inventory_item_id IS NOT NULL
      GROUP BY poi.inventory_item_id
    ) p
    WHERE ii.id = p.inventory_item_id;

    -- Deduct assemblies and release their allocations
    UPDATE public.assemblies a
    SET 
      quantity_on_hand = GREATEST(a.quantity_on_hand - COALESCE(p.sum_qty, 0), 0),
      quantity_allocated = GREATEST(a.quantity_allocated - COALESCE(p.sum_qty, 0), 0)
    FROM (
      SELECT poi.assembly_id, SUM(poi.quantity) AS sum_qty
      FROM public.production_order_items poi
      WHERE poi.production_order_id = NEW.id
        AND poi.item_type = 'assembly'
        AND poi.assembly_id IS NOT NULL
      GROUP BY poi.assembly_id
    ) p
    WHERE a.id = p.assembly_id;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_shipment_inventory_deduction ON public.production_orders;
CREATE TRIGGER trg_order_shipment_inventory_deduction
AFTER UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.handle_order_shipment_inventory_deduction();

-- 6) One-time backfill
-- 6a) Inventory items: add back on-hand for unshipped orders and allocate them
WITH inv_allocs AS (
  SELECT poi.inventory_item_id AS id, SUM(poi.quantity) AS qty
  FROM public.production_order_items poi
  JOIN public.production_orders po ON po.id = poi.production_order_id
  WHERE poi.item_type = 'inventory_item'
    AND poi.inventory_item_id IS NOT NULL
    AND po.status NOT IN ('shipped','cancelled')
  GROUP BY poi.inventory_item_id
)
UPDATE public.inventory_items ii
SET 
  quantity_on_hand = ii.quantity_on_hand + inv_allocs.qty,
  quantity_allocated = ii.quantity_allocated + inv_allocs.qty
FROM inv_allocs
WHERE ii.id = inv_allocs.id;

-- 6b) Reverse component deductions for assembly items on unshipped orders
WITH comp_debits AS (
  SELECT ac.inventory_item_id AS id, SUM(ac.quantity_needed * poi.quantity) AS qty
  FROM public.production_order_items poi
  JOIN public.production_orders po ON po.id = poi.production_order_id
  JOIN public.assembly_components ac ON ac.assembly_id = poi.assembly_id
  WHERE poi.item_type = 'assembly'
    AND poi.assembly_id IS NOT NULL
    AND po.status NOT IN ('shipped','cancelled')
  GROUP BY ac.inventory_item_id
)
UPDATE public.inventory_items ii
SET 
  quantity_on_hand = ii.quantity_on_hand + comp_debits.qty
FROM comp_debits
WHERE ii.id = comp_debits.id;

-- 6c) Recompute ATS/ATP across items
UPDATE public.inventory_items
SET 
  quantity_ats = GREATEST(quantity_on_hand - quantity_allocated, 0),
  quantity_atp = GREATEST(quantity_on_hand + quantity_on_order - quantity_allocated, 0);

UPDATE public.assemblies
SET 
  quantity_ats = GREATEST(quantity_on_hand - quantity_allocated, 0),
  quantity_atp = GREATEST(quantity_on_hand + quantity_on_order - quantity_allocated, 0);

-- 7) Update RPC to use availability logic
CREATE OR REPLACE FUNCTION public.get_ready_to_ship_customer_orders()
RETURNS TABLE(
  id uuid, order_number text, customer_name text, created_at timestamptz, priority text, status text, 
  shipping_preference shipping_preference, total_amount numeric, customer_email text, customer_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $func$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    po.customer_name,
    po.created_at,
    po.priority,
    po.status,
    po.shipping_preference,
    po.total_amount,
    po.customer_email,
    po.customer_phone
  FROM public.production_orders po
  WHERE po.order_type = 'customer'
  AND po.status IN ('pending', 'approved', 'in_progress', 'completed')
  AND (
    -- ship_complete: all items have enough available-to-ship for this specific order
    (po.shipping_preference = 'ship_complete' AND NOT EXISTS (
      SELECT 1
      FROM public.production_order_items poi
      LEFT JOIN public.inventory_items ii ON poi.inventory_item_id = ii.id
      LEFT JOIN public.assemblies a ON poi.assembly_id = a.id
      WHERE poi.production_order_id = po.id
      AND (
        (poi.item_type = 'inventory_item' AND (GREATEST(ii.quantity_on_hand - (ii.quantity_allocated - poi.quantity), 0) < poi.quantity))
        OR 
        (poi.item_type = 'assembly' AND (GREATEST(a.quantity_on_hand - (a.quantity_allocated - poi.quantity), 0) < poi.quantity))
      )
    ))
    OR
    -- ship_as_available: at least some quantity is available now
    (po.shipping_preference = 'ship_as_available' AND EXISTS (
      SELECT 1
      FROM public.production_order_items poi
      LEFT JOIN public.inventory_items ii ON poi.inventory_item_id = ii.id
      LEFT JOIN public.assemblies a ON poi.assembly_id = a.id
      WHERE poi.production_order_id = po.id
      AND (
        (poi.item_type = 'inventory_item' AND (GREATEST(ii.quantity_on_hand - ii.quantity_allocated, 0) > 0))
        OR 
        (poi.item_type = 'assembly' AND (GREATEST(a.quantity_on_hand - a.quantity_allocated, 0) > 0))
      )
    ))
  )
  ORDER BY po.created_at ASC;
END;
$func$;

COMMIT;