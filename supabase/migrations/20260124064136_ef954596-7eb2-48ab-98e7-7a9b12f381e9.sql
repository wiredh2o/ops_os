-- =============================================
-- DROP existing functions to allow return type changes
-- =============================================

DROP FUNCTION IF EXISTS public.calculate_lean_pull_reorder_point(uuid, integer, integer, integer);
DROP FUNCTION IF EXISTS public.calculate_assembly_lean_pull_reorder_point(uuid, integer, integer);

-- =============================================
-- FIX #2: Demand Rate Calculation
-- Problem: Always divides by 365 even if less than 365 days of data
-- Solution: Divide by actual days of data available
-- =============================================

-- Drop and recreate the pull demand rate function for inventory items
CREATE OR REPLACE FUNCTION public.calculate_pull_demand_rate(
  item_id uuid, 
  analysis_period_days integer DEFAULT 365
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  total_demand NUMERIC;
  first_demand_date DATE;
  actual_days INTEGER;
  demand_rate NUMERIC;
BEGIN
  -- Get total demand and first demand date within the analysis period
  SELECT 
    COALESCE(SUM(quantity_demanded), 0),
    MIN(demand_date)
  INTO total_demand, first_demand_date
  FROM public.demand_events
  WHERE inventory_item_id = item_id
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  -- Calculate actual days of data (not always the full analysis period!)
  IF first_demand_date IS NOT NULL THEN
    actual_days := GREATEST((CURRENT_DATE - first_demand_date)::INTEGER, 1);
    -- Don't exceed the analysis period
    actual_days := LEAST(actual_days, analysis_period_days);
  ELSE
    -- No demand data at all - use 1 to avoid division by zero, rate will be 0
    actual_days := 1;
  END IF;
  
  demand_rate := total_demand / actual_days;
  
  RETURN GREATEST(demand_rate, 0);
END;
$$;

-- Drop and recreate the pull demand rate function for assemblies
CREATE OR REPLACE FUNCTION public.calculate_assembly_pull_demand_rate(
  assembly_id_param uuid, 
  analysis_period_days integer DEFAULT 365
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  total_demand NUMERIC;
  first_demand_date DATE;
  actual_days INTEGER;
  demand_rate NUMERIC;
BEGIN
  -- Get total demand and first demand date within the analysis period
  SELECT 
    COALESCE(SUM(quantity_demanded), 0),
    MIN(demand_date)
  INTO total_demand, first_demand_date
  FROM public.assembly_demand_events
  WHERE assembly_id = assembly_id_param
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  -- Calculate actual days of data (not always the full analysis period!)
  IF first_demand_date IS NOT NULL THEN
    actual_days := GREATEST((CURRENT_DATE - first_demand_date)::INTEGER, 1);
    -- Don't exceed the analysis period
    actual_days := LEAST(actual_days, analysis_period_days);
  ELSE
    -- No demand data at all - use 1 to avoid division by zero, rate will be 0
    actual_days := 1;
  END IF;
  
  demand_rate := total_demand / actual_days;
  
  RETURN GREATEST(demand_rate, 0);
END;
$$;

-- =============================================
-- FIX #3: Standard Deviation Calculation
-- Problem: Only considers days with sales, ignoring zero-demand days
-- Solution: Include zero-demand days in the variance calculation
-- =============================================

-- Drop and recreate the statistical safety stock function for inventory items
CREATE OR REPLACE FUNCTION public.calculate_statistical_safety_stock(
  item_id uuid, 
  lead_time_days integer, 
  analysis_period_days integer DEFAULT 365
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  demand_stddev NUMERIC;
  safety_stock NUMERIC;
  z_score NUMERIC := 3.09; -- 99.9% service level
  first_demand_date DATE;
  actual_days INTEGER;
  avg_daily_demand NUMERIC;
  sum_squared_deviations NUMERIC;
  days_with_sales INTEGER;
BEGIN
  -- Get first demand date to determine actual analysis window
  SELECT MIN(demand_date)
  INTO first_demand_date
  FROM public.demand_events
  WHERE inventory_item_id = item_id
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  IF first_demand_date IS NULL THEN
    RETURN 0; -- No demand history, no safety stock needed
  END IF;
  
  actual_days := GREATEST((CURRENT_DATE - first_demand_date)::INTEGER, 1);
  actual_days := LEAST(actual_days, analysis_period_days);
  
  -- Calculate average daily demand INCLUDING zero-demand days
  SELECT COALESCE(SUM(quantity_demanded), 0) / actual_days
  INTO avg_daily_demand
  FROM public.demand_events
  WHERE inventory_item_id = item_id
  AND demand_date >= first_demand_date;
  
  -- Calculate standard deviation INCLUDING zero-demand days
  SELECT 
    COALESCE(SUM(POWER(daily_demand - avg_daily_demand, 2)), 0),
    COUNT(*)
  INTO sum_squared_deviations, days_with_sales
  FROM (
    SELECT 
      demand_date,
      SUM(quantity_demanded) as daily_demand
    FROM public.demand_events
    WHERE inventory_item_id = item_id
    AND demand_date >= first_demand_date
    GROUP BY demand_date
  ) daily_demands;
  
  -- Add squared deviations for zero-demand days
  sum_squared_deviations := sum_squared_deviations + 
    ((actual_days - days_with_sales) * POWER(avg_daily_demand, 2));
  
  -- Population standard deviation
  demand_stddev := SQRT(sum_squared_deviations / actual_days);
  
  -- Safety stock formula: z-score × σ × √(lead time)
  safety_stock := z_score * demand_stddev * SQRT(lead_time_days);
  
  RETURN GREATEST(safety_stock, 0);
END;
$$;

-- Drop and recreate the statistical safety stock function for assemblies
CREATE OR REPLACE FUNCTION public.calculate_assembly_statistical_safety_stock(
  assembly_id_param uuid, 
  lead_time_days integer, 
  analysis_period_days integer DEFAULT 365
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  demand_stddev NUMERIC;
  safety_stock NUMERIC;
  z_score NUMERIC := 3.09; -- 99.9% service level
  first_demand_date DATE;
  actual_days INTEGER;
  avg_daily_demand NUMERIC;
  sum_squared_deviations NUMERIC;
  days_with_sales INTEGER;
BEGIN
  -- Get first demand date to determine actual analysis window
  SELECT MIN(demand_date)
  INTO first_demand_date
  FROM public.assembly_demand_events
  WHERE assembly_id = assembly_id_param
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  IF first_demand_date IS NULL THEN
    RETURN 0; -- No demand history, no safety stock needed
  END IF;
  
  actual_days := GREATEST((CURRENT_DATE - first_demand_date)::INTEGER, 1);
  actual_days := LEAST(actual_days, analysis_period_days);
  
  -- Calculate average daily demand INCLUDING zero-demand days
  SELECT COALESCE(SUM(quantity_demanded), 0) / actual_days
  INTO avg_daily_demand
  FROM public.assembly_demand_events
  WHERE assembly_id = assembly_id_param
  AND demand_date >= first_demand_date;
  
  -- Calculate standard deviation INCLUDING zero-demand days
  SELECT 
    COALESCE(SUM(POWER(daily_demand - avg_daily_demand, 2)), 0),
    COUNT(*)
  INTO sum_squared_deviations, days_with_sales
  FROM (
    SELECT 
      demand_date,
      SUM(quantity_demanded) as daily_demand
    FROM public.assembly_demand_events
    WHERE assembly_id = assembly_id_param
    AND demand_date >= first_demand_date
    GROUP BY demand_date
  ) daily_demands;
  
  -- Add squared deviations for zero-demand days
  sum_squared_deviations := sum_squared_deviations + 
    ((actual_days - days_with_sales) * POWER(avg_daily_demand, 2));
  
  -- Population standard deviation
  demand_stddev := SQRT(sum_squared_deviations / actual_days);
  
  -- Safety stock formula: z-score × σ × √(lead time)
  safety_stock := z_score * demand_stddev * SQRT(lead_time_days);
  
  RETURN GREATEST(safety_stock, 0);
END;
$$;

-- =============================================
-- UPDATE: Main LEAN pull reorder point function
-- Added actual_analysis_days output for transparency
-- =============================================

CREATE FUNCTION public.calculate_lean_pull_reorder_point(
  item_id uuid,
  lead_time_days integer,
  minimum_order_quantity integer DEFAULT 1,
  analysis_period_days integer DEFAULT 365
)
RETURNS TABLE(
  reorder_point integer,
  demand_rate numeric,
  safety_stock numeric,
  recommended_order_qty integer,
  moq_coverage_days numeric,
  actual_analysis_days integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_demand_rate NUMERIC;
  calculated_safety_stock NUMERIC;
  calculated_reorder_point INTEGER;
  demand_during_lead_time NUMERIC;
  natural_order_qty INTEGER;
  moq_adjusted_qty INTEGER;
  moq_days_coverage NUMERIC;
  first_demand_date DATE;
  actual_days INTEGER;
BEGIN
  -- Get actual days of data available
  SELECT MIN(demand_date)
  INTO first_demand_date
  FROM public.demand_events
  WHERE inventory_item_id = item_id
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  IF first_demand_date IS NOT NULL THEN
    actual_days := GREATEST((CURRENT_DATE - first_demand_date)::INTEGER, 1);
    actual_days := LEAST(actual_days, analysis_period_days);
  ELSE
    actual_days := 0;
  END IF;
  
  -- Calculate demand rate using corrected function (divides by actual days)
  calculated_demand_rate := public.calculate_pull_demand_rate(item_id, analysis_period_days);
  
  -- Calculate safety stock using corrected function (includes zero-demand days)
  calculated_safety_stock := public.calculate_statistical_safety_stock(item_id, lead_time_days, analysis_period_days);
  
  -- Demand during lead time
  demand_during_lead_time := calculated_demand_rate * lead_time_days;
  
  -- Reorder point = demand during lead time + safety stock
  calculated_reorder_point := CEIL(demand_during_lead_time + calculated_safety_stock);
  
  -- Natural order quantity = demand during lead time (covers wait period)
  -- NOTE: The edge function will add the "shortage" (reorder_point - effective_inventory)
  natural_order_qty := GREATEST(CEIL(demand_during_lead_time), 1);
  
  -- Apply MOQ
  moq_adjusted_qty := GREATEST(natural_order_qty, minimum_order_quantity);
  
  -- How many days does the MOQ cover?
  IF calculated_demand_rate > 0 THEN
    moq_days_coverage := moq_adjusted_qty / calculated_demand_rate;
  ELSE
    moq_days_coverage := 999; -- Effectively infinite if no demand
  END IF;
  
  RETURN QUERY SELECT 
    calculated_reorder_point,
    calculated_demand_rate,
    calculated_safety_stock,
    moq_adjusted_qty,
    moq_days_coverage,
    actual_days;
END;
$$;

-- Same update for assemblies
CREATE FUNCTION public.calculate_assembly_lean_pull_reorder_point(
  assembly_id_param uuid,
  lead_time_days integer,
  analysis_period_days integer DEFAULT 365
)
RETURNS TABLE(
  reorder_point integer,
  demand_rate numeric,
  safety_stock numeric,
  recommended_order_qty integer,
  actual_analysis_days integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  calculated_demand_rate NUMERIC;
  calculated_safety_stock NUMERIC;
  calculated_reorder_point INTEGER;
  demand_during_lead_time NUMERIC;
  natural_order_qty INTEGER;
  first_demand_date DATE;
  actual_days INTEGER;
BEGIN
  -- Get actual days of data available
  SELECT MIN(demand_date)
  INTO first_demand_date
  FROM public.assembly_demand_events
  WHERE assembly_id = assembly_id_param
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  IF first_demand_date IS NOT NULL THEN
    actual_days := GREATEST((CURRENT_DATE - first_demand_date)::INTEGER, 1);
    actual_days := LEAST(actual_days, analysis_period_days);
  ELSE
    actual_days := 0;
  END IF;
  
  -- Calculate demand rate using corrected function
  calculated_demand_rate := public.calculate_assembly_pull_demand_rate(assembly_id_param, analysis_period_days);
  
  -- Calculate safety stock using corrected function
  calculated_safety_stock := public.calculate_assembly_statistical_safety_stock(assembly_id_param, lead_time_days, analysis_period_days);
  
  -- Demand during lead time
  demand_during_lead_time := calculated_demand_rate * lead_time_days;
  
  -- Reorder point = demand during lead time + safety stock
  calculated_reorder_point := CEIL(demand_during_lead_time + calculated_safety_stock);
  
  -- Natural order quantity = demand during lead time
  -- NOTE: The edge function will add the "shortage" (reorder_point - effective_inventory)
  natural_order_qty := GREATEST(CEIL(demand_during_lead_time), 1);
  
  RETURN QUERY SELECT 
    calculated_reorder_point,
    calculated_demand_rate,
    calculated_safety_stock,
    natural_order_qty,
    actual_days;
END;
$$;