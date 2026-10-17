
-- Update all LEAN pull calculation functions to use 365 days instead of 90
CREATE OR REPLACE FUNCTION public.calculate_pull_demand_rate(item_id uuid, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

CREATE OR REPLACE FUNCTION public.calculate_assembly_pull_demand_rate(assembly_id_param uuid, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.calculate_statistical_safety_stock(item_id uuid, lead_time_days integer, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

CREATE OR REPLACE FUNCTION public.calculate_assembly_statistical_safety_stock(assembly_id_param uuid, lead_time_days integer, analysis_period_days integer DEFAULT 365)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
    FROM public.assembly_demand_events
    WHERE assembly_id = assembly_id_param
    AND demand_date >= CURRENT_DATE - INTERVAL '1 day' * analysis_period_days
    GROUP BY demand_date
  ) daily_demands;
  
  -- Calculate statistical safety stock
  safety_stock := z_score * demand_stddev * SQRT(lead_time_days);
  
  RETURN GREATEST(safety_stock, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_lean_pull_reorder_point(item_id uuid, lead_time_days integer, minimum_order_quantity integer DEFAULT 1, analysis_period_days integer DEFAULT 365)
 RETURNS TABLE(reorder_point integer, demand_rate numeric, safety_stock numeric, recommended_order_qty integer, moq_coverage_days numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.calculate_assembly_lean_pull_reorder_point(assembly_id_param uuid, lead_time_days integer DEFAULT 14, analysis_period_days integer DEFAULT 365)
 RETURNS TABLE(reorder_point integer, demand_rate numeric, safety_stock numeric, recommended_order_qty integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- Add receiving tracking columns to purchase_order_items
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS receiving_variance integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS receiving_notes text;

-- Create function to handle automated receiving process with flexible validation
CREATE OR REPLACE FUNCTION public.handle_purchase_order_receiving()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  variance_qty INTEGER;
BEGIN
  -- Only process when quantity_received changes and actual_received_date is set
  IF (TG_OP = 'UPDATE' AND 
      (OLD.quantity_received != NEW.quantity_received OR 
       (OLD.actual_received_date IS NULL AND NEW.actual_received_date IS NOT NULL))) THEN
    
    -- Calculate receiving variance (can be positive if over-receiving)
    variance_qty := NEW.quantity_received - NEW.quantity;
    NEW.receiving_variance := variance_qty;
    
    -- Update quantity_remaining
    NEW.quantity_remaining := NEW.quantity - NEW.quantity_received;
    
    -- Update inventory quantities based on item type
    IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
      -- Update inventory item quantities
      UPDATE public.inventory_items
      SET 
        quantity_on_hand = quantity_on_hand + (NEW.quantity_received - COALESCE(OLD.quantity_received, 0)),
        quantity_on_order = quantity_on_order - (NEW.quantity_received - COALESCE(OLD.quantity_received, 0))
      WHERE id = NEW.inventory_item_id;
      
    ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Update assembly quantities
      UPDATE public.assemblies
      SET 
        quantity_on_hand = quantity_on_hand + (NEW.quantity_received - COALESCE(OLD.quantity_received, 0)),
        quantity_on_order = quantity_on_order - (NEW.quantity_received - COALESCE(OLD.quantity_received, 0))
      WHERE id = NEW.assembly_id;
    END IF;
    
    -- Log receiving variance if significant
    IF ABS(variance_qty) > 0 THEN
      NEW.receiving_notes := COALESCE(NEW.receiving_notes, '') || 
        CASE 
          WHEN variance_qty > 0 THEN ' [Over-received: +' || variance_qty || ']'
          WHEN variance_qty < 0 THEN ' [Under-received: ' || variance_qty || ']'
          ELSE ''
        END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for purchase order receiving
DROP TRIGGER IF EXISTS trigger_purchase_order_receiving ON public.purchase_order_items;
CREATE TRIGGER trigger_purchase_order_receiving
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_purchase_order_receiving();

-- Add assembly tracking fields
ALTER TABLE public.assemblies 
ADD COLUMN IF NOT EXISTS last_14_day_check_date date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS auto_production_orders_generated integer DEFAULT 0;

-- Create table to track auto-generated assembly production orders
CREATE TABLE IF NOT EXISTS public.assembly_production_triggers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id),
  production_order_id uuid REFERENCES public.production_orders(id),
  trigger_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity_on_hand_at_trigger integer NOT NULL,
  fourteen_day_threshold numeric NOT NULL,
  recommended_quantity integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on assembly_production_triggers
ALTER TABLE public.assembly_production_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assembly production triggers manageable by authenticated users"
  ON public.assembly_production_triggers
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Create function to check assembly 14-day threshold and auto-generate production orders
CREATE OR REPLACE FUNCTION public.check_assembly_14_day_threshold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  demand_rate NUMERIC;
  fourteen_day_threshold NUMERIC;
  recommended_qty INTEGER;
  new_production_order_id UUID;
  order_number TEXT;
BEGIN
  -- Only check when quantity_on_hand changes
  IF TG_OP = 'UPDATE' AND OLD.quantity_on_hand = NEW.quantity_on_hand THEN
    RETURN NEW;
  END IF;
  
  -- Calculate 14-day demand threshold using assembly demand rate
  SELECT public.calculate_assembly_pull_demand_rate(NEW.id, 365)
  INTO demand_rate;
  
  fourteen_day_threshold := demand_rate * 14;
  
  -- Check if assembly quantity is below 14-day threshold
  IF NEW.quantity_on_hand <= fourteen_day_threshold AND fourteen_day_threshold > 0 THEN
    -- Calculate recommended production quantity (28 days worth to build buffer)
    recommended_qty := CEIL(demand_rate * 28);
    recommended_qty := GREATEST(recommended_qty, 1); -- Minimum 1 unit
    
    -- Generate unique order number
    order_number := 'AUTO-ASM-' || to_char(now(), 'YYYYMMDD') || '-' || EXTRACT(EPOCH FROM now())::TEXT;
    
    -- Create auto-generated production order
    INSERT INTO public.production_orders (
      order_number,
      customer_name,
      order_type,
      order_subtype,
      priority,
      status,
      auto_generated,
      source_reason,
      notes,
      created_by
    ) VALUES (
      order_number,
      'Auto Assembly Replenishment',
      'assembly_build',
      'internal',
      'high',
      'pending',
      true,
      'Assembly below 14-day threshold',
      'Auto-generated: Assembly ' || NEW.sku || ' quantity (' || NEW.quantity_on_hand || ') below 14-day threshold (' || ROUND(fourteen_day_threshold, 2) || ')',
      COALESCE(auth.uid(), NEW.created_by)
    ) RETURNING id INTO new_production_order_id;
    
    -- Add assembly item to production order
    INSERT INTO public.production_order_items (
      production_order_id,
      item_type,
      assembly_id,
      item_name,
      item_sku,
      quantity,
      unit_price,
      total_price
    ) VALUES (
      new_production_order_id,
      'assembly',
      NEW.id,
      'Assembly: ' || NEW.sku,
      NEW.sku,
      recommended_qty,
      NEW.selling_price,
      NEW.selling_price * recommended_qty
    );
    
    -- Log the trigger event
    INSERT INTO public.assembly_production_triggers (
      assembly_id,
      production_order_id,
      quantity_on_hand_at_trigger,
      fourteen_day_threshold,
      recommended_quantity,
      status
    ) VALUES (
      NEW.id,
      new_production_order_id,
      NEW.quantity_on_hand,
      fourteen_day_threshold,
      recommended_qty,
      'generated'
    );
    
    -- Update assembly tracking fields
    NEW.last_14_day_check_date := CURRENT_DATE;
    NEW.auto_production_orders_generated := NEW.auto_production_orders_generated + 1;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for assembly threshold checking
DROP TRIGGER IF EXISTS trigger_assembly_threshold_check ON public.assemblies;
CREATE TRIGGER trigger_assembly_threshold_check
  AFTER UPDATE ON public.assemblies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_assembly_14_day_threshold();

-- Create function to handle assembly sales allocation
CREATE OR REPLACE FUNCTION public.handle_assembly_sales_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Handle assembly allocation when production order items are created/updated
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Only process assembly items
    IF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Calculate allocation difference for updates
      DECLARE
        qty_diff INTEGER := NEW.quantity;
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          qty_diff := NEW.quantity - OLD.quantity;
        END IF;
        
        -- Update assembly allocated quantity
        UPDATE public.assemblies
        SET quantity_allocated = quantity_allocated + qty_diff
        WHERE id = NEW.assembly_id;
      END;
    END IF;
    RETURN NEW;
  END IF;
  
  -- Handle deletion
  IF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'assembly' AND OLD.assembly_id IS NOT NULL THEN
      -- Reduce allocated quantity
      UPDATE public.assemblies
      SET quantity_allocated = quantity_allocated - OLD.quantity
      WHERE id = OLD.assembly_id;
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;

-- Create trigger for assembly sales allocation
DROP TRIGGER IF EXISTS trigger_assembly_sales_allocation ON public.production_order_items;
CREATE TRIGGER trigger_assembly_sales_allocation
  AFTER INSERT OR UPDATE OR DELETE ON public.production_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_assembly_sales_allocation();

-- Create function to handle assembly production completion
CREATE OR REPLACE FUNCTION public.handle_assembly_production_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- When production order status changes to 'completed', update assembly quantities
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Update assembly quantities for all assembly items in this production order
    UPDATE public.assemblies
    SET quantity_on_hand = quantity_on_hand + poi.quantity
    FROM public.production_order_items poi
    WHERE poi.production_order_id = NEW.id
    AND poi.item_type = 'assembly'
    AND poi.assembly_id = assemblies.id;
    
    -- Update assembly production trigger status if this was auto-generated
    IF NEW.auto_generated = true THEN
      UPDATE public.assembly_production_triggers
      SET status = 'completed'
      WHERE production_order_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for assembly production completion
DROP TRIGGER IF EXISTS trigger_assembly_production_completion ON public.production_orders;
CREATE TRIGGER trigger_assembly_production_completion
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_assembly_production_completion();
