-- Step 1: Drop existing trigger if it exists
DROP TRIGGER IF EXISTS handle_purchase_order_item_changes_trigger ON public.purchase_order_items;
DROP TRIGGER IF EXISTS handle_purchase_order_status_change_trigger ON public.purchase_orders;

-- Step 2: Modify handle_purchase_order_item_changes to only update QOO for sent/partial POs
CREATE OR REPLACE FUNCTION public.handle_purchase_order_item_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  po_status text;
BEGIN
  -- Get parent PO status
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO po_status FROM public.purchase_orders WHERE id = OLD.purchase_order_id;
  ELSE
    SELECT status INTO po_status FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Calculate total_cost and quantity_remaining
    NEW.total_cost := NEW.quantity * NEW.unit_cost;
    NEW.quantity_remaining := NEW.quantity - NEW.quantity_received;
    
    -- ONLY update quantity_on_order if PO is actually sent/partial
    IF po_status IN ('sent', 'partial') THEN
      IF NEW.item_type = 'inventory_item' AND NEW.inventory_item_id IS NOT NULL THEN
        IF TG_OP = 'UPDATE' THEN
          UPDATE public.inventory_items
          SET quantity_on_order = GREATEST(0, quantity_on_order - OLD.quantity_remaining + NEW.quantity_remaining)
          WHERE id = NEW.inventory_item_id;
        ELSE
          UPDATE public.inventory_items
          SET quantity_on_order = quantity_on_order + NEW.quantity_remaining
          WHERE id = NEW.inventory_item_id;
        END IF;
      ELSIF NEW.item_type = 'assembly' AND NEW.assembly_id IS NOT NULL THEN
        IF TG_OP = 'UPDATE' THEN
          UPDATE public.assemblies
          SET quantity_on_order = GREATEST(0, quantity_on_order - OLD.quantity_remaining + NEW.quantity_remaining)
          WHERE id = NEW.assembly_id;
        ELSE
          UPDATE public.assemblies
          SET quantity_on_order = quantity_on_order + NEW.quantity_remaining
          WHERE id = NEW.assembly_id;
        END IF;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE - only reduce QOO if PO was sent/partial
  IF TG_OP = 'DELETE' THEN
    IF po_status IN ('sent', 'partial') THEN
      IF OLD.item_type = 'inventory_item' AND OLD.inventory_item_id IS NOT NULL THEN
        UPDATE public.inventory_items
        SET quantity_on_order = GREATEST(0, quantity_on_order - OLD.quantity_remaining)
        WHERE id = OLD.inventory_item_id;
      ELSIF OLD.item_type = 'assembly' AND OLD.assembly_id IS NOT NULL THEN
        UPDATE public.assemblies
        SET quantity_on_order = GREATEST(0, quantity_on_order - OLD.quantity_remaining)
        WHERE id = OLD.assembly_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;

-- Recreate the item changes trigger
CREATE TRIGGER handle_purchase_order_item_changes_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_purchase_order_item_changes();

-- Step 3: Create NEW trigger for PO status changes
CREATE OR REPLACE FUNCTION public.handle_purchase_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Only act on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- CASE 1: Status changes TO 'sent' from draft/approved
  -- This is when we ADD to quantity_on_order
  IF NEW.status = 'sent' AND OLD.status IN ('draft', 'approved') THEN
    -- Add all item quantities to quantity_on_order for inventory items
    UPDATE public.inventory_items ii
    SET quantity_on_order = quantity_on_order + poi.quantity_remaining
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.item_type = 'inventory_item'
      AND poi.inventory_item_id = ii.id;

    -- Add all item quantities to quantity_on_order for assemblies
    UPDATE public.assemblies a
    SET quantity_on_order = quantity_on_order + poi.quantity_remaining
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.item_type = 'assembly'
      AND poi.assembly_id = a.id;
  END IF;

  -- CASE 2: Status changes TO 'cancelled' FROM 'sent' or 'partial'
  -- SUBTRACT all undelivered quantities from quantity_on_order
  IF NEW.status = 'cancelled' AND OLD.status IN ('sent', 'partial') THEN
    UPDATE public.inventory_items ii
    SET quantity_on_order = GREATEST(0, quantity_on_order - poi.quantity_remaining)
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.item_type = 'inventory_item'
      AND poi.inventory_item_id = ii.id;

    UPDATE public.assemblies a
    SET quantity_on_order = GREATEST(0, quantity_on_order - poi.quantity_remaining)
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.item_type = 'assembly'
      AND poi.assembly_id = a.id;
  END IF;

  -- CASE 3: Status changes TO 'closed' FROM 'sent' or 'partial'
  -- Same as cancelled - subtract remaining undelivered quantities
  IF NEW.status = 'closed' AND OLD.status IN ('sent', 'partial') THEN
    UPDATE public.inventory_items ii
    SET quantity_on_order = GREATEST(0, quantity_on_order - poi.quantity_remaining)
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.item_type = 'inventory_item'
      AND poi.inventory_item_id = ii.id;

    UPDATE public.assemblies a
    SET quantity_on_order = GREATEST(0, quantity_on_order - poi.quantity_remaining)
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = NEW.id
      AND poi.item_type = 'assembly'
      AND poi.assembly_id = a.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create the status change trigger
CREATE TRIGGER handle_purchase_order_status_change_trigger
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_purchase_order_status_change();

-- Step 4: Recalculate quantity_on_order based ONLY on sent/partial POs
UPDATE inventory_items ii
SET quantity_on_order = COALESCE((
  SELECT SUM(poi.quantity_remaining)
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.inventory_item_id = ii.id
    AND po.status IN ('sent', 'partial')
), 0);

UPDATE assemblies a
SET quantity_on_order = COALESCE((
  SELECT SUM(poi.quantity_remaining)
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.assembly_id = a.id
    AND po.status IN ('sent', 'partial')
), 0);

-- Step 5: Delete auto-generated draft POs (they'll regenerate correctly)
DELETE FROM purchase_orders
WHERE status = 'draft' 
  AND auto_generated = true;