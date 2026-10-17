-- Fix security warnings by adding search_path to functions

-- Update update_inventory_availability function with search_path
CREATE OR REPLACE FUNCTION public.update_inventory_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Update quantity_available = quantity_on_hand + quantity_on_order - quantity_allocated
  NEW.quantity_available := NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated;
  RETURN NEW;
END;
$function$;

-- Update update_assembly_availability function with search_path
CREATE OR REPLACE FUNCTION public.update_assembly_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Update quantity_available = quantity_on_hand + quantity_on_order - quantity_allocated
  NEW.quantity_available := NEW.quantity_on_hand + NEW.quantity_on_order - NEW.quantity_allocated;
  RETURN NEW;
END;
$function$;

-- Update handle_purchase_order_item_changes function with search_path  
CREATE OR REPLACE FUNCTION public.handle_purchase_order_item_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Calculate total_cost
    NEW.total_cost := NEW.quantity * NEW.unit_cost;
    
    -- Calculate quantity_remaining
    NEW.quantity_remaining := NEW.quantity - NEW.quantity_received;
    
    -- Update quantity_on_order for the referenced item
    IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
      -- Calculate difference for updates
      IF TG_OP = 'UPDATE' THEN
        UPDATE public.inventory_items
        SET quantity_on_order = quantity_on_order - OLD.quantity + NEW.quantity
        WHERE id = NEW.inventory_item_id;
      ELSE
        UPDATE public.inventory_items
        SET quantity_on_order = quantity_on_order + NEW.quantity
        WHERE id = NEW.inventory_item_id;
      END IF;
    ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
      -- Calculate difference for updates
      IF TG_OP = 'UPDATE' THEN
        UPDATE public.assemblies
        SET quantity_on_order = quantity_on_order - OLD.quantity + NEW.quantity
        WHERE id = NEW.assembly_id;
      ELSE
        UPDATE public.assemblies
        SET quantity_on_order = quantity_on_order + NEW.quantity
        WHERE id = NEW.assembly_id;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    -- Reduce quantity_on_order
    IF OLD.item_type = 'inventory_item' AND OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.inventory_items
      SET quantity_on_order = quantity_on_order - OLD.quantity
      WHERE id = OLD.inventory_item_id;
    ELSIF OLD.item_type = 'assembly' AND OLD.assembly_id IS NOT NULL THEN
      UPDATE public.assemblies
      SET quantity_on_order = quantity_on_order - OLD.quantity
      WHERE id = OLD.assembly_id;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;