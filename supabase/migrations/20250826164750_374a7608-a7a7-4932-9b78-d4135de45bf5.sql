-- Fix security warnings by setting proper search_path for functions

-- Fix function 1: calculate_pull_demand_rate
CREATE OR REPLACE FUNCTION public.calculate_pull_demand_rate(item_id uuid, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total_demand NUMERIC;
  demand_rate NUMERIC;
BEGIN
  -- Calculate total demand over analysis period
  SELECT COALESCE(SUM(quantity_demanded), 0)
  INTO total_demand
  FROM public.demand_events
  WHERE inventory_item_id = item_id
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  -- Calculate daily demand rate
  demand_rate := total_demand / analysis_period_days;
  
  RETURN GREATEST(demand_rate, 0);
END;
$function$;

-- Fix function 2: calculate_statistical_safety_stock
CREATE OR REPLACE FUNCTION public.calculate_statistical_safety_stock(item_id uuid, lead_time_days integer, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  demand_stddev NUMERIC;
  safety_stock NUMERIC;
  z_score NUMERIC := 3.09; -- 99.9% service level
BEGIN
  -- Calculate demand standard deviation over the analysis period
  SELECT COALESCE(STDDEV(daily_demand), 0)
  INTO demand_stddev
  FROM (
    SELECT 
      demand_date,
      SUM(quantity_demanded) as daily_demand
    FROM public.demand_events
    WHERE inventory_item_id = item_id
    AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days
    GROUP BY demand_date
  ) daily_demands;
  
  -- Calculate statistical safety stock: Z-score × StdDev × √(Lead Time)
  safety_stock := z_score * demand_stddev * SQRT(lead_time_days);
  
  RETURN GREATEST(safety_stock, 0);
END;
$function$;

-- Fix function 3: sync_accumulated_hours 
CREATE OR REPLACE FUNCTION public.sync_accumulated_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.total_accumulated_hours = NEW.total_accumulated_ms / 3600000.0;
  RETURN NEW;
END;
$function$;

-- Fix function 4: validate_timer_changes
CREATE OR REPLACE FUNCTION public.validate_timer_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Ensure timer state consistency
  IF NEW.timer_active = TRUE AND NEW.timer_user_id IS NULL THEN
    RAISE EXCEPTION 'Timer cannot be active without a user';
  END IF;
  
  IF NEW.timer_active = FALSE AND NEW.timer_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Timer cannot be inactive with a user assigned';
  END IF;
  
  -- Prevent negative accumulated hours
  IF NEW.total_accumulated_hours < 0 THEN
    RAISE EXCEPTION 'Total accumulated hours cannot be negative';
  END IF;
  
  RETURN NEW;
END;
$function$;