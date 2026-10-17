CREATE OR REPLACE FUNCTION public.prevent_inbound_package_item_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.package_id IS DISTINCT FROM OLD.package_id
     OR NEW.repair_item_id IS DISTINCT FROM OLD.repair_item_id
     OR NEW.unboxing_order IS DISTINCT FROM OLD.unboxing_order THEN
    RAISE EXCEPTION 'Repair item package assignment and item number are immutable once assigned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_inbound_package_item_identity_change
ON public.inbound_package_items;

CREATE TRIGGER trg_prevent_inbound_package_item_identity_change
BEFORE UPDATE ON public.inbound_package_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inbound_package_item_identity_change();