-- Add lead_time_days to assemblies table
ALTER TABLE public.assemblies 
ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 30;

-- Update calculate_dynamic_reorder_point to use 3 tiers with 14-day minimum
CREATE OR REPLACE FUNCTION public.calculate_dynamic_reorder_point(
  item_id uuid, 
  lead_time_days integer, 
  spike_threshold numeric DEFAULT 1.3
)
RETURNS integer
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
  reorder_point INTEGER;
  minimum_14_day_stock INTEGER;
BEGIN
  -- Get rolling averages and spike factor
  SELECT q.quarterly_avg, q.annual_avg, q.spike_factor
  INTO quarterly_avg, annual_avg, spike_factor
  FROM public.calculate_inventory_rolling_averages(item_id) q;
  
  -- Determine safety stock multiplier based on 3 tiers
  IF lead_time_days >= 90 THEN -- Long: 90+ days
    safety_stock_multiplier := 2.0;
  ELSIF lead_time_days >= 30 THEN -- Medium: 30-89 days
    safety_stock_multiplier := 1.5;
  ELSE -- Short: < 30 days
    safety_stock_multiplier := 1.0;
  END IF;
  
  -- Choose demand rate based on spike detection
  IF spike_factor >= spike_threshold AND lead_time_days >= 30 THEN
    base_demand := quarterly_avg;
    safety_stock := (quarterly_avg * safety_stock_multiplier * spike_factor);
  ELSE
    base_demand := annual_avg;
    safety_stock := (annual_avg * safety_stock_multiplier);
  END IF;
  
  -- Calculate reorder point
  reorder_point := CEIL((base_demand * lead_time_days) + safety_stock);
  
  -- Calculate 14-day minimum stock requirement
  minimum_14_day_stock := CEIL(GREATEST(quarterly_avg, annual_avg) * 14);
  
  -- Ensure reorder point meets 14-day minimum
  reorder_point := GREATEST(reorder_point, minimum_14_day_stock);
  
  RETURN GREATEST(reorder_point, 0);
END;
$function$;

-- Create new function for assembly dynamic reorder points
CREATE OR REPLACE FUNCTION public.calculate_assembly_dynamic_reorder_point(
  assembly_id_param uuid, 
  lead_time_days integer DEFAULT 30
)
RETURNS integer
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
  reorder_point INTEGER;
  minimum_14_day_stock INTEGER;
BEGIN
  -- Get rolling averages
  SELECT q.quarterly_avg, q.annual_avg
  INTO quarterly_avg, annual_avg
  FROM public.calculate_assembly_rolling_averages(assembly_id_param) q;
  
  -- Determine safety stock multiplier based on 3 tiers
  IF lead_time_days >= 90 THEN -- Long: 90+ days
    safety_stock_multiplier := 2.0;
  ELSIF lead_time_days >= 30 THEN -- Medium: 30-89 days
    safety_stock_multiplier := 1.5;
  ELSE -- Short: < 30 days
    safety_stock_multiplier := 1.0;
  END IF;
  
  -- Use annual average as base demand for assemblies
  base_demand := annual_avg;
  safety_stock := (annual_avg * safety_stock_multiplier);
  
  -- Calculate reorder point
  reorder_point := CEIL((base_demand * lead_time_days) + safety_stock);
  
  -- Calculate 14-day minimum stock requirement
  minimum_14_day_stock := CEIL(GREATEST(quarterly_avg, annual_avg) * 14);
  
  -- Ensure reorder point meets 14-day minimum
  reorder_point := GREATEST(reorder_point, minimum_14_day_stock);
  
  RETURN GREATEST(reorder_point, 0);
END;
$function$;