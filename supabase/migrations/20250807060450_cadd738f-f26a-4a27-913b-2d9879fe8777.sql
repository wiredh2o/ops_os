-- Remove inventory view mode functionality step by step
-- First drop the dependent functions, then the enum

-- Drop the mode-aware functions that depend on inventory_view_mode enum
DROP FUNCTION IF EXISTS public.calculate_mode_aware_reorder_point(uuid, integer, inventory_view_mode, numeric);
DROP FUNCTION IF EXISTS public.calculate_mode_aware_assembly_reorder_point(uuid, inventory_view_mode);

-- Drop the inventory_mode_config table
DROP TABLE IF EXISTS public.inventory_mode_config;

-- Remove default_inventory_view_mode from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS default_inventory_view_mode;

-- Now drop the enum
DROP TYPE IF EXISTS public.inventory_view_mode;

-- Create simplified reorder point functions
CREATE OR REPLACE FUNCTION public.calculate_simplified_reorder_point(item_id uuid, lead_time_days integer, spike_threshold numeric DEFAULT 1.3)
 RETURNS TABLE(reorder_point integer, actual_lead_time_days integer, lead_time_data_points integer, safety_stock_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  quarterly_avg NUMERIC;
  annual_avg NUMERIC;
  spike_factor NUMERIC;
  safety_stock_multiplier NUMERIC;
  base_demand NUMERIC;
  safety_stock NUMERIC;
  calculated_reorder_point INTEGER;
  minimum_14_day_stock INTEGER;
  actual_lead_time INTEGER;
  data_points INTEGER;
  quoted_lead_time INTEGER;
  effective_lead_time INTEGER;
  tier_name TEXT;
BEGIN
  -- Get rolling averages and spike factor
  SELECT q.quarterly_avg, q.annual_avg, q.spike_factor
  INTO quarterly_avg, annual_avg, spike_factor
  FROM public.calculate_inventory_rolling_averages(item_id) q;
  
  -- Get actual lead time with fallback strategy
  SELECT alt.actual_lead_time_days, alt.data_points, ii.lead_time_days
  INTO actual_lead_time, data_points, quoted_lead_time
  FROM public.calculate_inventory_actual_lead_time(item_id) alt
  CROSS JOIN public.inventory_items ii
  WHERE ii.id = item_id;
  
  -- Enhanced fallback strategy for lead time
  IF data_points >= 3 THEN
    effective_lead_time := actual_lead_time;
  ELSIF quoted_lead_time IS NOT NULL THEN
    IF quoted_lead_time >= 180 THEN
      effective_lead_time := CEIL(quoted_lead_time * 1.3);
    ELSE
      effective_lead_time := CEIL(quoted_lead_time * 1.2);
    END IF;
  ELSE
    effective_lead_time := 30; -- Default fallback
  END IF;
  
  -- 4-tier safety stock multiplier based on effective lead time
  IF effective_lead_time >= 180 THEN
    safety_stock_multiplier := 2.5;
    tier_name := 'Extra Long (180+ days)';
  ELSIF effective_lead_time >= 90 THEN
    safety_stock_multiplier := 2.0;
    tier_name := 'Long (90-179 days)';
  ELSIF effective_lead_time >= 30 THEN
    safety_stock_multiplier := 1.5;
    tier_name := 'Medium (30-89 days)';
  ELSE
    safety_stock_multiplier := 1.0;
    tier_name := 'Short (<30 days)';
  END IF;
  
  -- Choose demand rate based on spike detection
  IF spike_factor >= spike_threshold AND effective_lead_time >= 30 THEN
    IF effective_lead_time >= 180 THEN
      base_demand := quarterly_avg;
    ELSE
      base_demand := quarterly_avg;
    END IF;
    safety_stock := (base_demand * safety_stock_multiplier * spike_factor);
  ELSE
    base_demand := annual_avg;
    safety_stock := (annual_avg * safety_stock_multiplier);
  END IF;
  
  -- Calculate reorder point
  calculated_reorder_point := CEIL((base_demand * effective_lead_time) + safety_stock);
  
  -- Calculate 14-day minimum stock requirement
  minimum_14_day_stock := CEIL(GREATEST(quarterly_avg, annual_avg) * 14);
  
  -- Ensure reorder point meets 14-day minimum
  calculated_reorder_point := GREATEST(calculated_reorder_point, minimum_14_day_stock);
  
  RETURN QUERY SELECT 
    GREATEST(calculated_reorder_point, 0),
    effective_lead_time,
    COALESCE(data_points, 0),
    tier_name;
END;
$function$;

-- Simplified assembly reorder point function
CREATE OR REPLACE FUNCTION public.calculate_simplified_assembly_reorder_point(assembly_id_param uuid)
 RETURNS TABLE(reorder_point integer, actual_lead_time_days integer, lead_time_data_points integer, safety_stock_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  quarterly_avg NUMERIC;
  annual_avg NUMERIC;
  safety_stock_multiplier NUMERIC;
  base_demand NUMERIC;
  safety_stock NUMERIC;
  calculated_reorder_point INTEGER;
  minimum_14_day_stock INTEGER;
  actual_lead_time INTEGER;
  data_points INTEGER;
  quoted_lead_time INTEGER;
  effective_lead_time INTEGER;
  tier_name TEXT;
BEGIN
  -- Get rolling averages
  SELECT q.quarterly_avg, q.annual_avg
  INTO quarterly_avg, annual_avg
  FROM public.calculate_assembly_rolling_averages(assembly_id_param) q;
  
  -- Get actual lead time with fallback strategy
  SELECT alt.actual_lead_time_days, alt.data_points, a.lead_time_days
  INTO actual_lead_time, data_points, quoted_lead_time
  FROM public.calculate_assembly_actual_lead_time(assembly_id_param) alt
  CROSS JOIN public.assemblies a
  WHERE a.id = assembly_id_param;
  
  -- Enhanced fallback strategy for lead time
  IF data_points >= 3 THEN
    effective_lead_time := actual_lead_time;
  ELSIF quoted_lead_time IS NOT NULL THEN
    IF quoted_lead_time >= 180 THEN
      effective_lead_time := CEIL(quoted_lead_time * 1.3);
    ELSE
      effective_lead_time := CEIL(quoted_lead_time * 1.2);
    END IF;
  ELSE
    effective_lead_time := 14; -- Default for assemblies
  END IF;
  
  -- 4-tier safety stock multiplier based on effective lead time
  IF effective_lead_time >= 180 THEN
    safety_stock_multiplier := 2.5;
    tier_name := 'Extra Long (180+ days)';
  ELSIF effective_lead_time >= 90 THEN
    safety_stock_multiplier := 2.0;
    tier_name := 'Long (90-179 days)';
  ELSIF effective_lead_time >= 30 THEN
    safety_stock_multiplier := 1.5;
    tier_name := 'Medium (30-89 days)';
  ELSE
    safety_stock_multiplier := 1.0;
    tier_name := 'Short (<30 days)';
  END IF;
  
  -- Use annual average as base demand for assemblies
  base_demand := annual_avg;
  safety_stock := (annual_avg * safety_stock_multiplier);
  
  -- Calculate reorder point
  calculated_reorder_point := CEIL((base_demand * effective_lead_time) + safety_stock);
  
  -- Calculate 14-day minimum stock requirement
  minimum_14_day_stock := CEIL(GREATEST(quarterly_avg, annual_avg) * 14);
  
  -- Ensure reorder point meets 14-day minimum
  calculated_reorder_point := GREATEST(calculated_reorder_point, minimum_14_day_stock);
  
  RETURN QUERY SELECT 
    GREATEST(calculated_reorder_point, 0),
    effective_lead_time,
    COALESCE(data_points, 0),
    tier_name;
END;
$function$;