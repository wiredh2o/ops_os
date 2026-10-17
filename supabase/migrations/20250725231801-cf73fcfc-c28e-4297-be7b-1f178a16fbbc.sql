-- Add allocation fields to inventory_items
ALTER TABLE public.inventory_items 
ADD COLUMN quantity_allocated integer DEFAULT 0 NOT NULL,
ADD COLUMN quantity_available integer GENERATED ALWAYS AS (quantity_on_hand - quantity_allocated) STORED;

-- Add inventory fields to assemblies
ALTER TABLE public.assemblies 
ADD COLUMN quantity_on_hand integer DEFAULT 0 NOT NULL,
ADD COLUMN quantity_allocated integer DEFAULT 0 NOT NULL,
ADD COLUMN quantity_available integer GENERATED ALWAYS AS (quantity_on_hand - quantity_allocated) STORED,
ADD COLUMN reorder_point integer DEFAULT 0 NOT NULL;

-- Create order_type enum
CREATE TYPE order_type AS ENUM ('customer', 'assembly_build');

-- Add order_type to production_orders
ALTER TABLE public.production_orders 
ADD COLUMN order_type order_type DEFAULT 'customer' NOT NULL;

-- Update existing production orders to be customer orders
UPDATE public.production_orders SET order_type = 'customer';

-- Create function to allocate inventory for customer orders
CREATE OR REPLACE FUNCTION public.allocate_inventory_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Only allocate for customer orders
  IF NEW.order_type = 'customer' THEN
    -- Allocate based on item type
    IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
      -- Allocate inventory item
      UPDATE public.inventory_items 
      SET quantity_allocated = quantity_allocated + NEW.quantity
      WHERE id = NEW.inventory_item_id;
      
    ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Allocate assembly
      UPDATE public.assemblies 
      SET quantity_allocated = quantity_allocated + NEW.quantity
      WHERE id = NEW.assembly_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create function to deallocate and deduct inventory on shipment
CREATE OR REPLACE FUNCTION public.process_customer_order_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  item_record RECORD;
  assembly_record RECORD;
  build_order_id UUID;
  reorder_qty INTEGER;
BEGIN
  -- Only process customer orders that just changed to shipped
  IF NEW.order_type = 'customer' AND NEW.status = 'shipped' AND (OLD.status IS NULL OR OLD.status != 'shipped') THEN
    
    -- Process all items in the order
    FOR item_record IN 
      SELECT * FROM public.production_order_items 
      WHERE production_order_id = NEW.id
    LOOP
      IF item_record.item_type = 'inventory_item' AND item_record.inventory_item_id IS NOT NULL THEN
        -- Deallocate and deduct inventory item
        UPDATE public.inventory_items 
        SET quantity_allocated = quantity_allocated - item_record.quantity,
            quantity_on_hand = quantity_on_hand - item_record.quantity
        WHERE id = item_record.inventory_item_id;
        
      ELSIF item_record.item_type = 'assembly' AND item_record.assembly_id IS NOT NULL THEN
        -- Deallocate and deduct assembly
        UPDATE public.assemblies 
        SET quantity_allocated = quantity_allocated - item_record.quantity,
            quantity_on_hand = quantity_on_hand - item_record.quantity
        WHERE id = item_record.assembly_id;
        
        -- Create assembly build order to replenish
        SELECT * INTO assembly_record FROM public.assemblies WHERE id = item_record.assembly_id;
        
        -- Calculate quantity needed to reach reorder point
        reorder_qty := GREATEST(assembly_record.reorder_point - (assembly_record.quantity_on_hand - item_record.quantity), 0);
        
        IF reorder_qty > 0 THEN
          -- Create assembly build order
          INSERT INTO public.production_orders (
            order_number,
            customer_name,
            order_type,
            status,
            priority,
            created_by,
            notes
          ) VALUES (
            'AB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(EXTRACT(EPOCH FROM NOW())::TEXT, 8, '0'),
            'Internal Assembly Build',
            'assembly_build',
            'pending',
            'normal',
            NEW.created_by,
            'Auto-generated build order for assembly: ' || assembly_record.sku
          ) RETURNING id INTO build_order_id;
          
          -- Add assembly item to build order
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
            build_order_id,
            'assembly',
            item_record.assembly_id,
            assembly_record.sku,
            assembly_record.sku,
            reorder_qty,
            assembly_record.selling_price,
            assembly_record.selling_price * reorder_qty
          );
          
          -- Update build order total
          UPDATE public.production_orders 
          SET total_amount = assembly_record.selling_price * reorder_qty
          WHERE id = build_order_id;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create function to complete assembly build orders
CREATE OR REPLACE FUNCTION public.complete_assembly_build_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  item_record RECORD;
  component_record RECORD;
BEGIN
  -- Only process assembly build orders that just changed to shipped/completed
  IF NEW.order_type = 'assembly_build' AND NEW.status = 'shipped' AND (OLD.status IS NULL OR OLD.status != 'shipped') THEN
    
    -- Process all assembly items in the build order
    FOR item_record IN 
      SELECT * FROM public.production_order_items 
      WHERE production_order_id = NEW.id AND item_type = 'assembly'
    LOOP
      -- Deduct component items from inventory
      FOR component_record IN
        SELECT ac.*, ii.sku as component_sku
        FROM public.assembly_components ac
        JOIN public.inventory_items ii ON ac.inventory_item_id = ii.id
        WHERE ac.assembly_id = item_record.assembly_id
      LOOP
        UPDATE public.inventory_items 
        SET quantity_on_hand = quantity_on_hand - (component_record.quantity_needed * item_record.quantity)
        WHERE id = component_record.inventory_item_id;
      END LOOP;
      
      -- Add completed assemblies to inventory
      UPDATE public.assemblies 
      SET quantity_on_hand = quantity_on_hand + item_record.quantity
      WHERE id = item_record.assembly_id;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create triggers
CREATE TRIGGER allocate_inventory_trigger
  AFTER INSERT ON public.production_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.allocate_inventory_for_order();

CREATE TRIGGER process_shipment_trigger
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.process_customer_order_shipment();

CREATE TRIGGER complete_build_order_trigger
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_assembly_build_order();

-- Update existing process_inventory_deduction function to not process assembly build orders
CREATE OR REPLACE FUNCTION public.process_inventory_deduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  order_type_val order_type;
BEGIN
  -- Get the order type
  SELECT po.order_type INTO order_type_val
  FROM public.production_orders po
  WHERE po.id = NEW.production_order_id;
  
  -- Only process customer orders (not assembly build orders)
  IF order_type_val = 'customer' THEN
    -- This is now handled by the allocation system
    -- No immediate deduction, just allocation
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;