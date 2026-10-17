-- Complete Order Subtype Removal Migration

-- Step 1: Drop order_subtype columns from both tables
ALTER TABLE public.production_orders DROP COLUMN IF EXISTS order_subtype;
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS order_subtype;

-- Step 2: Drop the order_subtype enum type
DROP TYPE IF EXISTS public.order_subtype;

-- Step 3: Update the check_assembly_14_day_threshold function to remove order_subtype
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