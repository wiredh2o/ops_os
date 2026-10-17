-- Add new columns to inventory_items for manufactured items and consignment
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS made_from_raw_materials BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS is_consigned BOOLEAN NOT NULL DEFAULT false;

-- Create inventory_item_components table for Production BOM
CREATE TABLE IF NOT EXISTS public.inventory_item_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  component_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity_needed NUMERIC NOT NULL DEFAULT 1,
  waste_factor NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_reference CHECK (inventory_item_id != component_item_id),
  CONSTRAINT unique_component_per_item UNIQUE (inventory_item_id, component_item_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_inventory_item_components_item ON public.inventory_item_components(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_components_component ON public.inventory_item_components(component_item_id);

-- Enable RLS
ALTER TABLE public.inventory_item_components ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Inventory item components viewable by authenticated users"
ON public.inventory_item_components FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory item components manageable by authenticated users"
ON public.inventory_item_components FOR ALL
USING (auth.uid() IS NOT NULL);

-- Update handle_purchase_order_receiving to also handle consigned manufactured inventory items
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
      
      -- Check if inventory item is consigned manufactured item
      SELECT is_externally_sourced, is_consigned, made_from_raw_materials
      INTO inventory_record
      FROM public.inventory_items
      WHERE id = NEW.inventory_item_id;
      
      -- If consigned and made from raw materials, consume components from inventory
      IF inventory_record.is_externally_sourced = TRUE 
         AND inventory_record.is_consigned = TRUE 
         AND inventory_record.made_from_raw_materials = TRUE 
         AND received_delta > 0 THEN
        
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
          
          -- Decrement inventory
          UPDATE public.inventory_items
          SET quantity_on_hand = quantity_on_hand - consumed_qty
          WHERE id = component.component_item_id;
          
          -- Create demand event for pull-based calculations
          INSERT INTO public.demand_events (
            inventory_item_id,
            quantity_demanded,
            demand_date,
            demand_source,
            source_order_id,
            notes
          ) VALUES (
            component.component_item_id,
            consumed_qty,
            CURRENT_DATE,
            'consigned_production',
            COALESCE(po_number, NEW.purchase_order_id::text),
            'Component consumed for consigned manufactured inventory item receiving'
          );
        END LOOP;
      END IF;
      
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