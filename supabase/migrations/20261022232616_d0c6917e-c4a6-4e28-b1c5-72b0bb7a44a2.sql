CREATE OR REPLACE FUNCTION public.protect_tax_snapshot()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN
 IF pg_trigger_depth()<=1 AND (NEW.tax_lines IS DISTINCT FROM OLD.tax_lines OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR NEW.tax_review_required IS DISTINCT FROM OLD.tax_review_required) THEN RAISE EXCEPTION 'Tax snapshots are calculated automatically'; END IF;
 IF TG_TABLE_NAME='production_orders' THEN
   IF (OLD.payment_received_at IS NOT NULL OR OLD.label_created_at IS NOT NULL OR OLD.picked_up_at IS NOT NULL) AND NEW.tax_destination IS DISTINCT FROM OLD.tax_destination THEN RAISE EXCEPTION 'Paid or shipped invoice tax destination is locked'; END IF;
 END IF;
 RETURN NEW; END $function$;