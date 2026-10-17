-- Fix security linter warnings: Function Search Path Mutable
-- Set proper search_path for the has_role function and other functions

-- Fix the has_role function search path
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Also fix other functions that might have the same issue
-- Let me update all the calculation functions to have proper search_path

CREATE OR REPLACE FUNCTION public.calculate_statistical_safety_stock(item_id uuid, lead_time_days integer, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.calculate_pull_demand_rate(item_id uuid, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $$
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
$$;