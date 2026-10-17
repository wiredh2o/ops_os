-- Enhance update_daily_ttm_values function to include consumption rate updates
CREATE OR REPLACE FUNCTION public.update_daily_ttm_values()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item_record RECORD;
  assembly_record RECORD;
  total_demand INTEGER;
  calculated_ttm INTEGER;
  items_processed INTEGER := 0;
  assemblies_processed INTEGER := 0;
  items_updated INTEGER := 0;
  assemblies_updated INTEGER := 0;
  consumption_result TEXT;
  start_time TIMESTAMP := now();
BEGIN
  -- First, update consumption rates
  SELECT public.update_daily_consumption_rates() INTO consumption_result;
  
  -- Update TTM for inventory items
  FOR item_record IN
    SELECT id, sku, consumption_last_12_months, consumption_start_date, daily_consumption_rate
    FROM public.inventory_items
  LOOP
    items_processed := items_processed + 1;
    
    -- Get total demand from demand_events in last 365 days
    SELECT COALESCE(SUM(quantity_demanded), 0)
    INTO total_demand
    FROM public.demand_events
    WHERE inventory_item_id = item_record.id
    AND demand_date >= CURRENT_DATE - INTERVAL '365 days';
    
    -- Calculate days since consumption tracking started
    IF item_record.consumption_start_date IS NOT NULL THEN
      DECLARE
        days_since_start INTEGER := CURRENT_DATE - item_record.consumption_start_date;
        historical_demand INTEGER := COALESCE(item_record.consumption_last_12_months, 0);
        blended_demand NUMERIC;
      BEGIN
        -- Apply same transition logic as consumption rates
        IF days_since_start >= 365 THEN
          -- Beginning day 366: Use 100% actual demand
          calculated_ttm := total_demand;
        ELSE
          -- Days 1-365: Use weighted transition
          DECLARE
            historical_weight NUMERIC := (365 - days_since_start) / 365.0;
            actual_weight NUMERIC := days_since_start / 365.0;
          BEGIN
            blended_demand := (historical_weight * historical_demand) + (actual_weight * total_demand);
            calculated_ttm := ROUND(blended_demand)::INTEGER;
          END;
        END IF;
      END;
    ELSE
      -- Fallback to historical data if no consumption_start_date
      calculated_ttm := COALESCE(item_record.consumption_last_12_months, total_demand);
    END IF;
    
    -- Ensure non-negative
    calculated_ttm := GREATEST(calculated_ttm, 0);
    
    -- Update daily demand cache
    INSERT INTO public.daily_demand_cache (
      item_id,
      item_type,
      calculation_date,
      ttm_value,
      historical_days_remaining,
      real_events_days
    ) VALUES (
      item_record.id,
      'inventory_item',
      CURRENT_DATE,
      calculated_ttm,
      GREATEST(365 - COALESCE(CURRENT_DATE - item_record.consumption_start_date, 365), 0),
      LEAST(COALESCE(CURRENT_DATE - item_record.consumption_start_date, 0), 365)
    )
    ON CONFLICT (item_id, item_type, calculation_date)
    DO UPDATE SET
      ttm_value = EXCLUDED.ttm_value,
      historical_days_remaining = EXCLUDED.historical_days_remaining,
      real_events_days = EXCLUDED.real_events_days;
    
    items_updated := items_updated + 1;
  END LOOP;
  
  -- Update TTM for assemblies
  FOR assembly_record IN
    SELECT id, sku, consumption_last_12_months, consumption_start_date, daily_consumption_rate
    FROM public.assemblies
  LOOP
    assemblies_processed := assemblies_processed + 1;
    
    -- Get total demand from assembly_demand_events in last 365 days
    SELECT COALESCE(SUM(quantity_demanded), 0)
    INTO total_demand
    FROM public.assembly_demand_events
    WHERE assembly_id = assembly_record.id
    AND demand_date >= CURRENT_DATE - INTERVAL '365 days';
    
    -- Calculate days since consumption tracking started
    IF assembly_record.consumption_start_date IS NOT NULL THEN
      DECLARE
        days_since_start INTEGER := CURRENT_DATE - assembly_record.consumption_start_date;
        historical_demand INTEGER := COALESCE(assembly_record.consumption_last_12_months, 0);
        blended_demand NUMERIC;
      BEGIN
        -- Apply same transition logic as consumption rates
        IF days_since_start >= 365 THEN
          -- Beginning day 366: Use 100% actual demand
          calculated_ttm := total_demand;
        ELSE
          -- Days 1-365: Use weighted transition
          DECLARE
            historical_weight NUMERIC := (365 - days_since_start) / 365.0;
            actual_weight NUMERIC := days_since_start / 365.0;
          BEGIN
            blended_demand := (historical_weight * historical_demand) + (actual_weight * total_demand);
            calculated_ttm := ROUND(blended_demand)::INTEGER;
          END;
        END IF;
      END;
    ELSE
      -- Fallback to historical data if no consumption_start_date
      calculated_ttm := COALESCE(assembly_record.consumption_last_12_months, total_demand);
    END IF;
    
    -- Ensure non-negative
    calculated_ttm := GREATEST(calculated_ttm, 0);
    
    -- Update daily demand cache
    INSERT INTO public.daily_demand_cache (
      item_id,
      item_type,
      calculation_date,
      ttm_value,
      historical_days_remaining,
      real_events_days
    ) VALUES (
      assembly_record.id,
      'assembly',
      CURRENT_DATE,
      calculated_ttm,
      GREATEST(365 - COALESCE(CURRENT_DATE - assembly_record.consumption_start_date, 365), 0),
      LEAST(COALESCE(CURRENT_DATE - assembly_record.consumption_start_date, 0), 365)
    )
    ON CONFLICT (item_id, item_type, calculation_date)
    DO UPDATE SET
      ttm_value = EXCLUDED.ttm_value,
      historical_days_remaining = EXCLUDED.historical_days_remaining,
      real_events_days = EXCLUDED.real_events_days;
    
    assemblies_updated := assemblies_updated + 1;
  END LOOP;
  
  RETURN FORMAT('TTM values updated successfully for %s items and %s assemblies in %s ms. %s',
    items_updated, assemblies_updated,
    EXTRACT(EPOCH FROM (now() - start_time)) * 1000,
    consumption_result);
END;
$function$;