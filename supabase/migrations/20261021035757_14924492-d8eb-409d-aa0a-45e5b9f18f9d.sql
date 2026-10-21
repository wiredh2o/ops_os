CREATE FUNCTION tax_private.save_tax_zip_assignment(p_zip text,p_state text,p_is_taxable boolean,p_jurisdiction_ids uuid[],p_change_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.can_manage_tax() THEN RAISE EXCEPTION 'Admin or Accounting required'; END IF;
 IF p_zip !~ '^[0-9]{5}$' OR p_state !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Invalid ZIP or state'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_jurisdiction_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.tax_jurisdictions j WHERE j.id=x AND j.state=p_state)) THEN RAISE EXCEPTION 'Jurisdiction state mismatch'; END IF;
 INSERT INTO public.tax_zip_codes(zip,state,is_taxable,reviewed) VALUES(p_zip,p_state,p_is_taxable,true) ON CONFLICT(zip,state) DO UPDATE SET is_taxable=excluded.is_taxable,reviewed=true;
 DELETE FROM public.tax_zip_jurisdictions WHERE zip=p_zip AND state=p_state;
 INSERT INTO public.tax_zip_jurisdictions(zip,state,jurisdiction_id) SELECT p_zip,p_state,x FROM unnest(p_jurisdiction_ids) x ON CONFLICT DO NOTHING;
 UPDATE public.tax_zip_changes SET resolved_at=now() WHERE zip=p_zip AND state=p_state AND change_type IN ('new','unmatched');
 END $$;
REVOKE ALL ON FUNCTION tax_private.save_tax_zip_assignment(text,text,boolean,uuid[],uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION tax_private.save_tax_zip_assignment(text,text,boolean,uuid[],uuid) TO authenticated,service_role;
CREATE FUNCTION public.save_tax_zip_assignment(p_zip text,p_state text,p_is_taxable boolean,p_jurisdiction_ids uuid[],p_change_id uuid DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT tax_private.save_tax_zip_assignment(p_zip,p_state,p_is_taxable,p_jurisdiction_ids,p_change_id) $$;
REVOKE ALL ON FUNCTION public.save_tax_zip_assignment(text,text,boolean,uuid[],uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_tax_zip_assignment(text,text,boolean,uuid[],uuid) TO authenticated,service_role;
CREATE FUNCTION public.flag_unmatched_tax_zip() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE z text:=left(NEW.tax_destination->>'zip',5); s text:=upper(NEW.tax_destination->>'state'); BEGIN
 IF NEW.tax_review_required AND z ~ '^[0-9]{5}$' AND s ~ '^[A-Z]{2}$' AND NOT EXISTS(SELECT 1 FROM public.tax_zip_codes WHERE zip=z AND state=s AND reviewed) THEN INSERT INTO public.tax_zip_changes(zip,state,change_type) VALUES(z,s,'unmatched') ON CONFLICT DO NOTHING; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.flag_unmatched_tax_zip() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER flag_customer_tax_zip AFTER UPDATE OF tax_review_required ON public.customer_orders FOR EACH ROW EXECUTE FUNCTION public.flag_unmatched_tax_zip();
CREATE TRIGGER flag_invoice_tax_zip AFTER UPDATE OF tax_review_required ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.flag_unmatched_tax_zip();
CREATE FUNCTION public.protect_tax_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF pg_trigger_depth()<=1 AND (NEW.tax_lines IS DISTINCT FROM OLD.tax_lines OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR NEW.tax_review_required IS DISTINCT FROM OLD.tax_review_required) THEN RAISE EXCEPTION 'Tax snapshots are calculated automatically'; END IF;
 IF TG_TABLE_NAME='production_orders' AND (OLD.payment_received_at IS NOT NULL OR OLD.label_created_at IS NOT NULL OR OLD.picked_up_at IS NOT NULL) AND NEW.tax_destination IS DISTINCT FROM OLD.tax_destination THEN RAISE EXCEPTION 'Paid or shipped invoice tax destination is locked'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER protect_customer_tax BEFORE UPDATE ON public.customer_orders FOR EACH ROW EXECUTE FUNCTION public.protect_tax_snapshot();
CREATE TRIGGER protect_invoice_tax BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.protect_tax_snapshot();