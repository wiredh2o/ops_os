CREATE OR REPLACE FUNCTION public.compute_jurisdiction_tax(p_company_id uuid, p_destination jsonb, p_items jsonb, p_shipping numeric DEFAULT 0, p_shipments integer DEFAULT 1)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.companies; s text; z text; base numeric:=0; j record; a numeric; b numeric; lines jsonb:='[]'; total numeric:=0; state_rule public.tax_jurisdictions; zip_rule public.tax_zip_codes; zip_local boolean;
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
 -- State trumps ZIP: a non-taxable ZIP only removes local jurisdictions.
 zip_local := NOT FOUND OR zip_rule.is_taxable;
 FOR j IN SELECT * FROM public.tax_jurisdictions t WHERE t.active AND t.is_taxable AND t.state=s AND (t.id=state_rule.id OR (zip_local AND EXISTS(SELECT 1 FROM public.tax_zip_jurisdictions x WHERE x.jurisdiction_id=t.id AND x.zip=z AND x.state=s))) ORDER BY CASE t.kind WHEN 'state' THEN 0 WHEN 'county' THEN 1 WHEN 'city' THEN 2 ELSE 3 END,t.name LOOP
  b:=base+CASE WHEN j.tax_shipping THEN greatest(coalesce(p_shipping,0),0) ELSE 0 END; a:=round(b*coalesce(j.rate,0)/100,2);
  IF a<>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('jurisdiction_id',j.id,'name',j.name,'kind',j.kind,'rate',j.rate,'taxable_amount',b,'amount',a,'type','sales_tax')); total:=total+a; END IF;
  a:=round(j.shipment_fee*greatest(coalesce(p_shipments,0),0),2);
  IF a<>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('jurisdiction_id',j.id,'name',j.name||' delivery fee','kind',j.kind,'rate',0,'taxable_amount',0,'amount',a,'type','shipment_fee')); total:=total+a; END IF;
 END LOOP;
 RETURN jsonb_build_object('tax_lines',lines,'tax_amount',total,'review_required',state_rule.rate IS NULL OR zip_rule.zip IS NULL OR NOT coalesce(zip_rule.reviewed,false));
END $function$;