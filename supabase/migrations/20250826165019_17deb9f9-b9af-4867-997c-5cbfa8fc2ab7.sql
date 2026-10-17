-- Fix any remaining functions that might be missing search_path
-- These are common functions that might exist and need fixing

-- Fix calculate_assembly_rolling_averages if it exists
CREATE OR REPLACE FUNCTION public.calculate_assembly_rolling_averages(assembly_id_param uuid, target_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(quarterly_avg numeric, annual_avg numeric, spike_factor numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  quarterly_total INTEGER := 0;
  annual_total INTEGER := 0;
  quarterly_days INTEGER := 90;
  annual_days INTEGER := 365;
  calculated_spike_factor NUMERIC := 1.0;
BEGIN
  -- Calculate quarterly average (last 90 days)
  SELECT COALESCE(SUM(quantity_demanded), 0)
  INTO quarterly_total
  FROM public.assembly_demand_events 
  WHERE assembly_id = assembly_id_param 
  AND demand_date >= target_date - INTERVAL '90 days'
  AND demand_date <= target_date;
  
  -- Calculate annual average (last 365 days)
  SELECT COALESCE(SUM(quantity_demanded), 0)
  INTO annual_total
  FROM public.assembly_demand_events 
  WHERE assembly_id = assembly_id_param 
  AND demand_date >= target_date - INTERVAL '365 days'
  AND demand_date <= target_date;
  
  -- Calculate averages
  quarterly_avg := quarterly_total::NUMERIC / quarterly_days;
  annual_avg := annual_total::NUMERIC / annual_days;
  
  -- Calculate spike factor (avoid division by zero)
  IF annual_avg > 0 THEN
    calculated_spike_factor := GREATEST(quarterly_avg / annual_avg, 1.0);
  ELSE
    calculated_spike_factor := 1.0;
  END IF;
  
  RETURN QUERY SELECT quarterly_avg, annual_avg, calculated_spike_factor;
END;
$function$;