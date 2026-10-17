-- 1) Remove immediate deduction behavior
DO $$
DECLARE trg RECORD;
BEGIN
  FOR trg IN 
    SELECT tgname 
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid 
    WHERE t.tgrelid = 'public.production_order_items'::regclass 
      AND p.proname = 'process_inventory_deduction'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.production_order_items;', trg.tgname);
  END LOOP;
END $$;

-- Drop the old function if it exists to prevent accidental reuse
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'process_inventory_deduction' 
      AND pg_function_is_visible(oid)
  ) THEN
    DROP FUNCTION public.process_inventory_deduction();
  END IF;
END $$;

-- 2) Add inventory sales allocation trigger (mirrors assembly allocation)
CREATE OR REPLACE FUNCTION public.handle_inventory_sales_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  order_type_text TEXT;
  old_is_inventory BOOLEAN := (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.item_type = 'inventory_item' AND OLD.inventory_item_id IS NOT NULL;
  new_is_inventory BOOLEAN := (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT order_type INTO order_type_text FROM public.production_orders WHERE id = NEW.production_order_id;
    IF order_type_text = 'customer' THEN
      -- Handle reallocation if item changed
      IF TG_OP = 'UPDATE' THEN
        IF old_is_inventory AND (NOT new_is_inventory OR NEW.inventory_item_id IS NULL OR NEW.inventory_item_id != OLD.inventory_item_id) THEN
          UPDATE public.inventory_items
          SET quantity_allocated = quantity_allocated - OLD.quantity
          WHERE id = OLD.inventory_item_id;
        END IF;
      END IF;

      IF new_is_inventory THEN
        IF TG_OP = 'INSERT' THEN
          UPDATE public.inventory_items
          SET quantity_allocated = quantity_allocated + NEW.quantity
          WHERE id = NEW.inventory_item_id;
        ELSE
          -- Same item case: adjust by diff; new item case above already subtracted old qty and we add full new qty
          IF old_is_inventory AND NEW.inventory_item_id = OLD.inventory_item_id THEN
            UPDATE public.inventory_items
            SET quantity_allocated = quantity_allocated + (NEW.quantity - OLD.quantity)
            WHERE id = NEW.inventory_item_id;
          ELSIF NOT old_is_inventory OR NEW.inventory_item_id != OLD.inventory_item_id THEN
            UPDATE public.inventory_items
            SET quantity_allocated = quantity_allocated + NEW.quantity
            WHERE id = NEW.inventory_item_id;
          END IF;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT order_type INTO order_type_text FROM public.production_orders WHERE id = OLD.production_order_id;
    IF order_type_text = 'customer' AND old_is_inventory THEN
      UPDATE public.inventory_items
      SET quantity_allocated = quantity_allocated - OLD.quantity
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

-- 3) Deduct on shipment time for customer orders (both inventory items and assemblies)
CREATE OR REPLACE FUNCTION public.handle_customer_order_shipment_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'shipped' AND (OLD.status IS NULL OR OLD.status <> 'shipped') THEN
    IF NEW.order_type = 'customer' THEN
      -- Deduct inventory items
      UPDATE public.inventory_items ii
      SET 
        quantity_on_hand = ii.quantity_on_hand - sub.qty,
        quantity_allocated = GREATEST(ii.quantity_allocated - sub.qty, 0)
      FROM (
        SELECT poi.inventory_item_id AS id, SUM(poi.quantity) AS qty
        FROM public.production_order_items poi
        WHERE poi.production_order_id = NEW.id
          AND poi.item_type = 'inventory_item'
          AND poi.inventory_item_id IS NOT NULL
        GROUP BY poi.inventory_item_id
      ) sub
      WHERE ii.id = sub.id;

      -- Deduct assemblies
      UPDATE public.assemblies a
      SET 
        quantity_on_hand = a.quantity_on_hand - sub.qty,
        quantity_allocated = GREATEST(a.quantity_allocated - sub.qty, 0)
      FROM (
        SELECT poi.assembly_id AS id, SUM(poi.quantity) AS qty
        FROM public.production_order_items poi
        WHERE poi.production_order_id = NEW.id
          AND poi.item_type = 'assembly'
          AND poi.assembly_id IS NOT NULL
        GROUP BY poi.assembly_id
      ) sub
      WHERE a.id = sub.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_order_shipment_deduction ON public.production_orders;
CREATE TRIGGER trg_customer_order_shipment_deduction
AFTER UPDATE OF status ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.handle_customer_order_shipment_deduction();

-- 4) Backfill existing allocations and recompute ATS/ATP
-- Reset allocations
UPDATE public.inventory_items SET quantity_allocated = 0;
UPDATE public.assemblies SET quantity_allocated = 0;

-- Rebuild from open customer orders
WITH inv_alloc AS (
  SELECT poi.inventory_item_id, SUM(poi.quantity) AS alloc
  FROM public.production_order_items poi
  JOIN public.production_orders po ON po.id = poi.production_order_id
  WHERE poi.item_type = 'inventory_item'
    AND poi.inventory_item_id IS NOT NULL
    AND po.order_type = 'customer'
    AND po.status NOT IN ('shipped', 'canceled')
  GROUP BY poi.inventory_item_id
), asm_alloc AS (
  SELECT poi.assembly_id, SUM(poi.quantity) AS alloc
  FROM public.production_order_items poi
  JOIN public.production_orders po ON po.id = poi.production_order_id
  WHERE poi.item_type = 'assembly'
    AND poi.assembly_id IS NOT NULL
    AND po.order_type = 'customer'
    AND po.status NOT IN ('shipped', 'canceled')
  GROUP BY poi.assembly_id
)
UPDATE public.inventory_items ii
SET quantity_allocated = COALESCE(inv_alloc.alloc, 0)
FROM inv_alloc
WHERE ii.id = inv_alloc.inventory_item_id;

UPDATE public.assemblies a
SET quantity_allocated = COALESCE(asm_alloc.alloc, 0)
FROM asm_alloc
WHERE a.id = asm_alloc.assembly_id;

-- Touch rows to ensure availability recalculation triggers run
UPDATE public.inventory_items SET quantity_on_hand = quantity_on_hand;
UPDATE public.assemblies SET quantity_on_hand = quantity_on_hand;
