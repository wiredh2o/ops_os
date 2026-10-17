-- Phase 1: Database Foundation for Dual-Lens Inventory System

-- Create inventory view mode enum
CREATE TYPE public.inventory_view_mode AS ENUM ('reality', 'gov');

-- Add inventory view mode preference to profiles
ALTER TABLE public.profiles 
ADD COLUMN default_inventory_view_mode inventory_view_mode DEFAULT 'reality';

-- Create inventory mode configuration table
CREATE TABLE public.inventory_mode_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode inventory_view_mode NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(mode, config_key)
);

-- Enable RLS
ALTER TABLE public.inventory_mode_config ENABLE ROW LEVEL SECURITY;

-- Create policies for inventory mode config
CREATE POLICY "Inventory mode config viewable by authenticated users" 
ON public.inventory_mode_config 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory mode config manageable by admins" 
ON public.inventory_mode_config 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_inventory_mode_config_updated_at
BEFORE UPDATE ON public.inventory_mode_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enhanced reorder point calculation with mode awareness
CREATE OR REPLACE FUNCTION public.calculate_mode_aware_reorder_point(
  item_id UUID, 
  lead_time_days INTEGER, 
  view_mode inventory_view_mode DEFAULT 'reality'::inventory_view_mode,
  spike_threshold NUMERIC DEFAULT 1.3
) RETURNS TABLE(
  reorder_point INTEGER,
  actual_lead_time_days INTEGER, 
  lead_time_data_points INTEGER,
  safety_stock_tier TEXT,
  mode_adjustment_factor NUMERIC
) 
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
  mode_factor NUMERIC := 1.0;
  gov_buffer NUMERIC;
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
  
  -- Gov Mode adjustments
  IF view_mode = 'gov' THEN
    -- Get gov mode buffer from config (default 1.2 = 20% buffer)
    SELECT COALESCE(
      (config.config_value->>'buffer_multiplier')::NUMERIC, 
      1.2
    ) INTO gov_buffer
    FROM public.inventory_mode_config config
    WHERE config.mode = 'gov' 
    AND config.config_key = 'reorder_point_buffer' 
    AND config.is_active = true;
    
    mode_factor := gov_buffer;
    safety_stock_multiplier := safety_stock_multiplier * mode_factor;
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
    tier_name,
    mode_factor;
END;
$function$;

-- Enhanced assembly reorder point calculation with mode awareness
CREATE OR REPLACE FUNCTION public.calculate_mode_aware_assembly_reorder_point(
  assembly_id_param UUID, 
  view_mode inventory_view_mode DEFAULT 'reality'::inventory_view_mode
) RETURNS TABLE(
  reorder_point INTEGER,
  actual_lead_time_days INTEGER, 
  lead_time_data_points INTEGER,
  safety_stock_tier TEXT,
  mode_adjustment_factor NUMERIC
) 
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
  mode_factor NUMERIC := 1.0;
  gov_buffer NUMERIC;
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
  
  -- Gov Mode adjustments
  IF view_mode = 'gov' THEN
    -- Get gov mode buffer from config
    SELECT COALESCE(
      (config.config_value->>'buffer_multiplier')::NUMERIC, 
      1.2
    ) INTO gov_buffer
    FROM public.inventory_mode_config config
    WHERE config.mode = 'gov' 
    AND config.config_key = 'reorder_point_buffer' 
    AND config.is_active = true;
    
    mode_factor := gov_buffer;
    safety_stock_multiplier := safety_stock_multiplier * mode_factor;
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
    tier_name,
    mode_factor;
END;
$function$;

-- Insert default configuration values
INSERT INTO public.inventory_mode_config (mode, config_key, config_value, description, created_by) VALUES
('reality', 'reorder_point_buffer', '{"buffer_multiplier": 1.0}', 'Reality mode uses actual operational requirements', (SELECT id FROM auth.users LIMIT 1)),
('gov', 'reorder_point_buffer', '{"buffer_multiplier": 1.2}', 'Gov mode adds 20% buffer for compliance requirements', (SELECT id FROM auth.users LIMIT 1)),
('gov', 'inventory_valuation', '{"method": "cash_basis_lifo", "payment_based": true}', 'Government accounting treats assemblies as inventory until payment received', (SELECT id FROM auth.users LIMIT 1)),
('reality', 'inventory_valuation', '{"method": "operational", "payment_based": false}', 'Reality mode based on physical inventory status', (SELECT id FROM auth.users LIMIT 1));