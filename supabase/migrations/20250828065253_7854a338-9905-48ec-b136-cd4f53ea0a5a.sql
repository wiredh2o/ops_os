-- Create function to update daily consumption rates with precise day 366 transition
CREATE OR REPLACE FUNCTION public.update_daily_consumption_rates()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item_record RECORD;
  assembly_record RECORD;
  days_since_start INTEGER;
  historical_rate NUMERIC;
  actual_rate NUMERIC;
  historical_weight NUMERIC;
  actual_weight NUMERIC;
  calculated_rate NUMERIC;
  items_processed INTEGER := 0;
  assemblies_processed INTEGER := 0;
  items_updated INTEGER := 0;
  assemblies_updated INTEGER := 0;
  start_time TIMESTAMP := now();
BEGIN
  -- Process all inventory items
  FOR item_record IN
    SELECT id, sku, consumption_last_12_months, consumption_start_date, daily_consumption_rate
    FROM public.inventory_items
  LOOP
    items_processed := items_processed + 1;
    
    -- Handle missing consumption_start_date
    IF item_record.consumption_start_date IS NULL THEN
      UPDATE public.inventory_items 
      SET consumption_start_date = CURRENT_DATE
      WHERE id = item_record.id;
      days_since_start := 0;
    ELSE
      days_since_start := CURRENT_DATE - item_record.consumption_start_date;
    END IF;
    
    -- Calculate historical rate (consumption_last_12_months / 365)
    historical_rate := COALESCE(item_record.consumption_last_12_months, 0) / 365.0;
    
    -- Calculate actual rate from demand_events (last 365 days)
    SELECT COALESCE(SUM(quantity_demanded), 0) / 365.0
    INTO actual_rate
    FROM public.demand_events
    WHERE inventory_item_id = item_record.id
    AND demand_date >= CURRENT_DATE - INTERVAL '365 days';
    
    -- Apply precise day 366 transition logic
    IF days_since_start >= 365 THEN
      -- Beginning day 366: Use 100% actual sales data
      calculated_rate := actual_rate;
    ELSE
      -- Days 1-365: Use weighted transition
      historical_weight := (365 - days_since_start) / 365.0;
      actual_weight := days_since_start / 365.0;
      calculated_rate := (historical_weight * historical_rate) + (actual_weight * actual_rate);
    END IF;
    
    -- Ensure non-negative rate
    calculated_rate := GREATEST(calculated_rate, 0);
    
    -- Update if changed
    IF ABS(COALESCE(item_record.daily_consumption_rate, 0) - calculated_rate) > 0.0001 THEN
      UPDATE public.inventory_items
      SET daily_consumption_rate = calculated_rate
      WHERE id = item_record.id;
      items_updated := items_updated + 1;
    END IF;
  END LOOP;
  
  -- Process all assemblies
  FOR assembly_record IN
    SELECT id, sku, consumption_last_12_months, consumption_start_date, daily_consumption_rate
    FROM public.assemblies
  LOOP
    assemblies_processed := assemblies_processed + 1;
    
    -- Handle missing consumption_start_date
    IF assembly_record.consumption_start_date IS NULL THEN
      UPDATE public.assemblies 
      SET consumption_start_date = CURRENT_DATE
      WHERE id = assembly_record.id;
      days_since_start := 0;
    ELSE
      days_since_start := CURRENT_DATE - assembly_record.consumption_start_date;
    END IF;
    
    -- Calculate historical rate (consumption_last_12_months / 365)
    historical_rate := COALESCE(assembly_record.consumption_last_12_months, 0) / 365.0;
    
    -- Calculate actual rate from assembly_demand_events (last 365 days)
    SELECT COALESCE(SUM(quantity_demanded), 0) / 365.0
    INTO actual_rate
    FROM public.assembly_demand_events
    WHERE assembly_id = assembly_record.id
    AND demand_date >= CURRENT_DATE - INTERVAL '365 days';
    
    -- Apply precise day 366 transition logic
    IF days_since_start >= 365 THEN
      -- Beginning day 366: Use 100% actual sales data
      calculated_rate := actual_rate;
    ELSE
      -- Days 1-365: Use weighted transition
      historical_weight := (365 - days_since_start) / 365.0;
      actual_weight := days_since_start / 365.0;
      calculated_rate := (historical_weight * historical_rate) + (actual_weight * actual_rate);
    END IF;
    
    -- Ensure non-negative rate
    calculated_rate := GREATEST(calculated_rate, 0);
    
    -- Update if changed
    IF ABS(COALESCE(assembly_record.daily_consumption_rate, 0) - calculated_rate) > 0.0001 THEN
      UPDATE public.assemblies
      SET daily_consumption_rate = calculated_rate
      WHERE id = assembly_record.id;
      assemblies_updated := assemblies_updated + 1;
    END IF;
  END LOOP;
  
  RETURN FORMAT('Daily consumption rates updated: %s/%s items, %s/%s assemblies updated in %s ms',
    items_updated, items_processed, assemblies_updated, assemblies_processed,
    EXTRACT(EPOCH FROM (now() - start_time)) * 1000);
END;
$function$;