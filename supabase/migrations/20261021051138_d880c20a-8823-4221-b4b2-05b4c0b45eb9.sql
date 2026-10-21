CREATE TABLE public.drop_ship_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  country text NOT NULL DEFAULT 'US',
  usps_eligible boolean NOT NULL DEFAULT false,
  signature_required boolean NOT NULL DEFAULT false,
  is_taxable boolean NOT NULL DEFAULT true,
  email text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drop_ship_addresses_owner_idx ON public.drop_ship_addresses(owner_company_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drop_ship_addresses TO authenticated;
GRANT ALL ON public.drop_ship_addresses TO service_role;
ALTER TABLE public.drop_ship_addresses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_drop_ship(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales_support')
    OR ((SELECT company_id FROM public.profiles WHERE id = auth.uid()) = _owner
        AND (public.has_role(auth.uid(),'distributor_admin') OR public.has_role(auth.uid(),'distributor_employee')));
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_drop_ship(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_drop_ship(uuid) TO authenticated, service_role;

CREATE POLICY "Drop-ship addresses readable by owner and sales" ON public.drop_ship_addresses FOR SELECT TO authenticated
  USING (public.can_manage_drop_ship(owner_company_id) OR public.has_role(auth.uid(),'production') OR public.has_role(auth.uid(),'accounting'));
CREATE POLICY "Drop-ship addresses created by owner and sales" ON public.drop_ship_addresses FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_drop_ship(owner_company_id));
CREATE POLICY "Drop-ship addresses updated by owner and sales" ON public.drop_ship_addresses FOR UPDATE TO authenticated
  USING (public.can_manage_drop_ship(owner_company_id)) WITH CHECK (public.can_manage_drop_ship(owner_company_id));
CREATE POLICY "Drop-ship addresses deleted by owner and sales" ON public.drop_ship_addresses FOR DELETE TO authenticated
  USING (public.can_manage_drop_ship(owner_company_id));

CREATE OR REPLACE FUNCTION public.validate_drop_ship_address() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = NEW.owner_company_id AND is_distributor) THEN
    RAISE EXCEPTION 'Drop-ship addresses can only be owned by a distributor';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_company_id <> OLD.owner_company_id THEN RAISE EXCEPTION 'Drop-ship owner cannot change'; END IF;
  IF upper(coalesce(NEW.country,'US')) <> 'US' THEN RAISE EXCEPTION 'Drop-ship addresses must be in the United States'; END IF;
  NEW.country := 'US';
  NEW.recipient_name := btrim(NEW.recipient_name);
  IF NEW.recipient_name = '' OR btrim(NEW.address) = '' OR btrim(NEW.city) = '' OR btrim(NEW.state) = '' OR btrim(NEW.zip) = '' THEN
    RAISE EXCEPTION 'Recipient name and full address are required';
  END IF;
  NEW.email := nullif(btrim(NEW.email),'');
  NEW.phone := nullif(btrim(NEW.phone),'');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER validate_drop_ship_address BEFORE INSERT OR UPDATE ON public.drop_ship_addresses FOR EACH ROW EXECUTE FUNCTION public.validate_drop_ship_address();

ALTER TABLE public.customer_orders
  ADD COLUMN drop_ship_address_id uuid REFERENCES public.drop_ship_addresses(id) ON DELETE SET NULL,
  ADD COLUMN drop_ship_snapshot jsonb;
ALTER TABLE public.production_orders ADD COLUMN drop_ship_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.apply_customer_order_drop_ship() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.drop_ship_addresses;
BEGIN
  IF NEW.drop_ship_address_id IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.drop_ship_address_id IS NOT NULL THEN NEW.drop_ship_snapshot := NULL; END IF;
  ELSIF TG_OP = 'INSERT' OR NEW.drop_ship_address_id IS DISTINCT FROM OLD.drop_ship_address_id OR NEW.drop_ship_snapshot IS NULL THEN
    SELECT * INTO d FROM public.drop_ship_addresses WHERE id = NEW.drop_ship_address_id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Drop-ship address not found'; END IF;
    IF d.owner_company_id IS DISTINCT FROM NEW.customer_company_id THEN RAISE EXCEPTION 'Drop-ship address belongs to a different distributor'; END IF;
    NEW.drop_ship_snapshot := jsonb_build_object('id',d.id,'drop_ship',true,'name',d.recipient_name,'recipient_name',d.recipient_name,'address',d.address,'city',d.city,'state',d.state,'zip',d.zip,'country',d.country,
      'usps_eligible',d.usps_eligible,'signature_required',d.signature_required,'is_taxable',d.is_taxable,'email',d.email,'phone',d.phone);
    NEW.shipping_address_id := NULL;
  END IF;
  IF NEW.drop_ship_snapshot IS NOT NULL THEN
    NEW.tax_destination := NEW.drop_ship_snapshot - 'email' - 'phone';
    IF NEW.carrier_preference = 'usps' AND NOT coalesce((NEW.drop_ship_snapshot->>'usps_eligible')::boolean,false) THEN
      RAISE EXCEPTION 'USPS is not allowed for this drop-ship address until it is flagged USPS eligible';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER apply_customer_order_drop_ship BEFORE INSERT OR UPDATE ON public.customer_orders FOR EACH ROW EXECUTE FUNCTION public.apply_customer_order_drop_ship();

CREATE OR REPLACE FUNCTION public.apply_invoice_drop_ship() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.drop_ship_snapshot IS NULL AND NEW.parent_customer_order_id IS NOT NULL THEN
    SELECT drop_ship_snapshot INTO NEW.drop_ship_snapshot FROM public.customer_orders WHERE id = NEW.parent_customer_order_id;
    IF NEW.drop_ship_snapshot IS NOT NULL AND NEW.tax_destination IS NULL THEN NEW.tax_destination := NEW.drop_ship_snapshot - 'email' - 'phone'; END IF;
  END IF;
  IF NEW.drop_ship_snapshot IS NOT NULL AND lower(coalesce(NEW.carrier,'')) = 'usps'
     AND NOT coalesce((NEW.drop_ship_snapshot->>'usps_eligible')::boolean,false) THEN
    RAISE EXCEPTION 'USPS is not allowed for this drop-ship address until it is flagged USPS eligible';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER apply_invoice_drop_ship BEFORE INSERT OR UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_drop_ship();

UPDATE public.production_orders p SET drop_ship_snapshot = c.drop_ship_snapshot FROM public.customer_orders c WHERE c.id = p.parent_customer_order_id AND c.drop_ship_snapshot IS NOT NULL AND p.drop_ship_snapshot IS NULL;

-- Direct-contact notifications for drop-ship recipients (not app users)
ALTER TABLE public.notification_outbox ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN recipient_email text, ADD COLUMN recipient_phone text;

CREATE OR REPLACE FUNCTION public.notify_drop_ship_shipment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb := NEW.drop_ship_snapshot; msg text;
BEGIN
  IF s IS NOT NULL AND NEW.label_created_at IS NOT NULL AND OLD.label_created_at IS NULL
     AND (nullif(s->>'email','') IS NOT NULL OR nullif(s->>'phone','') IS NOT NULL) THEN
    msg := 'Your order for ' || coalesce(s->>'recipient_name','your location') || ' has shipped'
      || CASE WHEN NEW.fedex_tracking_number IS NOT NULL THEN ' via ' || upper(coalesce(NEW.carrier,'carrier')) || '. Tracking: ' || NEW.fedex_tracking_number ELSE '.' END;
    INSERT INTO public.notification_outbox(user_id, kind, subject, html, sms, event_key, recipient_email, recipient_phone)
    VALUES (NULL, 'account', 'Your order has shipped',
      '<table role="presentation" width="100%"><tr><td>' || replace(replace(msg,'<','&lt;'),'>','&gt;') || '</td></tr></table>',
      left(msg,1600), 'drop-ship-shipped:' || NEW.id, nullif(s->>'email',''), nullif(s->>'phone',''))
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notify_drop_ship_shipment AFTER UPDATE OF label_created_at ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.notify_drop_ship_shipment();

REVOKE EXECUTE ON FUNCTION public.validate_drop_ship_address(), public.apply_customer_order_drop_ship(), public.apply_invoice_drop_ship(), public.notify_drop_ship_shipment() FROM PUBLIC, anon, authenticated;