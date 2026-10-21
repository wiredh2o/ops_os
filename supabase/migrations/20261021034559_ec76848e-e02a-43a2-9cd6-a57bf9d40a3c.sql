CREATE OR REPLACE FUNCTION public.can_manage_tax() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accounting') $$;
REVOKE ALL ON FUNCTION public.can_manage_tax() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.can_manage_tax() TO authenticated,service_role;
CREATE TABLE public.tax_jurisdictions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL, state text NOT NULL, rate numeric, is_taxable boolean NOT NULL DEFAULT true, tax_shipping boolean NOT NULL DEFAULT false, shipment_fee numeric NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tax_jurisdictions TO authenticated; GRANT ALL ON public.tax_jurisdictions TO service_role;
ALTER TABLE public.tax_jurisdictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_rules_read ON public.tax_jurisdictions FOR SELECT TO authenticated USING (true);
CREATE POLICY tax_rules_manage ON public.tax_jurisdictions FOR ALL TO authenticated USING (public.can_manage_tax()) WITH CHECK(public.can_manage_tax());
CREATE UNIQUE INDEX tax_one_active_state ON public.tax_jurisdictions(state) WHERE kind='state' AND active;
CREATE TABLE public.tax_zip_codes (zip text NOT NULL, state text NOT NULL, is_taxable boolean NOT NULL DEFAULT true, reviewed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(zip,state));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tax_zip_codes TO authenticated; GRANT ALL ON public.tax_zip_codes TO service_role;
ALTER TABLE public.tax_zip_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_zips_read ON public.tax_zip_codes FOR SELECT TO authenticated USING(true);
CREATE POLICY tax_zips_manage ON public.tax_zip_codes FOR ALL TO authenticated USING(public.can_manage_tax()) WITH CHECK(public.can_manage_tax());
CREATE TABLE public.tax_zip_jurisdictions (zip text NOT NULL, state text NOT NULL, jurisdiction_id uuid NOT NULL REFERENCES public.tax_jurisdictions(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(zip,state,jurisdiction_id), FOREIGN KEY(zip,state) REFERENCES public.tax_zip_codes(zip,state) ON DELETE CASCADE);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tax_zip_jurisdictions TO authenticated; GRANT ALL ON public.tax_zip_jurisdictions TO service_role;
ALTER TABLE public.tax_zip_jurisdictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_assignments_read ON public.tax_zip_jurisdictions FOR SELECT TO authenticated USING(true);
CREATE POLICY tax_assignments_manage ON public.tax_zip_jurisdictions FOR ALL TO authenticated USING(public.can_manage_tax()) WITH CHECK(public.can_manage_tax());
CREATE TABLE public.tax_zip_directory (zip text NOT NULL, state text NOT NULL, present boolean NOT NULL DEFAULT true, last_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(zip,state));
GRANT SELECT ON public.tax_zip_directory TO authenticated; GRANT ALL ON public.tax_zip_directory TO service_role;
ALTER TABLE public.tax_zip_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_directory_read ON public.tax_zip_directory FOR SELECT TO authenticated USING(public.can_manage_tax());
CREATE TABLE public.tax_zip_changes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), zip text NOT NULL, state text NOT NULL, change_type text NOT NULL, detected_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,UPDATE ON public.tax_zip_changes TO authenticated; GRANT ALL ON public.tax_zip_changes TO service_role;
ALTER TABLE public.tax_zip_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_changes_read ON public.tax_zip_changes FOR SELECT TO authenticated USING(public.can_manage_tax());
CREATE POLICY tax_changes_resolve ON public.tax_zip_changes FOR UPDATE TO authenticated USING(public.can_manage_tax()) WITH CHECK(public.can_manage_tax());
CREATE UNIQUE INDEX tax_zip_open_change ON public.tax_zip_changes(zip,state,change_type) WHERE resolved_at IS NULL;
CREATE TABLE public.tax_zip_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_url text NOT NULL, zip_count integer NOT NULL, new_count integer NOT NULL, removed_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.tax_zip_sync_runs TO authenticated; GRANT ALL ON public.tax_zip_sync_runs TO service_role;
ALTER TABLE public.tax_zip_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_sync_read ON public.tax_zip_sync_runs FOR SELECT TO authenticated USING(public.can_manage_tax());
CREATE OR REPLACE FUNCTION public.validate_tax_setting() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='tax_jurisdictions' THEN
  IF NEW.kind NOT IN ('state','county','city','special_district') OR NEW.state !~ '^[A-Z]{2}$' OR length(trim(NEW.name))=0 OR NEW.rate<0 OR NEW.rate>100 OR NEW.shipment_fee<0 THEN RAISE EXCEPTION 'Invalid jurisdiction, state, rate or fee'; END IF;
 ELSIF TG_TABLE_NAME='tax_zip_codes' THEN IF NEW.zip !~ '^[0-9]{5}$' OR NEW.state !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Use a five-digit ZIP and two-letter state'; END IF;
 ELSE IF NOT EXISTS(SELECT 1 FROM public.tax_jurisdictions j WHERE j.id=NEW.jurisdiction_id AND j.state=NEW.state) THEN RAISE EXCEPTION 'ZIP assignments must match the jurisdiction state'; END IF; END IF;
 NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER validate_tax_jurisdiction BEFORE INSERT OR UPDATE ON public.tax_jurisdictions FOR EACH ROW EXECUTE FUNCTION public.validate_tax_setting();
CREATE TRIGGER validate_tax_zip BEFORE INSERT OR UPDATE ON public.tax_zip_codes FOR EACH ROW EXECUTE FUNCTION public.validate_tax_setting();
CREATE TRIGGER validate_tax_assignment BEFORE INSERT OR UPDATE ON public.tax_zip_jurisdictions FOR EACH ROW EXECUTE FUNCTION public.validate_tax_setting();
CREATE TRIGGER tax_directory_updated BEFORE UPDATE ON public.tax_zip_directory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tax_changes_updated BEFORE UPDATE ON public.tax_zip_changes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.customer_orders ADD COLUMN tax_lines jsonb NOT NULL DEFAULT '[]', ADD COLUMN tax_amount numeric NOT NULL DEFAULT 0, ADD COLUMN tax_destination jsonb, ADD COLUMN tax_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.production_orders ADD COLUMN tax_lines jsonb NOT NULL DEFAULT '[]', ADD COLUMN tax_amount numeric NOT NULL DEFAULT 0, ADD COLUMN tax_destination jsonb, ADD COLUMN tax_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer_order_items ADD COLUMN is_taxable boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.compute_jurisdiction_tax(p_company_id uuid,p_destination jsonb,p_items jsonb,p_shipping numeric DEFAULT 0,p_shipments integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.companies; s text; z text; base numeric:=0; j record; a numeric; b numeric; lines jsonb:='[]'; total numeric:=0; state_rule public.tax_jurisdictions; zip_rule public.tax_zip_codes;
BEGIN
 SELECT * INTO c FROM public.companies WHERE id=p_company_id;
 IF NOT FOUND OR NOT coalesce(c.is_taxable,false) OR coalesce(c.is_distributor,false) OR coalesce((p_destination->>'is_taxable')::boolean,true)=false THEN RETURN jsonb_build_object('tax_lines',lines,'tax_amount',0,'review_required',false); END IF;
 s:=upper(trim(coalesce(p_destination->>'state',''))); z:=left(coalesce(p_destination->>'zip',p_destination->>'postal_code',''),5);
 SELECT coalesce(sum((i->>'amount')::numeric),0) INTO base FROM jsonb_array_elements(coalesce(p_items,'[]')) i WHERE coalesce(i->>'item_type','')<>'labor' AND coalesce((i->>'is_taxable')::boolean,false);
 IF base<=0 THEN RETURN jsonb_build_object('tax_lines',lines,'tax_amount',0,'review_required',false); END IF;
 SELECT * INTO state_rule FROM public.tax_jurisdictions WHERE state=s AND kind='state' AND active;
 IF NOT FOUND THEN RETURN jsonb_build_object('tax_lines',lines,'tax_amount',0,'review_required',true); END IF;
 IF NOT state_rule.is_taxable THEN RETURN jsonb_build_object('tax_lines',lines,'tax_amount',0,'review_required',false); END IF;
 SELECT * INTO zip_rule FROM public.tax_zip_codes WHERE zip=z AND state=s;
 IF FOUND AND NOT zip_rule.is_taxable THEN RETURN jsonb_build_object('tax_lines',lines,'tax_amount',0,'review_required',false); END IF;
 FOR j IN SELECT * FROM public.tax_jurisdictions t WHERE t.active AND t.is_taxable AND t.state=s AND (t.id=state_rule.id OR EXISTS(SELECT 1 FROM public.tax_zip_jurisdictions x WHERE x.jurisdiction_id=t.id AND x.zip=z AND x.state=s)) ORDER BY CASE t.kind WHEN 'state' THEN 0 WHEN 'county' THEN 1 WHEN 'city' THEN 2 ELSE 3 END,t.name LOOP
  b:=base+CASE WHEN j.tax_shipping THEN greatest(coalesce(p_shipping,0),0) ELSE 0 END; a:=round(b*coalesce(j.rate,0)/100,2);
  IF a<>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('jurisdiction_id',j.id,'name',j.name,'kind',j.kind,'rate',j.rate,'taxable_amount',b,'amount',a,'type','sales_tax')); total:=total+a; END IF;
  a:=round(j.shipment_fee*greatest(coalesce(p_shipments,0),0),2);
  IF a<>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('jurisdiction_id',j.id,'name',j.name||' delivery fee','kind',j.kind,'rate',0,'taxable_amount',0,'amount',a,'type','shipment_fee')); total:=total+a; END IF;
 END LOOP;
 RETURN jsonb_build_object('tax_lines',lines,'tax_amount',total,'review_required',state_rule.rate IS NULL OR zip_rule.zip IS NULL OR NOT coalesce(zip_rule.reviewed,false));
END $$;
REVOKE ALL ON FUNCTION public.compute_jurisdiction_tax(uuid,jsonb,jsonb,numeric,integer) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.compute_jurisdiction_tax(uuid,jsonb,jsonb,numeric,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.quote_order_tax(p_company_id uuid,p_destination jsonb,p_items jsonb,p_shipping numeric DEFAULT 0,p_shipments integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_company_access(p_company_id) OR public.has_role(auth.uid(),'accounting') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>1000 OR p_shipping<0 OR p_shipments<0 THEN RAISE EXCEPTION 'Invalid tax input'; END IF;
 RETURN public.compute_jurisdiction_tax(p_company_id,p_destination,p_items,p_shipping,p_shipments); END $$;
REVOKE ALL ON FUNCTION public.quote_order_tax(uuid,jsonb,jsonb,numeric,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.quote_order_tax(uuid,jsonb,jsonb,numeric,integer) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.refresh_order_tax(p_order_id uuid,p_invoice boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company_id uuid; dest jsonb; addr_id text; items jsonb; shipping numeric; result jsonb; parent_id uuid;
BEGIN
 IF p_invoice THEN
  SELECT coalesce(customer_company_id,customer_id),tax_destination,shipping_cost,parent_customer_order_id INTO company_id,dest,shipping,parent_id FROM public.production_orders WHERE id=p_order_id;
  IF EXISTS(SELECT 1 FROM public.production_orders WHERE id=p_order_id AND (payment_received_at IS NOT NULL OR label_created_at IS NOT NULL OR picked_up_at IS NOT NULL)) THEN RETURN; END IF;
  IF dest IS NULL AND parent_id IS NOT NULL THEN SELECT tax_destination,shipping_address_id INTO dest,addr_id FROM public.customer_orders WHERE id=parent_id; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_type',i.item_type,'is_taxable',i.is_taxable AND i.item_type<>'labor' AND CASE WHEN i.inventory_item_id IS NOT NULL THEN coalesce(v.is_taxable,false) WHEN i.assembly_id IS NOT NULL THEN coalesce(a.taxable,false) ELSE i.is_taxable END,'amount',coalesce(i.total_price,i.quantity*i.unit_price))), '[]') INTO items FROM public.production_order_items i LEFT JOIN public.inventory_items v ON v.id=i.inventory_item_id LEFT JOIN public.assemblies a ON a.id=i.assembly_id WHERE production_order_id=p_order_id;
 ELSE
  SELECT customer_company_id,tax_destination,shipping_address_id,estimated_shipping INTO company_id,dest,addr_id,shipping FROM public.customer_orders WHERE id=p_order_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_type',i.item_type,'is_taxable',i.is_taxable AND i.item_type<>'labor' AND CASE WHEN i.inventory_item_id IS NOT NULL THEN coalesce(v.is_taxable,false) WHEN i.assembly_id IS NOT NULL THEN coalesce(a.taxable,false) ELSE false END,'amount',i.quantity_ordered*i.unit_price)), '[]') INTO items FROM public.customer_order_items i LEFT JOIN public.inventory_items v ON v.id=i.inventory_item_id LEFT JOIN public.assemblies a ON a.id=i.assembly_id WHERE customer_order_id=p_order_id;
 END IF;
 IF dest IS NULL AND company_id IS NOT NULL THEN
 SELECT x INTO dest FROM public.companies c CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.shipping_addresses)='array' THEN c.shipping_addresses ELSE '[]' END) x WHERE c.id=company_id AND x->>'id'=coalesce(addr_id,c.default_shipping_address_id) LIMIT 1;
 END IF;
 result:=public.compute_jurisdiction_tax(company_id,dest,items,shipping,CASE WHEN EXISTS(SELECT 1 FROM public.companies WHERE id=company_id AND preferred_shipping_carrier='Pick-Up') THEN 0 ELSE 1 END);
 IF p_invoice THEN UPDATE public.production_orders SET tax_destination=dest,tax_lines=result->'tax_lines',tax_amount=(result->>'tax_amount')::numeric,tax_review_required=(result->>'review_required')::boolean WHERE id=p_order_id;
 ELSE UPDATE public.customer_orders SET tax_destination=dest,tax_lines=result->'tax_lines',tax_amount=(result->>'tax_amount')::numeric,tax_review_required=(result->>'review_required')::boolean WHERE id=p_order_id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.refresh_order_tax(uuid,boolean) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.refresh_order_tax(uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.tax_items_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='customer_order_items' THEN PERFORM public.refresh_order_tax(CASE WHEN TG_OP='DELETE' THEN OLD.customer_order_id ELSE NEW.customer_order_id END,false); ELSE PERFORM public.refresh_order_tax(CASE WHEN TG_OP='DELETE' THEN OLD.production_order_id ELSE NEW.production_order_id END,true); END IF;
 RETURN NULL; END $$;
CREATE TRIGGER tax_customer_items_changed AFTER INSERT OR DELETE OR UPDATE OF unit_price,quantity_ordered,is_taxable,item_type,inventory_item_id,assembly_id ON public.customer_order_items FOR EACH ROW EXECUTE FUNCTION public.tax_items_changed();
CREATE TRIGGER tax_invoice_items_changed AFTER INSERT OR DELETE OR UPDATE OF unit_price,quantity,total_price,is_taxable,item_type,inventory_item_id,assembly_id ON public.production_order_items FOR EACH ROW EXECUTE FUNCTION public.tax_items_changed();
CREATE OR REPLACE FUNCTION public.tax_destination_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
 PERFORM public.refresh_order_tax(NEW.id,TG_TABLE_NAME='production_orders'); RETURN NULL; END $$;
CREATE TRIGGER tax_customer_destination_changed AFTER INSERT OR UPDATE OF customer_company_id,shipping_address_id,estimated_shipping,tax_destination ON public.customer_orders FOR EACH ROW EXECUTE FUNCTION public.tax_destination_changed();
CREATE TRIGGER tax_invoice_destination_changed AFTER INSERT OR UPDATE OF customer_company_id,customer_id,shipping_cost,tax_destination ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.tax_destination_changed();
CREATE OR REPLACE FUNCTION public.get_company_order_tax_summaries() RETURNS TABLE(order_id uuid,order_number text,order_kind text,tax_lines jsonb,tax_amount numeric,tax_review_required boolean,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT id,order_number,'order',tax_lines,tax_amount,tax_review_required,created_at FROM public.customer_orders WHERE auth.uid() IS NOT NULL AND (customer_company_id=public.get_current_user_company_id() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accounting') OR public.has_role(auth.uid(),'sales_support') OR public.has_role(auth.uid(),'production'))
 UNION ALL SELECT id,order_number,'invoice',tax_lines,tax_amount,tax_review_required,created_at FROM public.production_orders WHERE auth.uid() IS NOT NULL AND (coalesce(customer_company_id,customer_id)=public.get_current_user_company_id() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accounting') OR public.has_role(auth.uid(),'sales_support') OR public.has_role(auth.uid(),'production')); $$;
REVOKE ALL ON FUNCTION public.get_company_order_tax_summaries() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.get_company_order_tax_summaries() TO authenticated,service_role;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.sync_tax_zip_directory() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE response record; source text:='https://raw.githubusercontent.com/midwire/free_zipcode_data/master/all_us_zipcodes.csv'; rows jsonb; n integer; added integer; removed integer; previous integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('tax_zip_directory_sync'));
 SELECT * INTO response FROM extensions.http_get(source);
 IF response.status<>200 THEN RAISE EXCEPTION 'ZIP directory download failed (%)',response.status; END IF;
 SELECT jsonb_agg(jsonb_build_object('zip',m[1],'state',m[2])) INTO rows FROM (SELECT DISTINCT regexp_match(line,'^([0-9]{5}),.*?,([A-Z]{2}),') m FROM regexp_split_to_table(response.content,E'\n') line) t WHERE m IS NOT NULL;
 n:=jsonb_array_length(rows); IF coalesce(n,0)<30000 THEN RAISE EXCEPTION 'Incomplete ZIP directory; assignments unchanged'; END IF;
 SELECT count(*) INTO previous FROM public.tax_zip_directory WHERE present;
 SELECT count(*) INTO removed FROM public.tax_zip_directory d WHERE d.present AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(rows) AS x(zip text,state text) WHERE x.zip=d.zip AND x.state=d.state);
 IF previous>0 AND removed>previous*0.05 THEN RAISE EXCEPTION 'Unexpected directory reduction; review source before retrying'; END IF;
 INSERT INTO public.tax_zip_changes(zip,state,change_type) SELECT x.zip,x.state,'new' FROM jsonb_to_recordset(rows) AS x(zip text,state text) LEFT JOIN public.tax_zip_directory d USING(zip,state) WHERE d.zip IS NULL OR NOT d.present ON CONFLICT DO NOTHING; GET DIAGNOSTICS added=ROW_COUNT;
 INSERT INTO public.tax_zip_changes(zip,state,change_type) SELECT d.zip,d.state,'removed' FROM public.tax_zip_directory d WHERE d.present AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(rows) AS x(zip text,state text) WHERE x.zip=d.zip AND x.state=d.state) ON CONFLICT DO NOTHING;
 UPDATE public.tax_zip_directory d SET present=false WHERE d.present AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(rows) AS x(zip text,state text) WHERE x.zip=d.zip AND x.state=d.state);
 INSERT INTO public.tax_zip_directory(zip,state) SELECT x.zip,x.state FROM jsonb_to_recordset(rows) AS x(zip text,state text) ON CONFLICT(zip,state) DO UPDATE SET present=true,last_seen_at=now();
 INSERT INTO public.tax_zip_sync_runs(source_url,zip_count,new_count,removed_count) VALUES(source,n,added,removed);
 RETURN jsonb_build_object('zip_count',n,'new_count',added,'removed_count',removed);
END $$;
REVOKE ALL ON FUNCTION public.sync_tax_zip_directory() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.sync_tax_zip_directory() TO service_role;
REVOKE ALL ON FUNCTION public.tax_items_changed(),public.tax_destination_changed() FROM PUBLIC,anon,authenticated;
