-- Assembly Waste Tracking Implementation - Phase 1: Database Schema Extensions

-- Extend production_order_items table with waste tracking fields
ALTER TABLE public.production_order_items 
ADD COLUMN planned_build_quantity integer,
ADD COLUMN yield_quantity integer,
ADD COLUMN waste_quantity integer,
ADD COLUMN waste_percentage numeric,
ADD COLUMN setup_timer_ms bigint DEFAULT 0,
ADD COLUMN build_test_timer_ms bigint DEFAULT 0,
ADD COLUMN setup_completed_at timestamp with time zone,
ADD COLUMN build_completed_at timestamp with time zone,
ADD COLUMN materials_consumed_cost numeric DEFAULT 0,
ADD COLUMN materials_wasted_cost numeric DEFAULT 0,
ADD COLUMN cost_per_good_unit numeric DEFAULT 0;

-- Create component_price_history table for weekly price snapshots
CREATE TABLE public.component_price_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id uuid NOT NULL,
  price_date date NOT NULL,
  last_paid_unit_cost numeric NOT NULL DEFAULT 0,
  purchase_order_reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX idx_component_price_history_item_date ON public.component_price_history (inventory_item_id, price_date);
CREATE INDEX idx_component_price_history_date ON public.component_price_history (price_date);

-- Enable RLS for component_price_history
ALTER TABLE public.component_price_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for component_price_history
CREATE POLICY "Component price history viewable by authenticated users"
ON public.component_price_history
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Component price history manageable by authenticated users"
ON public.component_price_history
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Create assembly_waste_analytics table for daily waste metrics
CREATE TABLE public.assembly_waste_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assembly_id uuid NOT NULL,
  analysis_date date NOT NULL,
  total_planned_quantity integer NOT NULL DEFAULT 0,
  total_yield_quantity integer NOT NULL DEFAULT 0,
  total_waste_quantity integer NOT NULL DEFAULT 0,
  waste_percentage numeric NOT NULL DEFAULT 0,
  materials_efficiency numeric NOT NULL DEFAULT 0,
  setup_time_per_unit numeric NOT NULL DEFAULT 0,
  build_time_per_unit numeric NOT NULL DEFAULT 0,
  component_cost_trend numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for assembly_waste_analytics
CREATE INDEX idx_assembly_waste_analytics_assembly_date ON public.assembly_waste_analytics (assembly_id, analysis_date);
CREATE INDEX idx_assembly_waste_analytics_date ON public.assembly_waste_analytics (analysis_date);

-- Enable RLS for assembly_waste_analytics
ALTER TABLE public.assembly_waste_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for assembly_waste_analytics
CREATE POLICY "Assembly waste analytics viewable by authenticated users"
ON public.assembly_waste_analytics
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly waste analytics manageable by authenticated users"
ON public.assembly_waste_analytics
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Create assembly_waste_alerts table for threshold monitoring
CREATE TABLE public.assembly_waste_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assembly_id uuid NOT NULL,
  alert_date date NOT NULL,
  current_waste_rate numeric NOT NULL,
  historical_average numeric NOT NULL,
  threshold_percentage numeric NOT NULL DEFAULT 20.0,
  variance_amount numeric NOT NULL,
  alert_status text NOT NULL DEFAULT 'active' CHECK (alert_status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_by uuid,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for assembly_waste_alerts
CREATE INDEX idx_assembly_waste_alerts_assembly ON public.assembly_waste_alerts (assembly_id);
CREATE INDEX idx_assembly_waste_alerts_status ON public.assembly_waste_alerts (alert_status);
CREATE INDEX idx_assembly_waste_alerts_date ON public.assembly_waste_alerts (alert_date);

-- Enable RLS for assembly_waste_alerts
ALTER TABLE public.assembly_waste_alerts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for assembly_waste_alerts
CREATE POLICY "Assembly waste alerts viewable by authenticated users"
ON public.assembly_waste_alerts
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly waste alerts manageable by authenticated users"
ON public.assembly_waste_alerts
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Phase 2: Cost Calculation Functions

-- Function to populate weekly component prices (batch job for Mondays)
CREATE OR REPLACE FUNCTION public.populate_weekly_component_prices()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
As $function$
DECLARE
  target_date date := CURRENT_DATE;
  records_inserted integer := 0;
  item_record RECORD;
  latest_cost numeric;
  latest_po_ref text;
BEGIN
  -- Ensure we're working with a Monday (start of week)
  target_date := date_trunc('week', target_date)::date;
  
  -- Only insert if we don't already have data for this week
  IF EXISTS (SELECT 1 FROM public.component_price_history WHERE price_date = target_date) THEN
    RETURN 'Weekly prices already populated for ' || target_date::text;
  END IF;
  
  -- Process all inventory items
  FOR item_record IN
    SELECT id, sku FROM public.inventory_items
  LOOP
    -- Get the most recent purchase price for this item
    SELECT poi.unit_cost, po.purchase_order_number
    INTO latest_cost, latest_po_ref
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON poi.purchase_order_id = po.id
    WHERE poi.inventory_item_id = item_record.id
    AND po.order_date <= target_date
    ORDER BY po.order_date DESC, po.created_at DESC
    LIMIT 1;
    
    -- Insert price history record if we found a price
    IF latest_cost IS NOT NULL THEN
      INSERT INTO public.component_price_history (
        inventory_item_id,
        price_date,
        last_paid_unit_cost,
        purchase_order_reference
      ) VALUES (
        item_record.id,
        target_date,
        latest_cost,
        latest_po_ref
      );
      
      records_inserted := records_inserted + 1;
    END IF;
  END LOOP;
  
  RETURN FORMAT('Populated %s component price records for week of %s', records_inserted, target_date::text);
END;
$function$;

-- Function to get component cost trend for an assembly over time
CREATE OR REPLACE FUNCTION public.get_component_cost_trend(assembly_id_param uuid, date_from date, date_to date)
RETURNS TABLE(trend_date date, total_component_cost numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
As $function$
BEGIN
  RETURN QUERY
  WITH assembly_components AS (
    -- Get all components needed for this assembly
    SELECT ac.inventory_item_id, ac.quantity_needed
    FROM public.assembly_components ac
    WHERE ac.assembly_id = assembly_id_param
  ),
  weekly_dates AS (
    -- Generate weekly dates in the range
    SELECT generate_series(
      date_trunc('week', date_from)::date,
      date_trunc('week', date_to)::date,
      '1 week'::interval
    )::date as week_date
  ),
  cost_by_week AS (
    -- Calculate total component cost for each week
    SELECT 
      wd.week_date,
      SUM(ac.quantity_needed * COALESCE(cph.last_paid_unit_cost, 0)) as week_total_cost
    FROM weekly_dates wd
    CROSS JOIN assembly_components ac
    LEFT JOIN public.component_price_history cph ON 
      cph.inventory_item_id = ac.inventory_item_id 
      AND cph.price_date = wd.week_date
    GROUP BY wd.week_date
  )
  SELECT cbw.week_date, cbw.week_total_cost
  FROM cost_by_week cbw
  ORDER BY cbw.week_date;
END;
$function$;

-- Function to calculate assembly waste metrics for analytics
CREATE OR REPLACE FUNCTION public.calculate_assembly_waste_metrics(target_date date DEFAULT CURRENT_DATE)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
As $function$
DECLARE
  assembly_record RECORD;
  records_processed integer := 0;
  total_planned integer;
  total_yield integer;
  total_waste integer;
  waste_pct numeric;
  avg_setup_time numeric;
  avg_build_time numeric;
  cost_trend numeric;
BEGIN
  -- Process each assembly that had production activity on target_date
  FOR assembly_record IN
    SELECT DISTINCT poi.assembly_id, a.sku
    FROM public.production_order_items poi
    JOIN public.production_orders po ON poi.production_order_id = po.id
    JOIN public.assemblies a ON poi.assembly_id = a.id
    WHERE poi.assembly_id IS NOT NULL
    AND po.created_at::date = target_date
    AND poi.yield_quantity IS NOT NULL
  LOOP
    -- Calculate aggregated metrics for this assembly on target_date
    SELECT 
      COALESCE(SUM(poi.planned_build_quantity), 0),
      COALESCE(SUM(poi.yield_quantity), 0),
      COALESCE(SUM(poi.waste_quantity), 0),
      COALESCE(AVG(poi.setup_timer_ms / 3600000.0), 0), -- Convert ms to hours
      COALESCE(AVG(poi.build_test_timer_ms / 3600000.0), 0)
    INTO total_planned, total_yield, total_waste, avg_setup_time, avg_build_time
    FROM public.production_order_items poi
    JOIN public.production_orders po ON poi.production_order_id = po.id
    WHERE poi.assembly_id = assembly_record.assembly_id
    AND po.created_at::date = target_date;
    
    -- Calculate waste percentage
    waste_pct := CASE 
      WHEN total_planned > 0 THEN (total_waste::numeric / total_planned::numeric) * 100 
      ELSE 0 
    END;
    
    -- Get component cost trend for this assembly (simplified - use current week cost)
    SELECT COALESCE(SUM(ac.quantity_needed * cph.last_paid_unit_cost), 0)
    INTO cost_trend
    FROM public.assembly_components ac
    LEFT JOIN public.component_price_history cph ON 
      cph.inventory_item_id = ac.inventory_item_id 
      AND cph.price_date = date_trunc('week', target_date)::date
    WHERE ac.assembly_id = assembly_record.assembly_id;
    
    -- Insert or update analytics record
    INSERT INTO public.assembly_waste_analytics (
      assembly_id,
      analysis_date,
      total_planned_quantity,
      total_yield_quantity,
      total_waste_quantity,
      waste_percentage,
      setup_time_per_unit,
      build_time_per_unit,
      component_cost_trend
    ) VALUES (
      assembly_record.assembly_id,
      target_date,
      total_planned,
      total_yield,
      total_waste,
      waste_pct,
      CASE WHEN total_yield > 0 THEN avg_setup_time / total_yield ELSE 0 END,
      CASE WHEN total_yield > 0 THEN avg_build_time / total_yield ELSE 0 END,
      cost_trend
    )
    ON CONFLICT (assembly_id, analysis_date) 
    DO UPDATE SET
      total_planned_quantity = EXCLUDED.total_planned_quantity,
      total_yield_quantity = EXCLUDED.total_yield_quantity,
      total_waste_quantity = EXCLUDED.total_waste_quantity,
      waste_percentage = EXCLUDED.waste_percentage,
      setup_time_per_unit = EXCLUDED.setup_time_per_unit,
      build_time_per_unit = EXCLUDED.build_time_per_unit,
      component_cost_trend = EXCLUDED.component_cost_trend;
    
    records_processed := records_processed + 1;
  END LOOP;
  
  RETURN FORMAT('Processed waste metrics for %s assemblies on %s', records_processed, target_date::text);
END;
$function$;

-- Function to check waste threshold alerts
CREATE OR REPLACE FUNCTION public.check_waste_threshold_alerts(threshold_pct numeric DEFAULT 20.0)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
As $function$
DECLARE
  assembly_record RECORD;
  current_waste numeric;
  historical_avg numeric;
  variance numeric;
  alerts_generated integer := 0;
BEGIN
  -- Check each assembly that has recent waste analytics
  FOR assembly_record IN
    SELECT DISTINCT assembly_id, a.sku
    FROM public.assembly_waste_analytics awa
    JOIN public.assemblies a ON awa.assembly_id = a.id
    WHERE awa.analysis_date >= CURRENT_DATE - INTERVAL '7 days'
  LOOP
    -- Get current waste rate (last 7 days average)
    SELECT AVG(waste_percentage)
    INTO current_waste
    FROM public.assembly_waste_analytics
    WHERE assembly_id = assembly_record.assembly_id
    AND analysis_date >= CURRENT_DATE - INTERVAL '7 days';
    
    -- Get historical average (30-90 days ago to avoid recent trends)
    SELECT AVG(waste_percentage)
    INTO historical_avg
    FROM public.assembly_waste_analytics
    WHERE assembly_id = assembly_record.assembly_id
    AND analysis_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE - INTERVAL '30 days';
    
    -- Only check if we have both current and historical data
    IF current_waste IS NOT NULL AND historical_avg IS NOT NULL AND historical_avg > 0 THEN
      variance := ((current_waste - historical_avg) / historical_avg) * 100;
      
      -- Generate alert if variance exceeds threshold
      IF variance >= threshold_pct THEN
        -- Check if we already have an active alert for this assembly
        IF NOT EXISTS (
          SELECT 1 FROM public.assembly_waste_alerts
          WHERE assembly_id = assembly_record.assembly_id
          AND alert_status = 'active'
          AND alert_date >= CURRENT_DATE - INTERVAL '7 days'
        ) THEN
          INSERT INTO public.assembly_waste_alerts (
            assembly_id,
            alert_date,
            current_waste_rate,
            historical_average,
            threshold_percentage,
            variance_amount
          ) VALUES (
            assembly_record.assembly_id,
            CURRENT_DATE,
            current_waste,
            historical_avg,
            threshold_pct,
            variance
          );
          
          alerts_generated := alerts_generated + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN FORMAT('Generated %s waste threshold alerts', alerts_generated);
END;
$function$;

-- Add unique constraint to prevent duplicate analytics records
ALTER TABLE public.assembly_waste_analytics 
ADD CONSTRAINT assembly_waste_analytics_assembly_date_unique 
UNIQUE (assembly_id, analysis_date);