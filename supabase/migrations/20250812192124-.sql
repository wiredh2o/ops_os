-- 1) Rename existing availability columns to ATP and add ATS columns
ALTER TABLE public.inventory_items RENAME COLUMN quantity_available TO quantity_atp;
ALTER TABLE public.assemblies RENAME COLUMN quantity_available TO quantity_atp;

ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS quantity_ats integer NOT NULL DEFAULT 0;
ALTER TABLE public.assemblies ADD COLUMN IF NOT EXISTS quantity_ats integer NOT NULL DEFAULT 0;

-- 2) Update availability calculation functions to maintain both ATP and ATS
CREATE OR REPLACE FUNCTION public.update_inventory_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Available to Promise (ATP) = on_hand + on_order - allocated
  NEW.quantity_atp := GREATEST(NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated, 0);
  -- Available to Ship (ATS) = on_hand - allocated
  NEW.quantity_ats := GREATEST(NEW.quantity_on_hand - NEW.quantity_allocated, 0);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_assembly_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Available to Promise (ATP) = on_hand + on_order - allocated
  NEW.quantity_atp := GREATEST(NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated, 0);
  -- Available to Ship (ATS) = on_hand - allocated
  NEW.quantity_ats := GREATEST(NEW.quantity_on_hand - NEW.quantity_allocated, 0);
  RETURN NEW;
END;
$function$;

-- 3) Ensure triggers exist (recreate safely)
DROP TRIGGER IF EXISTS set_inventory_availability ON public.inventory_items;
CREATE TRIGGER set_inventory_availability
BEFORE INSERT OR UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.update_inventory_availability();

DROP TRIGGER IF EXISTS set_assembly_availability ON public.assemblies;
CREATE TRIGGER set_assembly_availability
BEFORE INSERT OR UPDATE ON public.assemblies
FOR EACH ROW EXECUTE FUNCTION public.update_assembly_availability();

-- 4) Backfill existing rows
UPDATE public.inventory_items
SET 
  quantity_atp = GREATEST(quantity_on_hand + quantity_on_order - quantity_allocated, 0),
  quantity_ats = GREATEST(quantity_on_hand - quantity_allocated, 0);

UPDATE public.assemblies
SET 
  quantity_atp = GREATEST(quantity_on_hand + quantity_on_order - quantity_allocated, 0),
  quantity_ats = GREATEST(quantity_on_hand - quantity_allocated, 0);
