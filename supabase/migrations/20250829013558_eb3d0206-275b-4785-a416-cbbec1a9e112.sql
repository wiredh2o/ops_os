-- Fix security warnings by setting search_path for functions

-- Drop and recreate calculate_density function with proper search_path
DROP FUNCTION IF EXISTS public.calculate_density(NUMERIC, NUMERIC);

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

-- Drop and recreate inventory items trigger function with proper search_path
DROP FUNCTION IF EXISTS public.update_inventory_item_density();

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

-- Drop and recreate assembly trigger function with proper search_path
DROP FUNCTION IF EXISTS public.update_assembly_density();

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