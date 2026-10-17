-- Update handle_purchase_order_receiving to create demand_events for consigned assembly components
CREATE OR REPLACE FUNCTION public.handle_purchase_order_receiving()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  variance_qty INTEGER;
  received_delta INTEGER;
  assembly_record RECORD;
  component RECORD;
  po_number TEXT;
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
    
    -- Calculate the delta of received quantity
    received_delta := NEW.quantity_received - COALESCE(OLD.quantity_received, 0);
    
    -- Update inventory quantities based on item type
    IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
      -- Update inventory item quantities
      UPDATE public.inventory_items
      SET 
        quantity_on_hand = quantity_on_hand + received_delta,
        quantity_on_order = quantity_on_order - received_delta
      WHERE id = NEW.inventory_item_id;
      
    ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Update assembly quantities
      UPDATE public.assemblies
      SET 
        quantity_on_hand = quantity_on_hand + received_delta,
        quantity_on_order = quantity_on_order - received_delta
      WHERE id = NEW.assembly_id;
      
      -- Check if assembly is externally sourced AND consigned
      SELECT is_externally_sourced, is_consigned
      INTO assembly_record
      FROM public.assemblies
      WHERE id = NEW.assembly_id;
      
      -- If consigned, consume components from inventory and record demand events
      IF assembly_record.is_externally_sourced = TRUE AND assembly_record.is_consigned = TRUE AND received_delta > 0 THEN
        -- Get the purchase order number for reference
        SELECT po.purchase_order_number
        INTO po_number
        FROM public.purchase_orders po
        WHERE po.id = NEW.purchase_order_id;
        
        -- Loop through all components, decrement inventory, and create demand events
        FOR component IN
          SELECT ac.inventory_item_id, ac.quantity_needed
          FROM public.assembly_components ac
          WHERE ac.assembly_id = NEW.assembly_id
        LOOP
          -- Decrement inventory
          UPDATE public.inventory_items
          SET quantity_on_hand = quantity_on_hand - (component.quantity_needed * received_delta)
          WHERE id = component.inventory_item_id;
          
          -- Create demand event for pull-based calculations
          INSERT INTO public.demand_events (
            inventory_item_id,
            quantity_demanded,
            demand_date,
            demand_source,
            source_order_id,
            source_assembly_id,
            notes
          ) VALUES (
            component.inventory_item_id,
            component.quantity_needed * received_delta,
            CURRENT_DATE,
            'consigned_production',
            COALESCE(po_number, NEW.purchase_order_id::text),
            NEW.assembly_id,
            'Component consumed for consigned assembly receiving'
          );
        END LOOP;
      END IF;
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