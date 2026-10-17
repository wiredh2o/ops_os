-- Add density fields to inventory_items table
ALTER TABLE public.inventory_items 
ADD COLUMN density NUMERIC,
ADD COLUMN packed_density NUMERIC;

-- Add density fields to assemblies table
ALTER TABLE public.assemblies 
ADD COLUMN density NUMERIC,
ADD COLUMN packed_density NUMERIC;

-- Create function to safely calculate density
CREATE OR REPLACE FUNCTION public.calculate_density(weight_oz NUMERIC, volume_cubic_inches NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF weight_oz IS NULL OR volume_cubic_inches IS NULL OR volume_cubic_inches = 0 THEN
    RETURN NULL;
  END IF;
  
  RETURN weight_oz / volume_cubic_inches;
END;
$$;

-- Create trigger function for inventory_items density calculation
CREATE OR REPLACE FUNCTION public.update_inventory_item_density()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.density = public.calculate_density(NEW.weight_oz, NEW.volume_cubic_inches);
  NEW.packed_density = public.calculate_density(NEW.weight_oz, NEW.packed_volume_cubic_inches);
  RETURN NEW;
END;
$$;

-- Create trigger function for assemblies density calculation
CREATE OR REPLACE FUNCTION public.update_assembly_density()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.density = public.calculate_density(NEW.weight_oz, NEW.volume_cubic_inches);
  NEW.packed_density = public.calculate_density(NEW.weight_oz, NEW.packed_volume_cubic_inches);
  RETURN NEW;
END;
$$;

-- Create triggers for inventory_items
CREATE TRIGGER inventory_items_density_trigger
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_item_density();

-- Create triggers for assemblies
CREATE TRIGGER assemblies_density_trigger
  BEFORE INSERT OR UPDATE ON public.assemblies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_assembly_density();

-- Update existing inventory_items records
UPDATE public.inventory_items
SET 
  density = public.calculate_density(weight_oz, volume_cubic_inches),
  packed_density = public.calculate_density(weight_oz, packed_volume_cubic_inches);

-- Update existing assemblies records
UPDATE public.assemblies
SET 
  density = public.calculate_density(weight_oz, volume_cubic_inches),
  packed_density = public.calculate_density(weight_oz, packed_volume_cubic_inches);