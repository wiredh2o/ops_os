CREATE OR REPLACE FUNCTION public.submit_rma(p_items jsonb,p_problem text,p_return_address text DEFAULT NULL,p_customer_po text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; rid uuid; item jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_request_rma() THEN RAISE EXCEPTION 'RMA request access denied'; END IF;
 SELECT company_id INTO cid FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF cid IS NULL THEN RAISE EXCEPTION 'An active company account is required'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Provide 1 to 100 items'; END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Provide 1 to 100 items'; END IF;
 IF p_problem IS NULL OR length(trim(p_problem)) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Describe the reported problem'; END IF;
 IF length(coalesce(p_return_address,''))>2000 OR length(coalesce(p_customer_po,''))>255 THEN RAISE EXCEPTION 'Address or PO is too long'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item) <> 'object' OR jsonb_typeof(item->'item_name') IS DISTINCT FROM 'string' OR coalesce(length(trim(item->>'item_name')),0) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Each item needs a name'; END IF;
  IF jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number' OR (item->>'quantity') !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION 'Item quantity must be an integer from 1 to 1000'; END IF;
  IF (item->>'quantity')::integer NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Item quantity must be from 1 to 1000'; END IF;
  IF (item ? 'serial_number' AND (jsonb_typeof(item->'serial_number') IS DISTINCT FROM 'string' OR length(item->>'serial_number')>255)) OR (item ? 'mac_address' AND (jsonb_typeof(item->'mac_address') IS DISTINCT FROM 'string' OR length(item->>'mac_address')>255)) THEN RAISE EXCEPTION 'Serial and MAC fields must be text up to 255 characters'; END IF;
 END LOOP;
 INSERT INTO public.rma_requests(requester_id,company_id,items,problem_reported,return_shipping_address,customer_po) VALUES(auth.uid(),cid,p_items,trim(p_problem),nullif(trim(p_return_address),''),nullif(trim(p_customer_po),'')) RETURNING id INTO rid;
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION public.get_my_rma_repairs(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to view RMA repairs'; END IF;
 SELECT inbound_package_id INTO pid FROM public.rma_requests WHERE id=p_id AND (requester_id=auth.uid() OR public.can_receive_rma());
 IF pid IS NULL THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',ri.id,'item_name',ri.item_name,'serial_number',ri.serial_number,'mac_address',ri.mac_address,'status',ri.status,'problem_reported',ri.problem_reported,'completion_outcome',ri.completion_outcome,'updated_at',ri.updated_at)),'[]'::jsonb) INTO result FROM public.repair_items ri WHERE ri.package_id=pid;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.set_rma_tracking(p_id uuid,p_carrier text,p_tracking text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.rma_requests;
BEGIN
 SELECT * INTO r FROM public.rma_requests WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR (r.requester_id<>auth.uid() AND NOT public.can_review_rma()) THEN RAISE EXCEPTION 'RMA access denied'; END IF;
 IF r.status NOT IN ('issued','in_transit') OR r.inbound_package_id IS NULL THEN RAISE EXCEPTION 'RMA must be issued and not yet received'; END IF;
 IF p_carrier IS NULL OR p_carrier NOT IN ('ups','fedex','other') OR p_tracking IS NULL OR length(trim(p_tracking)) NOT BETWEEN 5 AND 100 OR upper(trim(p_tracking))=r.rma_number THEN RAISE EXCEPTION 'Provide valid tracking and carrier'; END IF;
 UPDATE public.inbound_packages SET tracking_number=upper(trim(p_tracking)) WHERE id=r.inbound_package_id;
 UPDATE public.rma_requests SET carrier=p_carrier,tracking_number=upper(trim(p_tracking)),status='in_transit' WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_rma(jsonb,text,text,text),public.get_my_rma_repairs(uuid),public.set_rma_tracking(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_rma(jsonb,text,text,text),public.get_my_rma_repairs(uuid),public.set_rma_tracking(uuid,text,text) TO authenticated;