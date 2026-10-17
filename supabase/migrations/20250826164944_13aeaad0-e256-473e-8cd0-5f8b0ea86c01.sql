-- Fix the last remaining function security warning
-- Look for any functions that might be missing proper search_path

-- Check if handle_assembly_sales_allocation function exists and fix it
CREATE OR REPLACE FUNCTION public.handle_assembly_sales_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update assembly allocated quantity when production order items change
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Update allocated quantity for the assembly
      UPDATE public.assemblies 
      SET quantity_allocated = GREATEST(
        (SELECT COALESCE(SUM(poi.quantity), 0)
         FROM public.production_order_items poi
         JOIN public.production_orders po ON poi.production_order_id = po.id
         WHERE poi.assembly_id = NEW.assembly_id
         AND po.status NOT IN ('shipped', 'cancelled')),
        0
      ),
      quantity_atp = GREATEST(quantity_on_hand - GREATEST(
        (SELECT COALESCE(SUM(poi.quantity), 0)
         FROM public.production_order_items poi
         JOIN public.production_orders po ON poi.production_order_id = po.id
         WHERE poi.assembly_id = NEW.assembly_id
         AND po.status NOT IN ('shipped', 'cancelled')),
        0
      ), 0)
      WHERE id = NEW.assembly_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'assembly' AND OLD.assembly_id IS NOT NULL THEN
      -- Update allocated quantity for the assembly
      UPDATE public.assemblies 
      SET quantity_allocated = GREATEST(
        (SELECT COALESCE(SUM(poi.quantity), 0)
         FROM public.production_order_items poi
         JOIN public.production_orders po ON poi.production_order_id = po.id
         WHERE poi.assembly_id = OLD.assembly_id
         AND po.status NOT IN ('shipped', 'cancelled')),
        0
      ),
      quantity_atp = GREATEST(quantity_on_hand - GREATEST(
        (SELECT COALESCE(SUM(poi.quantity), 0)
         FROM public.production_order_items poi
         JOIN public.production_orders po ON poi.production_order_id = po.id
         WHERE poi.assembly_id = OLD.assembly_id
         AND po.status NOT IN ('shipped', 'cancelled')),
        0
      ), 0)
      WHERE id = OLD.assembly_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;