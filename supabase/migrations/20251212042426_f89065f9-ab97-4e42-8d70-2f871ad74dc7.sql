-- Update handle_purchase_order_receiving to use simplified logic
-- BOM decrements when: is_consigned = TRUE (for externally sourced items)
-- The made_from_raw_materials check is redundant since it's now derived

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
  inventory_record RECORD;
  component RECORD;
  po_number TEXT;
  consumed_qty NUMERIC;
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
      
      -- Check if inventory item is consigned (materials sent to contract manufacturer)
      SELECT is_consigned
      INTO inventory_record
      FROM public.inventory_items
      WHERE id = NEW.inventory_item_id;
      
      -- If consigned, consume components from inventory
      -- (consigned implies externally sourced with materials we need to track)
      IF inventory_record.is_consigned = TRUE AND received_delta > 0 THEN
        
        -- Get the purchase order number for reference
        SELECT po.purchase_order_number
        INTO po_number
        FROM public.purchase_orders po
        WHERE po.id = NEW.purchase_order_id;
        
        -- Loop through all components, decrement inventory, and create demand events
        FOR component IN
          SELECT iic.component_item_id, iic.quantity_needed, iic.waste_factor
          FROM public.inventory_item_components iic
          WHERE iic.inventory_item_id = NEW.inventory_item_id
        LOOP
          -- Calculate consumed quantity with waste factor
          consumed_qty := component.quantity_needed * received_delta * (1 + COALESCE(component.waste_factor, 0));
          
          -- Decrement component inventory
          UPDATE public.inventory_items
          SET quantity_on_hand = quantity_on_hand - consumed_qty
          WHERE id = component.component_item_id;
          
          -- Create demand event for the component consumption
          INSERT INTO public.demand_events (
            inventory_item_id,
            demand_date,
            demand_source,
            source_order_id,
            quantity_demanded,
            notes
          ) VALUES (
            component.component_item_id,
            CURRENT_DATE,
            'consigned_manufacturing',
            NEW.purchase_order_id::text,
            consumed_qty,
            'Consumed for consigned item via PO ' || COALESCE(po_number, 'unknown')
          );
        END LOOP;
      END IF;
      
    ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Check if assembly is consigned (externally sourced with components we provide)
      SELECT is_externally_sourced, is_consigned
      INTO assembly_record
      FROM public.assemblies
      WHERE id = NEW.assembly_id;
      
      -- Update assembly quantities
      UPDATE public.assemblies
      SET 
        quantity_on_hand = quantity_on_hand + received_delta,
        quantity_on_order = quantity_on_order - received_delta
      WHERE id = NEW.assembly_id;
      
      -- If this is a consigned assembly, decrement component inventory and create demand events
      IF assembly_record.is_externally_sourced = TRUE 
         AND assembly_record.is_consigned = TRUE 
         AND received_delta > 0 THEN
        
        -- Get the purchase order number for reference
        SELECT po.purchase_order_number
        INTO po_number
        FROM public.purchase_orders po
        WHERE po.id = NEW.purchase_order_id;
        
        -- Loop through all components and decrement inventory
        FOR component IN
          SELECT ac.inventory_item_id, ac.quantity_needed
          FROM public.assembly_components ac
          WHERE ac.assembly_id = NEW.assembly_id
        LOOP
          -- Decrement component inventory
          UPDATE public.inventory_items
          SET quantity_on_hand = quantity_on_hand - (component.quantity_needed * received_delta)
          WHERE id = component.inventory_item_id;
          
          -- Create demand event for the component consumption
          INSERT INTO public.demand_events (
            inventory_item_id,
            demand_date,
            demand_source,
            source_order_id,
            source_assembly_id,
            quantity_demanded,
            notes
          ) VALUES (
            component.inventory_item_id,
            CURRENT_DATE,
            'consigned_assembly',
            NEW.purchase_order_id::text,
            NEW.assembly_id,
            component.quantity_needed * received_delta,
            'Consumed for consigned assembly via PO ' || COALESCE(po_number, 'unknown')
          );
        END LOOP;
      END IF;
    END IF;
    
    -- Update status based on receiving state
    IF NEW.quantity_received >= NEW.quantity THEN
      NEW.status := 'received';
    ELSIF NEW.quantity_received > 0 THEN
      NEW.status := 'partial';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;