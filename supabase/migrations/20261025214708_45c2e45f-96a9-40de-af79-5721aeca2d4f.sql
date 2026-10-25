CREATE TABLE public.payment_terms (
  code text PRIMARY KEY,
  label text NOT NULL,
  net_days integer NOT NULL DEFAULT 0,
  deposit_percent numeric NOT NULL DEFAULT 0,
  uses_credit boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_terms TO authenticated;
GRANT INSERT, UPDATE ON public.payment_terms TO authenticated;
GRANT ALL ON public.payment_terms TO service_role;
ALTER TABLE public.payment_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payment terms readable by signed-in users" ON public.payment_terms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert payment terms" ON public.payment_terms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update payment terms" ON public.payment_terms FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_payment_terms_updated_at BEFORE UPDATE ON public.payment_terms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_payment_term() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.net_days < 0 THEN RAISE EXCEPTION 'Days to pay cannot be negative'; END IF;
  IF NEW.deposit_percent < 0 OR NEW.deposit_percent > 100 THEN RAISE EXCEPTION 'Deposit must be between 0 and 100 percent'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.code <> OLD.code THEN RAISE EXCEPTION 'A term code cannot be changed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_payment_term BEFORE INSERT OR UPDATE ON public.payment_terms FOR EACH ROW EXECUTE FUNCTION public.validate_payment_term();

INSERT INTO public.payment_terms (code, label, net_days, deposit_percent, uses_credit, sort_order) VALUES
 ('due_in_advance', 'Due in Advance', 0, 100, false, 1),
 ('fifty_fifty', '50% Down / 50% Before Ship', 0, 50, false, 2),
 ('net_15', 'Net 15', 15, 0, true, 3),
 ('net_30', 'Net 30', 30, 0, true, 4)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.customer_credit_limits (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  credit_limit numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_credit_limits TO authenticated;
GRANT ALL ON public.customer_credit_limits TO service_role;
ALTER TABLE public.customer_credit_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Credit limits visible to finance and sales staff" ON public.customer_credit_limits FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accounting') OR public.has_role(auth.uid(),'sales_support') OR public.has_role(auth.uid(),'marketing'));
CREATE TRIGGER update_customer_credit_limits_updated_at BEFORE UPDATE ON public.customer_credit_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.companies DROP COLUMN IF EXISTS credit_limit;

CREATE OR REPLACE FUNCTION public.can_manage_credit() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accounting')
$$;
CREATE OR REPLACE FUNCTION public.can_view_credit() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_credit() OR public.has_role(auth.uid(),'sales_support') OR public.has_role(auth.uid(),'marketing')
$$;

-- Only admin/accounting may change a customer's terms, and only to an active term.
CREATE OR REPLACE FUNCTION public.protect_company_payment_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.payment_terms IS NOT DISTINCT FROM OLD.payment_terms THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.payment_terms IS NOT DISTINCT FROM 'due_in_advance' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.can_manage_credit() THEN
    RAISE EXCEPTION 'Only admin or accounting can change payment terms';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_terms WHERE code = NEW.payment_terms AND active) THEN
    RAISE EXCEPTION 'Unknown or inactive payment term: %', NEW.payment_terms;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_company_payment_terms BEFORE INSERT OR UPDATE OF payment_terms ON public.companies FOR EACH ROW EXECUTE FUNCTION public.protect_company_payment_terms();

CREATE OR REPLACE FUNCTION public.set_customer_credit_terms(_company_id uuid, _credit_limit numeric, _payment_terms text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_credit() THEN RAISE EXCEPTION 'Only admin or accounting can set credit limits and terms'; END IF;
  IF _credit_limit IS NULL OR _credit_limit < 0 THEN RAISE EXCEPTION 'Credit limit must be $0.00 or more'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_terms WHERE code = _payment_terms AND active) THEN
    RAISE EXCEPTION 'Unknown or inactive payment term: %', _payment_terms;
  END IF;
  UPDATE public.companies SET payment_terms = _payment_terms WHERE id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
  INSERT INTO public.customer_credit_limits (company_id, credit_limit, updated_by) VALUES (_company_id, round(_credit_limit, 2), auth.uid())
  ON CONFLICT (company_id) DO UPDATE SET credit_limit = EXCLUDED.credit_limit, updated_by = EXCLUDED.updated_by;
END $$;
REVOKE ALL ON FUNCTION public.set_customer_credit_terms(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_credit_terms(uuid, numeric, text) TO authenticated;

INSERT INTO public.system_settings (setting_key, setting_value, description, is_active)
SELECT 'credit_accounting_basis', 'cash', 'Credit used: cash = unpaid invoices + open orders, accrual = unpaid invoices only', true
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE setting_key = 'credit_accounting_basis');

-- Credit used: unpaid customer invoices, plus (cash basis) the uninvoiced remainder of open orders.
CREATE OR REPLACE FUNCTION public.customer_credit_used(_company_id uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT sum(COALESCE(po.total_amount,0) + COALESCE(po.tax_amount,0) - COALESCE(po.credit_applied,0) - CASE WHEN po.deposit_paid THEN COALESCE(po.deposit_amount,0) ELSE 0 END)
      FROM public.production_orders po
      WHERE po.customer_company_id = _company_id AND po.order_type = 'customer' AND po.payment_received_at IS NULL), 0)
  + CASE WHEN COALESCE((SELECT setting_value FROM public.system_settings WHERE setting_key = 'credit_accounting_basis' LIMIT 1), 'cash') = 'cash' THEN
      COALESCE((SELECT sum(GREATEST(COALESCE(i.quantity_ordered,0) - COALESCE(i.quantity_invoiced,0), 0) * COALESCE(i.unit_price,0))
        FROM public.customer_order_items i JOIN public.customer_orders co ON co.id = i.customer_order_id
        WHERE co.customer_company_id = _company_id AND COALESCE(co.order_status,'pending') NOT IN ('fulfilled','cancelled')), 0)
    ELSE 0 END
$$;
REVOKE ALL ON FUNCTION public.customer_credit_used(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.customer_on_credit_hold(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT t.uses_credit FROM public.companies c JOIN public.payment_terms t ON t.code = c.payment_terms WHERE c.id = _company_id), false)
     AND public.customer_credit_used(_company_id) > COALESCE((SELECT credit_limit FROM public.customer_credit_limits WHERE company_id = _company_id), 0)
$$;
REVOKE ALL ON FUNCTION public.customer_on_credit_hold(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_on_credit_hold(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.production_order_credit_hold(_order_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT po.order_type = 'customer' AND po.customer_company_id IS NOT NULL AND public.customer_on_credit_hold(po.customer_company_id)
    FROM public.production_orders po WHERE po.id = _order_id), false)
$$;
REVOKE ALL ON FUNCTION public.production_order_credit_hold(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.production_order_credit_hold(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_customer_credit(_company_ids uuid[])
RETURNS TABLE(company_id uuid, payment_terms text, uses_credit boolean, credit_limit numeric, credit_used numeric, available_credit numeric, on_hold boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_credit() THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.payment_terms, COALESCE(t.uses_credit,false),
         COALESCE(l.credit_limit,0), u.used, COALESCE(l.credit_limit,0) - u.used,
         COALESCE(t.uses_credit,false) AND u.used > COALESCE(l.credit_limit,0)
  FROM public.companies c
  LEFT JOIN public.payment_terms t ON t.code = c.payment_terms
  LEFT JOIN public.customer_credit_limits l ON l.company_id = c.id
  CROSS JOIN LATERAL (SELECT round(public.customer_credit_used(c.id), 2) AS used) u
  WHERE c.id = ANY(_company_ids);
END $$;
REVOKE ALL ON FUNCTION public.get_customer_credit(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_credit(uuid[]) TO authenticated;

-- No label and no "shipped" while the customer is on credit hold.
CREATE OR REPLACE FUNCTION public.enforce_credit_hold_on_ship() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_type IS DISTINCT FROM 'customer' OR NEW.customer_company_id IS NULL THEN RETURN NEW; END IF;
  IF ((NEW.label_created_at IS NOT NULL AND OLD.label_created_at IS NULL)
      OR (NEW.status IN ('label_staged','shipped') AND NEW.status IS DISTINCT FROM OLD.status))
     AND public.customer_on_credit_hold(NEW.customer_company_id) THEN
    RAISE EXCEPTION 'Credit hold: this customer is over their credit limit, so the order cannot ship yet';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_credit_hold_on_ship BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_credit_hold_on_ship();