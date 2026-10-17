BEGIN;
-- 1) Ensure search_path safety for new/updated functions
SET search_path TO '';

-- 2) Replace shipment deduction function to only act on customer orders
CREATE OR REPLACE FUNCTION public.handle_order_shipment_inventory_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Only act when status transitions to 'shipped'
  IF (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'shipped') THEN

    -- Only apply shipment deductions for customer orders
    IF NEW.order_type = 'customer' THEN
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

  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Ensure assembly completion adds assemblies and deducts components at completion time
-- We will augment existing completion handler to also deduct components when an assembly build completes.
CREATE OR REPLACE FUNCTION public.handle_assembly_production_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- When production order status changes to 'completed', update assembly quantities and deduct components
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Only apply when the order is an assembly build
    IF NEW.order_type = 'assembly_build' THEN
      -- Add finished assemblies to inventory
      UPDATE public.assemblies
      SET quantity_on_hand = quantity_on_hand + poi.quantity
      FROM public.production_order_items poi
      WHERE poi.production_order_id = NEW.id
      AND poi.item_type = 'assembly'
      AND poi.assembly_id = assemblies.id;

      -- Deduct components used by assemblies for this build
      UPDATE public.inventory_items ii
      SET quantity_on_hand = GREATEST(ii.quantity_on_hand - COALESCE(comp.total_needed, 0), 0)
      FROM (
        SELECT ac.inventory_item_id, SUM(ac.quantity_needed * poi.quantity) AS total_needed
        FROM public.production_order_items poi
        JOIN public.assembly_components ac ON ac.assembly_id = poi.assembly_id
        WHERE poi.production_order_id = NEW.id
          AND poi.item_type = 'assembly'
          AND poi.assembly_id IS NOT NULL
        GROUP BY ac.inventory_item_id
      ) comp
      WHERE ii.id = comp.inventory_item_id;

      -- Update assembly production trigger status if this was auto-generated
      IF NEW.auto_generated = true THEN
        UPDATE public.assembly_production_triggers
        SET status = 'completed'
        WHERE production_order_id = NEW.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Ensure triggers are in place on production_orders
-- Drop and recreate triggers to ensure correct order and uniqueness
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_handle_order_shipment_inventory_deduction'
  ) THEN
    DROP TRIGGER trg_handle_order_shipment_inventory_deduction ON public.production_orders;
  END IF;

  CREATE TRIGGER trg_handle_order_shipment_inventory_deduction
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_shipment_inventory_deduction();
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_handle_assembly_production_completion'
  ) THEN
    DROP TRIGGER trg_handle_assembly_production_completion ON public.production_orders;
  END IF;

  CREATE TRIGGER trg_handle_assembly_production_completion
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_assembly_production_completion();
END $$;

COMMIT;