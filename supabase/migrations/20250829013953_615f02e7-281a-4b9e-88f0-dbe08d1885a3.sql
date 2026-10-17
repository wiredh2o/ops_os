-- Drop triggers first, then recreate functions with proper search_path

-- Drop existing triggers
DROP TRIGGER IF EXISTS inventory_items_density_trigger ON public.inventory_items;
DROP TRIGGER IF EXISTS assemblies_density_trigger ON public.assemblies;

-- Drop and recreate functions with proper search_path
DROP FUNCTION IF EXISTS public.update_inventory_item_density();
DROP FUNCTION IF EXISTS public.update_assembly_density();
DROP FUNCTION IF EXISTS public.calculate_density(NUMERIC, NUMERIC);

-- Recreate calculate_density function with proper search_path
CREATE OR REPLACE FUNCTION public.calculate_density(weight_oz NUMERIC, volume_cubic_inches NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF weight_oz IS NULL OR volume_cubic_inches IS NULL OR volume_cubic_inches = 0 THEN
    RETURN NULL;
  END IF;
  
  RETURN weight_oz / volume_cubic_inches;
END;
$$;

-- Recreate inventory items trigger function with proper search_path
CREATE OR REPLACE FUNCTION public.update_inventory_item_density()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.density = public.calculate_density(NEW.weight_oz, NEW.volume_cubic_inches);
  NEW.packed_density = public.calculate_density(NEW.weight_oz, NEW.packed_volume_cubic_inches);
  RETURN NEW;
END;
$$;

-- Recreate assembly trigger function with proper search_path
CREATE OR REPLACE FUNCTION public.update_assembly_density()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.density = public.calculate_density(NEW.weight_oz, NEW.volume_cubic_inches);
  NEW.packed_density = public.calculate_density(NEW.weight_oz, NEW.packed_volume_cubic_inches);
  RETURN NEW;
END;
$$;

-- Recreate triggers
CREATE TRIGGER inventory_items_density_trigger
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_item_density();

CREATE TRIGGER assemblies_density_trigger
  BEFORE INSERT OR UPDATE ON public.assemblies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_assembly_density();