-- Enhanced Demand Forecasting System for Long Lead Time Items

-- Create inventory demand analytics table for tracking rolling averages
CREATE TABLE public.inventory_demand_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_demand INTEGER NOT NULL DEFAULT 0,
  quarterly_avg NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_avg NUMERIC(10,2) NOT NULL DEFAULT 0,
  spike_factor NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  adjusted_reorder_point INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(inventory_item_id, date)
);

-- Create assembly demand analytics table
CREATE TABLE public.assembly_demand_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assembly_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_shipments INTEGER NOT NULL DEFAULT 0,
  quarterly_avg NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_avg NUMERIC(10,2) NOT NULL DEFAULT 0,
  adjusted_reorder_point INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(assembly_id, date)
);

-- Create inventory order history table (tracks when items are ordered by customers)
CREATE TABLE public.inventory_order_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL,
  production_order_id UUID NOT NULL,
  quantity_ordered INTEGER NOT NULL,
  order_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create assembly shipment history table (tracks when assemblies are shipped)
CREATE TABLE public.assembly_shipment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assembly_id UUID NOT NULL,
  production_order_id UUID NOT NULL,
  quantity_shipped INTEGER NOT NULL,
  shipped_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.inventory_demand_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_demand_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_shipment_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Inventory demand analytics viewable by authenticated users" 
ON public.inventory_demand_analytics FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory demand analytics manageable by authenticated users" 
ON public.inventory_demand_analytics FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly demand analytics viewable by authenticated users" 
ON public.assembly_demand_analytics FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly demand analytics manageable by authenticated users" 
ON public.assembly_demand_analytics FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory order history viewable by authenticated users" 
ON public.inventory_order_history FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory order history manageable by authenticated users" 
ON public.inventory_order_history FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly shipment history viewable by authenticated users" 
ON public.assembly_shipment_history FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly shipment history manageable by authenticated users" 
ON public.assembly_shipment_history FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Function to calculate rolling averages for inventory items
CREATE OR REPLACE FUNCTION public.calculate_inventory_rolling_averages(item_id UUID, target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(quarterly_avg NUMERIC, annual_avg NUMERIC, spike_factor NUMERIC) AS $$
DECLARE
  quarterly_total INTEGER := 0;
  annual_total INTEGER := 0;
  quarterly_days INTEGER := 90;
  annual_days INTEGER := 365;
  calculated_spike_factor NUMERIC := 1.0;
BEGIN
  -- Calculate quarterly average (last 90 days)
  SELECT COALESCE(SUM(quantity_ordered), 0)
  INTO quarterly_total
  FROM public.inventory_order_history 
  WHERE inventory_item_id = item_id 
  AND order_date >= target_date - INTERVAL '90 days'
  AND order_date <= target_date;
  
  -- Calculate annual average (last 365 days)
  SELECT COALESCE(SUM(quantity_ordered), 0)
  INTO annual_total
  FROM public.inventory_order_history 
  WHERE inventory_item_id = item_id 
  AND order_date >= target_date - INTERVAL '365 days'
  AND order_date <= target_date;
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate assembly rolling averages
CREATE OR REPLACE FUNCTION public.calculate_assembly_rolling_averages(assembly_id_param UUID, target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(quarterly_avg NUMERIC, annual_avg NUMERIC) AS $$
DECLARE
  quarterly_total INTEGER := 0;
  annual_total INTEGER := 0;
  quarterly_days INTEGER := 90;
  annual_days INTEGER := 365;
BEGIN
  -- Calculate quarterly average (last 90 days)
  SELECT COALESCE(SUM(quantity_shipped), 0)
  INTO quarterly_total
  FROM public.assembly_shipment_history 
  WHERE assembly_id = assembly_id_param 
  AND shipped_date >= target_date - INTERVAL '90 days'
  AND shipped_date <= target_date;
  
  -- Calculate annual average (last 365 days)  
  SELECT COALESCE(SUM(quantity_shipped), 0)
  INTO annual_total
  FROM public.assembly_shipment_history 
  WHERE assembly_id = assembly_id_param 
  AND shipped_date >= target_date - INTERVAL '365 days'
  AND shipped_date <= target_date;
  
  -- Calculate averages
  quarterly_avg := quarterly_total::NUMERIC / quarterly_days;
  annual_avg := annual_total::NUMERIC / annual_days;
  
  RETURN QUERY SELECT quarterly_avg, annual_avg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate dynamic reorder point based on lead time and spike factor
CREATE OR REPLACE FUNCTION public.calculate_dynamic_reorder_point(
  item_id UUID,
  lead_time_days INTEGER,
  spike_threshold NUMERIC DEFAULT 1.3
) RETURNS INTEGER AS $$
DECLARE
  quarterly_avg NUMERIC;
  annual_avg NUMERIC;
  spike_factor NUMERIC;
  safety_stock_multiplier NUMERIC;
  base_demand NUMERIC;
  safety_stock NUMERIC;
  reorder_point INTEGER;
BEGIN
  -- Get rolling averages and spike factor
  SELECT q.quarterly_avg, q.annual_avg, q.spike_factor
  INTO quarterly_avg, annual_avg, spike_factor
  FROM public.calculate_inventory_rolling_averages(item_id) q;
  
  -- Determine safety stock multiplier based on lead time
  IF lead_time_days >= 180 THEN -- 6+ months
    safety_stock_multiplier := 2.5;
  ELSIF lead_time_days >= 90 THEN -- 3-6 months
    safety_stock_multiplier := 2.0;
  ELSIF lead_time_days >= 30 THEN -- 1-3 months
    safety_stock_multiplier := 1.5;
  ELSE -- < 1 month
    safety_stock_multiplier := 1.0;
  END IF;
  
  -- Choose demand rate based on spike detection
  IF spike_factor >= spike_threshold AND lead_time_days >= 30 THEN
    -- Use quarterly average for spike conditions on longer lead times
    base_demand := quarterly_avg;
    safety_stock := (quarterly_avg * safety_stock_multiplier * spike_factor);
  ELSE
    -- Use annual average for stable demand
    base_demand := annual_avg;
    safety_stock := (annual_avg * safety_stock_multiplier);
  END IF;
  
  -- Calculate reorder point
  reorder_point := CEIL((base_demand * lead_time_days) + safety_stock);
  
  RETURN GREATEST(reorder_point, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to record inventory demand when orders are placed
CREATE OR REPLACE FUNCTION public.record_inventory_order_demand()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record for inventory items
  IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
    INSERT INTO public.inventory_order_history (
      inventory_item_id,
      production_order_id,
      quantity_ordered,
      order_date
    ) VALUES (
      NEW.inventory_item_id,
      NEW.production_order_id,
      NEW.quantity,
      CURRENT_DATE
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to record assembly shipments
CREATE OR REPLACE FUNCTION public.record_assembly_shipment()
RETURNS TRIGGER AS $$
BEGIN
  -- Record shipment when production order status changes to 'shipped'
  IF NEW.status = 'shipped' AND (OLD.status IS NULL OR OLD.status != 'shipped') THEN
    -- Record shipments for all assembly items in this order
    INSERT INTO public.assembly_shipment_history (
      assembly_id,
      production_order_id,
      quantity_shipped,
      shipped_date
    )
    SELECT 
      poi.assembly_id,
      NEW.id,
      poi.quantity,
      CURRENT_DATE
    FROM public.production_order_items poi
    WHERE poi.production_order_id = NEW.id
    AND poi.item_type = 'assembly'
    AND poi.assembly_id IS NOT NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER record_inventory_demand_trigger
  AFTER INSERT ON public.production_order_items
  FOR EACH ROW EXECUTE FUNCTION public.record_inventory_order_demand();

CREATE TRIGGER record_assembly_shipment_trigger
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.record_assembly_shipment();

-- Add updated_at triggers
CREATE TRIGGER update_inventory_demand_analytics_updated_at
  BEFORE UPDATE ON public.inventory_demand_analytics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assembly_demand_analytics_updated_at
  BEFORE UPDATE ON public.assembly_demand_analytics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();