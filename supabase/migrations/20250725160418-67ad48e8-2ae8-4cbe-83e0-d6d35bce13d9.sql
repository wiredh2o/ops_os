-- Fix search path security issue for process_inventory_deduction function
CREATE OR REPLACE FUNCTION public.process_inventory_deduction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a new order item or quantity changed
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.quantity != NEW.quantity) THEN
    -- Calculate quantity difference for updates
    DECLARE
      qty_diff INTEGER := NEW.quantity;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        qty_diff := NEW.quantity - OLD.quantity;
      END IF;

      -- Process based on item type
      IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
        -- Direct inventory item deduction
        UPDATE public.inventory_items 
        SET quantity_on_hand = quantity_on_hand - qty_diff
        WHERE id = NEW.inventory_item_id;
      
      ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
        -- Assembly deduction - reduce all component items
        UPDATE public.inventory_items 
        SET quantity_on_hand = quantity_on_hand - (ac.quantity_needed * qty_diff)
        FROM public.assembly_components ac
        WHERE ac.assembly_id = NEW.assembly_id 
        AND public.inventory_items.id = ac.inventory_item_id;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Fix search path security issue for calculate_assembly_cost function
CREATE OR REPLACE FUNCTION public.calculate_assembly_cost(assembly_id_param UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_cost NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(ii.unit_price * ac.quantity_needed), 0)
  INTO total_cost
  FROM public.assembly_components ac
  JOIN public.inventory_items ii ON ac.inventory_item_id = ii.id
  WHERE ac.assembly_id = assembly_id_param;
  
  RETURN total_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';