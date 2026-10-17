-- Create comprehensive demand tracking system for LEAN pull inventory management

-- Create demand_events table to track all demand (direct and cascaded)
CREATE TABLE public.demand_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  demand_date DATE NOT NULL DEFAULT CURRENT_DATE,
  inventory_item_id UUID NOT NULL,
  quantity_demanded INTEGER NOT NULL,
  demand_source TEXT NOT NULL, -- 'customer_order', 'assembly_order', 'cascade_from_assembly'
  source_order_id UUID NOT NULL,
  source_assembly_id UUID NULL, -- For cascaded demand
  notes TEXT NULL
);

-- Enable RLS
ALTER TABLE public.demand_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Demand events manageable by authenticated users" 
ON public.demand_events 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Demand events viewable by authenticated users" 
ON public.demand_events 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create indexes for performance
CREATE INDEX idx_demand_events_item_date ON public.demand_events(inventory_item_id, demand_date);
CREATE INDEX idx_demand_events_source ON public.demand_events(source_order_id);

-- Create assembly_demand_events table for assembly-level demand tracking
CREATE TABLE public.assembly_demand_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  demand_date DATE NOT NULL DEFAULT CURRENT_DATE,
  assembly_id UUID NOT NULL,
  quantity_demanded INTEGER NOT NULL,
  demand_source TEXT NOT NULL, -- 'customer_order', 'assembly_order'
  source_order_id UUID NOT NULL,
  notes TEXT NULL
);

-- Enable RLS
ALTER TABLE public.assembly_demand_events ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Assembly demand events manageable by authenticated users" 
ON public.assembly_demand_events 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly demand events viewable by authenticated users" 
ON public.assembly_demand_events 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX idx_assembly_demand_events_assembly_date ON public.assembly_demand_events(assembly_id, demand_date);
CREATE INDEX idx_assembly_demand_events_source ON public.assembly_demand_events(source_order_id);

-- Function to calculate dynamic statistical safety stock (99.9% service level)
CREATE OR REPLACE FUNCTION public.calculate_statistical_safety_stock(
  item_id UUID,
  lead_time_days INTEGER,
  analysis_period_days INTEGER DEFAULT 90
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

-- Function to calculate assembly statistical safety stock
CREATE OR REPLACE FUNCTION public.calculate_assembly_statistical_safety_stock(
  assembly_id_param UUID,
  lead_time_days INTEGER,
  analysis_period_days INTEGER DEFAULT 90
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
    FROM public.assembly_demand_events
    WHERE assembly_id = assembly_id_param
    AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days
    GROUP BY demand_date
  ) daily_demands;
  
  -- Calculate statistical safety stock
  safety_stock := z_score * demand_stddev * SQRT(lead_time_days);
  
  RETURN GREATEST(safety_stock, 0);
END;
$$;

-- Function to calculate true LEAN pull demand rate
CREATE OR REPLACE FUNCTION public.calculate_pull_demand_rate(
  item_id UUID,
  analysis_period_days INTEGER DEFAULT 90
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

-- Function to calculate assembly pull demand rate
CREATE OR REPLACE FUNCTION public.calculate_assembly_pull_demand_rate(
  assembly_id_param UUID,
  analysis_period_days INTEGER DEFAULT 90
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  total_demand NUMERIC;
  demand_rate NUMERIC;
BEGIN
  -- Calculate total demand over analysis period
  SELECT COALESCE(SUM(quantity_demanded), 0)
  INTO total_demand
  FROM public.assembly_demand_events
  WHERE assembly_id = assembly_id_param
  AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days;
  
  -- Calculate daily demand rate
  demand_rate := total_demand / analysis_period_days;
  
  RETURN GREATEST(demand_rate, 0);
END;
$$;

-- Function to calculate LEAN pull reorder point with MOQ optimization
CREATE OR REPLACE FUNCTION public.calculate_lean_pull_reorder_point(
  item_id UUID,
  lead_time_days INTEGER,
  minimum_order_quantity INTEGER DEFAULT 1,
  analysis_period_days INTEGER DEFAULT 90
) RETURNS TABLE(
  reorder_point INTEGER,
  demand_rate NUMERIC,
  safety_stock NUMERIC,
  recommended_order_qty INTEGER,
  moq_coverage_days NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  calculated_demand_rate NUMERIC;
  calculated_safety_stock NUMERIC;
  base_reorder_point NUMERIC;
  calculated_reorder_point INTEGER;
  natural_order_qty INTEGER;
  recommended_qty INTEGER;
  moq_coverage NUMERIC;
BEGIN
  -- Get demand rate and safety stock
  SELECT public.calculate_pull_demand_rate(item_id, analysis_period_days)
  INTO calculated_demand_rate;
  
  SELECT public.calculate_statistical_safety_stock(item_id, lead_time_days, analysis_period_days)
  INTO calculated_safety_stock;
  
  -- Calculate base reorder point: (Demand Rate × Lead Time) + Safety Stock
  base_reorder_point := (calculated_demand_rate * lead_time_days) + calculated_safety_stock;
  calculated_reorder_point := CEIL(base_reorder_point);
  
  -- Calculate natural order quantity (what we'd normally order)
  natural_order_qty := GREATEST(CEIL(calculated_demand_rate * lead_time_days), 1);
  
  -- Apply MOQ constraints
  IF natural_order_qty < minimum_order_quantity THEN
    recommended_qty := minimum_order_quantity;
    -- Calculate how many days the MOQ will cover
    IF calculated_demand_rate > 0 THEN
      moq_coverage := minimum_order_quantity / calculated_demand_rate;
    ELSE
      moq_coverage := 0;
    END IF;
  ELSE
    recommended_qty := natural_order_qty;
    moq_coverage := lead_time_days;
  END IF;
  
  RETURN QUERY SELECT 
    GREATEST(calculated_reorder_point, 0),
    calculated_demand_rate,
    calculated_safety_stock,
    recommended_qty,
    moq_coverage;
END;
$$;

-- Function to calculate assembly LEAN pull reorder point
CREATE OR REPLACE FUNCTION public.calculate_assembly_lean_pull_reorder_point(
  assembly_id_param UUID,
  lead_time_days INTEGER DEFAULT 14,
  analysis_period_days INTEGER DEFAULT 90
) RETURNS TABLE(
  reorder_point INTEGER,
  demand_rate NUMERIC,
  safety_stock NUMERIC,
  recommended_order_qty INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  calculated_demand_rate NUMERIC;
  calculated_safety_stock NUMERIC;
  base_reorder_point NUMERIC;
  calculated_reorder_point INTEGER;
  recommended_qty INTEGER;
BEGIN
  -- Get demand rate and safety stock
  SELECT public.calculate_assembly_pull_demand_rate(assembly_id_param, analysis_period_days)
  INTO calculated_demand_rate;
  
  SELECT public.calculate_assembly_statistical_safety_stock(assembly_id_param, lead_time_days, analysis_period_days)
  INTO calculated_safety_stock;
  
  -- Calculate base reorder point: (Demand Rate × Lead Time) + Safety Stock
  base_reorder_point := (calculated_demand_rate * lead_time_days) + calculated_safety_stock;
  calculated_reorder_point := CEIL(base_reorder_point);
  
  -- Calculate recommended order quantity
  recommended_qty := GREATEST(CEIL(calculated_demand_rate * lead_time_days), 1);
  
  RETURN QUERY SELECT 
    GREATEST(calculated_reorder_point, 0),
    calculated_demand_rate,
    calculated_safety_stock,
    recommended_qty;
END;
$$;

-- Trigger function to create demand events when production order items are created
CREATE OR REPLACE FUNCTION public.create_demand_events_for_order_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  order_date DATE;
  component_record RECORD;
BEGIN
  -- Get the order date from the production order
  SELECT COALESCE(created_at::date, CURRENT_DATE)
  INTO order_date
  FROM public.production_orders
  WHERE id = NEW.production_order_id;

  -- Handle different item types
  IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
    -- Direct inventory item demand
    INSERT INTO public.demand_events (
      inventory_item_id,
      quantity_demanded,
      demand_source,
      source_order_id,
      demand_date
    ) VALUES (
      NEW.inventory_item_id,
      NEW.quantity,
      'customer_order',
      NEW.production_order_id,
      order_date
    );
    
  ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
    -- Assembly demand
    INSERT INTO public.assembly_demand_events (
      assembly_id,
      quantity_demanded,
      demand_source,
      source_order_id,
      demand_date
    ) VALUES (
      NEW.assembly_id,
      NEW.quantity,
      'customer_order',
      NEW.production_order_id,
      order_date
    );
    
    -- Cascade demand to assembly components
    FOR component_record IN
      SELECT ac.inventory_item_id, ac.quantity_needed
      FROM public.assembly_components ac
      WHERE ac.assembly_id = NEW.assembly_id
    LOOP
      INSERT INTO public.demand_events (
        inventory_item_id,
        quantity_demanded,
        demand_source,
        source_order_id,
        source_assembly_id,
        demand_date
      ) VALUES (
        component_record.inventory_item_id,
        component_record.quantity_needed * NEW.quantity,
        'cascade_from_assembly',
        NEW.production_order_id,
        NEW.assembly_id,
        order_date
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for demand event creation
CREATE TRIGGER trigger_create_demand_events
  AFTER INSERT ON public.production_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_demand_events_for_order_items();

-- Update the existing daily reorder calculation function to use LEAN pull
CREATE OR REPLACE FUNCTION public.calculate_lean_pull_reorder_points()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  item_record RECORD;
  assembly_record RECORD;
  reorder_data RECORD;
  items_processed INTEGER := 0;
  assemblies_processed INTEGER := 0;
  items_needing_reorder INTEGER := 0;
  assemblies_needing_reorder INTEGER := 0;
BEGIN
  -- Process all inventory items
  FOR item_record IN
    SELECT id, sku, lead_time_days, minimum_order_quantity, quantity_on_hand, reorder_point
    FROM public.inventory_items
    WHERE lead_time_days IS NOT NULL
  LOOP
    items_processed := items_processed + 1;
    
    -- Calculate LEAN pull reorder point
    SELECT * INTO reorder_data
    FROM public.calculate_lean_pull_reorder_point(
      item_record.id,
      item_record.lead_time_days,
      COALESCE(item_record.minimum_order_quantity, 1)
    );
    
    -- Update the item with new reorder point
    UPDATE public.inventory_items
    SET reorder_point = reorder_data.reorder_point
    WHERE id = item_record.id;
    
    -- Check if item needs reordering (true pull - only when below reorder point)
    IF item_record.quantity_on_hand <= reorder_data.reorder_point THEN
      items_needing_reorder := items_needing_reorder + 1;
      
      -- Log reorder trigger
      INSERT INTO public.reorder_triggers (
        item_id,
        item_type,
        current_quantity,
        reorder_point,
        trigger_reason,
        trending_velocity
      ) VALUES (
        item_record.id,
        'inventory_item',
        item_record.quantity_on_hand,
        reorder_data.reorder_point,
        'Below LEAN pull reorder point',
        reorder_data.demand_rate
      );
    END IF;
  END LOOP;
  
  -- Process all assemblies
  FOR assembly_record IN
    SELECT id, sku, lead_time_days, quantity_on_hand, reorder_point
    FROM public.assemblies
    WHERE lead_time_days IS NOT NULL
  LOOP
    assemblies_processed := assemblies_processed + 1;
    
    -- Calculate assembly LEAN pull reorder point
    SELECT * INTO reorder_data
    FROM public.calculate_assembly_lean_pull_reorder_point(
      assembly_record.id,
      COALESCE(assembly_record.lead_time_days, 14)
    );
    
    -- Update the assembly with new reorder point
    UPDATE public.assemblies
    SET reorder_point = reorder_data.reorder_point
    WHERE id = assembly_record.id;
    
    -- Check if assembly needs reordering
    IF assembly_record.quantity_on_hand <= reorder_data.reorder_point THEN
      assemblies_needing_reorder := assemblies_needing_reorder + 1;
      
      -- Log reorder trigger
      INSERT INTO public.reorder_triggers (
        item_id,
        item_type,
        current_quantity,
        reorder_point,
        trigger_reason,
        trending_velocity
      ) VALUES (
        assembly_record.id,
        'assembly',
        assembly_record.quantity_on_hand,
        reorder_data.reorder_point,
        'Below LEAN pull reorder point',
        reorder_data.demand_rate
      );
    END IF;
  END LOOP;
  
  -- Log calculation summary
  INSERT INTO public.reorder_calculations (
    total_items_processed,
    total_assemblies_processed,
    items_needing_reorder,
    assemblies_needing_reorder
  ) VALUES (
    items_processed,
    assemblies_processed,
    items_needing_reorder,
    assemblies_needing_reorder
  );
  
  RETURN FORMAT('LEAN Pull Calculation Complete: %s items, %s assemblies processed. %s items, %s assemblies need reordering.',
    items_processed, assemblies_processed, items_needing_reorder, assemblies_needing_reorder);
END;
$$;