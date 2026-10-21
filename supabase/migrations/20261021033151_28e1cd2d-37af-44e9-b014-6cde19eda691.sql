CREATE OR REPLACE FUNCTION public.can_review_rma() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','sales_support','tech_support')); $$;
CREATE OR REPLACE FUNCTION public.can_receive_rma() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_review_rma() OR public.has_role(auth.uid(),'production'); $$;
CREATE OR REPLACE FUNCTION public.can_request_rma() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('car_wash_admin','car_wash_employee','distributor_admin','distributor_employee')); $$;
REVOKE ALL ON FUNCTION public.can_review_rma(),public.can_receive_rma(),public.can_request_rma() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_review_rma(),public.can_receive_rma(),public.can_request_rma() TO authenticated,service_role;
CREATE TABLE public.rma_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_id uuid NOT NULL, company_id uuid NOT NULL REFERENCES public.companies(id),
 rma_number text NOT NULL UNIQUE DEFAULT ('RMA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 status text NOT NULL DEFAULT 'requested', items jsonb NOT NULL, problem_reported text NOT NULL, return_shipping_address text, customer_po text,
 appointment_at timestamptz, appointment_url text, review_notes text, reviewed_by uuid, issued_at timestamptz,
 carrier text, tracking_number text, inbound_package_id uuid UNIQUE REFERENCES public.inbound_packages(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rma_requests TO authenticated;
GRANT ALL ON public.rma_requests TO service_role;
ALTER TABLE public.rma_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY rma_read ON public.rma_requests FOR SELECT TO authenticated USING (requester_id=auth.uid() OR public.can_receive_rma());
CREATE INDEX rma_requester_idx ON public.rma_requests(requester_id,created_at DESC);
CREATE INDEX rma_status_idx ON public.rma_requests(status);
ALTER TABLE public.inbound_packages ADD COLUMN rma_request_id uuid UNIQUE REFERENCES public.rma_requests(id);
CREATE OR REPLACE FUNCTION public.validate_rma_request() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status NOT IN ('requested','appointment_invited','issued','in_transit','received') THEN RAISE EXCEPTION 'Invalid RMA status'; END IF;
 IF jsonb_typeof(NEW.items) <> 'array' OR jsonb_array_length(NEW.items) < 1 OR jsonb_array_length(NEW.items)>100 THEN RAISE EXCEPTION 'Provide 1 to 100 items'; END IF;
 IF length(trim(NEW.problem_reported))<1 OR length(NEW.problem_reported)>10000 THEN RAISE EXCEPTION 'Problem description is required (maximum 10000 characters)'; END IF;
 IF NEW.carrier IS NOT NULL AND NEW.carrier NOT IN ('ups','fedex','other') THEN RAISE EXCEPTION 'Invalid tracking carrier'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER validate_rma BEFORE INSERT OR UPDATE ON public.rma_requests FOR EACH ROW EXECUTE FUNCTION public.validate_rma_request();
CREATE OR REPLACE FUNCTION public.submit_rma(p_items jsonb,p_problem text,p_return_address text DEFAULT NULL,p_customer_po text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; rid uuid; item jsonb; qty integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_request_rma() THEN RAISE EXCEPTION 'RMA request access denied'; END IF;
 SELECT company_id INTO cid FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF cid IS NULL THEN RAISE EXCEPTION 'An active company account is required'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Provide 1 to 100 items'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   qty=(item->>'quantity')::integer;
   IF coalesce(length(trim(item->>'item_name')),0) NOT BETWEEN 1 AND 255 OR qty IS NULL OR qty NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Each item needs a name and quantity from 1 to 1000'; END IF;
 END LOOP;
 INSERT INTO public.rma_requests(requester_id,company_id,items,problem_reported,return_shipping_address,customer_po) VALUES(auth.uid(),cid,p_items,trim(p_problem),nullif(trim(p_return_address),''),nullif(trim(p_customer_po),'')) RETURNING id INTO rid;
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.review_rma(p_id uuid,p_action text,p_notes text DEFAULT NULL,p_appointment_at timestamptz DEFAULT NULL,p_appointment_url text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rma_requests; pid uuid; cnt integer; summary text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_review_rma() THEN RAISE EXCEPTION 'RMA review access denied'; END IF;
 SELECT * INTO r FROM public.rma_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('requested','appointment_invited') THEN RAISE EXCEPTION 'Request is not awaiting review'; END IF;
 IF p_action='appointment' THEN
  IF p_appointment_at IS NULL OR p_appointment_at<=now() OR coalesce(p_appointment_url,'') !~ '^https://' THEN RAISE EXCEPTION 'Provide a future appointment and HTTPS meeting link'; END IF;
  UPDATE public.rma_requests SET status='appointment_invited',appointment_at=p_appointment_at,appointment_url=p_appointment_url,review_notes=p_notes,reviewed_by=auth.uid() WHERE id=p_id;
 ELSIF p_action='issue' THEN
  SELECT sum((value->>'quantity')::integer),string_agg((value->>'quantity') || ' x ' || (value->>'item_name') || coalesce(' | Serial: ' || nullif(value->>'serial_number',''),'') || coalesce(' | MAC: ' || nullif(value->>'mac_address',''),''),E'\n') INTO cnt,summary FROM jsonb_array_elements(r.items);
  INSERT INTO public.inbound_packages(company_id,tracking_number,status,initiated_via,initiated_by_user_id,intake_notes,return_shipping_address,item_count,category,customer_initiated,customer_po,rma_request_id)
   VALUES(r.company_id,r.rma_number,'in_transit','repair',r.requester_id,r.rma_number || E'\n' || r.problem_reported || E'\n' || summary,r.return_shipping_address,cnt,'repairs',true,r.customer_po,r.id) RETURNING id INTO pid;
  UPDATE public.rma_requests SET status='issued',issued_at=now(),reviewed_by=auth.uid(),review_notes=p_notes,inbound_package_id=pid WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Invalid review action'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.set_rma_tracking(p_id uuid,p_carrier text,p_tracking text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rma_requests;
BEGIN
 SELECT * INTO r FROM public.rma_requests WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR (r.requester_id<>auth.uid() AND NOT public.can_review_rma()) THEN RAISE EXCEPTION 'RMA access denied'; END IF;
 IF r.status NOT IN ('issued','in_transit') OR r.inbound_package_id IS NULL THEN RAISE EXCEPTION 'RMA must be issued and not yet received'; END IF;
 IF p_carrier NOT IN ('ups','fedex','other') OR length(trim(p_tracking)) NOT BETWEEN 5 AND 100 THEN RAISE EXCEPTION 'Provide valid tracking and carrier'; END IF;
 UPDATE public.inbound_packages SET tracking_number=upper(trim(p_tracking)) WHERE id=r.inbound_package_id;
 UPDATE public.rma_requests SET carrier=p_carrier,tracking_number=upper(trim(p_tracking)),status='in_transit' WHERE id=p_id;
END $$;
CREATE OR REPLACE FUNCTION public.receive_rma(p_id uuid,p_tracking text,p_received_at timestamptz,p_notes text,p_return_address text,p_tray text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rma_requests;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_receive_rma() THEN RAISE EXCEPTION 'RMA receipt access denied'; END IF;
 SELECT * INTO r FROM public.rma_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('issued','in_transit') OR r.inbound_package_id IS NULL THEN RAISE EXCEPTION 'RMA is not awaiting receipt'; END IF;
 IF p_received_at IS NULL OR length(trim(p_tracking))<5 THEN RAISE EXCEPTION 'Tracking and received date are required'; END IF;
 UPDATE public.inbound_packages SET tracking_number=upper(trim(p_tracking)),status='received',received_at=p_received_at,received_by=auth.uid(),intake_notes=p_notes,return_shipping_address=p_return_address,assigned_tray=nullif(trim(p_tray),'') WHERE id=r.inbound_package_id;
 UPDATE public.rma_requests SET status='received',tracking_number=upper(trim(p_tracking)) WHERE id=p_id;
 RETURN r.inbound_package_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_rma(jsonb,text,text,text),public.review_rma(uuid,text,text,timestamptz,text),public.set_rma_tracking(uuid,text,text),public.receive_rma(uuid,text,timestamptz,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_rma(jsonb,text,text,text),public.review_rma(uuid,text,text,timestamptz,text),public.set_rma_tracking(uuid,text,text),public.receive_rma(uuid,text,timestamptz,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.rma_package_access(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_receive_rma() OR EXISTS(SELECT 1 FROM public.rma_requests WHERE inbound_package_id=p_id AND requester_id=auth.uid()); $$;
REVOKE ALL ON FUNCTION public.rma_package_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rma_package_access(uuid) TO authenticated,service_role;
CREATE POLICY rma_package_read_guard ON public.inbound_packages AS RESTRICTIVE FOR SELECT TO authenticated USING(rma_request_id IS NULL OR public.rma_package_access(id));
CREATE POLICY rma_package_insert_guard ON public.inbound_packages AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(rma_request_id IS NULL OR public.can_receive_rma());
CREATE POLICY rma_package_update_guard ON public.inbound_packages AS RESTRICTIVE FOR UPDATE TO authenticated USING(rma_request_id IS NULL OR public.can_receive_rma()) WITH CHECK(rma_request_id IS NULL OR public.can_receive_rma());
CREATE POLICY rma_package_delete_guard ON public.inbound_packages AS RESTRICTIVE FOR DELETE TO authenticated USING(rma_request_id IS NULL OR public.can_receive_rma());
CREATE POLICY rma_staff_packages ON public.inbound_packages FOR ALL TO authenticated USING(public.can_receive_rma()) WITH CHECK(public.can_receive_rma());
CREATE POLICY external_repair_read_guard ON public.repair_items AS RESTRICTIVE FOR SELECT TO authenticated USING(NOT public.can_request_rma() OR public.can_receive_rma() OR public.rma_package_access(package_id));
CREATE POLICY external_repair_write_guard ON public.repair_items AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.can_request_rma() OR public.can_receive_rma()) WITH CHECK(NOT public.can_request_rma() OR public.can_receive_rma());
CREATE OR REPLACE FUNCTION public.get_my_rma_repairs(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; result jsonb;
BEGIN
 SELECT inbound_package_id INTO pid FROM public.rma_requests WHERE id=p_id AND (requester_id=auth.uid() OR public.can_receive_rma());
 IF pid IS NULL THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',ri.id,'item_name',ri.item_name,'serial_number',ri.serial_number,'mac_address',ri.mac_address,'status',ri.status,'problem_reported',ri.problem_reported,'completion_outcome',ri.completion_outcome,'updated_at',ri.updated_at)),'[]'::jsonb) INTO result FROM public.repair_items ri WHERE ri.package_id=pid OR EXISTS(SELECT 1 FROM public.inbound_package_items li WHERE li.package_id=pid AND li.repair_item_id=ri.id);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_my_rma_repairs(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_rma_repairs(uuid) TO authenticated;
-- Existing unrestricted search must not become an external cross-customer lookup.
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='search_repair_items';
 def=replace(def,'  WHERE' || E'\n' || '    ri.item_name','  WHERE public.can_receive_rma() AND (' || E'\n' || '    ri.item_name');
 def=replace(def,'  ORDER BY ri.updated_at DESC',')' || E'\n' || '  ORDER BY ri.updated_at DESC');
 EXECUTE def;
END $$;