
CREATE TABLE public.po_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  package_id uuid REFERENCES public.inbound_packages(id) ON DELETE SET NULL,
  received_at date NOT NULL DEFAULT current_date,
  notes text,
  is_billed boolean NOT NULL DEFAULT false,
  bill_number text,
  bill_date date,
  due_date date,
  bill_subtotal numeric(12,2),
  bill_tax numeric(12,2),
  bill_shipping numeric(12,2),
  bill_total numeric(12,2),
  bill_amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  bill_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  billed_at timestamptz,
  billed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.po_receipts TO authenticated;
GRANT ALL ON public.po_receipts TO service_role;
ALTER TABLE public.po_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PO receipts viewable by purchasing staff" ON public.po_receipts FOR SELECT TO authenticated
USING (public.is_admin_or_owner() OR public.has_role(auth.uid(),'production') OR public.has_role(auth.uid(),'accounting'));
CREATE INDEX po_receipts_po_idx ON public.po_receipts(purchase_order_id);

CREATE TABLE public.po_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.po_receipts(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  inventory_item_id uuid,
  assembly_id uuid,
  quantity_received integer NOT NULL CHECK (quantity_received >= 0),
  quantity_ordered integer NOT NULL DEFAULT 0,
  quantity_previously_received integer NOT NULL DEFAULT 0,
  quantity_short_closed integer NOT NULL DEFAULT 0,
  variance text NOT NULL DEFAULT 'exact' CHECK (variance IN ('exact','over','under')),
  unit_cost numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.po_receipt_lines TO authenticated;
GRANT ALL ON public.po_receipt_lines TO service_role;
ALTER TABLE public.po_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PO receipt lines viewable by purchasing staff" ON public.po_receipt_lines FOR SELECT TO authenticated
USING (public.is_admin_or_owner() OR public.has_role(auth.uid(),'production') OR public.has_role(auth.uid(),'accounting'));
CREATE INDEX po_receipt_lines_receipt_idx ON public.po_receipt_lines(receipt_id);

CREATE TABLE public.vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  receipt_id uuid REFERENCES public.po_receipts(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT current_date,
  method text NOT NULL CHECK (method IN ('check','ach','card','cash','other')),
  account_id uuid REFERENCES public.accounts(id),
  reference text,
  is_advance boolean NOT NULL DEFAULT false,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendor_payments TO authenticated;
GRANT ALL ON public.vendor_payments TO service_role;
ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendor payments viewable by accounting" ON public.vendor_payments FOR SELECT TO authenticated
USING (public.is_admin_or_owner() OR public.has_role(auth.uid(),'accounting'));
CREATE INDEX vendor_payments_po_idx ON public.vendor_payments(purchase_order_id);

CREATE TRIGGER po_receipts_updated_at BEFORE UPDATE ON public.po_receipts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Receipt links on manual receipts
ALTER TABLE public.inbound_packages
  ADD COLUMN linked_purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD CONSTRAINT inbound_packages_single_link CHECK (linked_purchase_order_id IS NULL OR linked_transaction_id IS NULL);

CREATE OR REPLACE FUNCTION public.validate_inbound_package_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.linked_transaction_id IS NOT NULL
     AND NEW.linked_transaction_id IS DISTINCT FROM COALESCE(OLD.linked_transaction_id, NULL) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.transaction_lines tl JOIN public.accounts a ON a.id = tl.account_id
      WHERE tl.transaction_id = NEW.linked_transaction_id AND a.account_subtype = 'credit_card'
    ) THEN
      RAISE EXCEPTION 'Linked transaction must be a credit-card transaction';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbound_packages_validate_link BEFORE INSERT OR UPDATE OF linked_transaction_id ON public.inbound_packages
FOR EACH ROW EXECUTE FUNCTION public.validate_inbound_package_link();

-- Helpers
CREATE OR REPLACE FUNCTION public.can_manage_vendor_bills()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (public.is_admin_or_owner() OR public.has_role(auth.uid(),'accounting'));
$$;

CREATE OR REPLACE FUNCTION public.refresh_bill_paid(p_receipt_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.po_receipts r
  SET bill_amount_paid = COALESCE((SELECT sum(amount) FROM public.vendor_payments WHERE receipt_id = r.id),0)
  WHERE r.id = p_receipt_id;
$$;

-- Record an item receipt against a PO
CREATE OR REPLACE FUNCTION public.record_po_receipt(
  p_po_id uuid, p_lines jsonb, p_received_at date DEFAULT current_date,
  p_package_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_receipt uuid;
  v_line jsonb;
  v_poi public.purchase_order_items%ROWTYPE;
  v_qty integer;
  v_new integer;
  v_short integer;
  v_any boolean := false;
  v_open boolean;
BEGIN
  IF NOT (auth.uid() IS NOT NULL AND (public.is_admin_or_owner() OR public.has_role(auth.uid(),'production') OR public.has_role(auth.uid(),'accounting'))) THEN
    RAISE EXCEPTION 'Not allowed to receive purchase orders';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status IN ('draft','cancelled') THEN RAISE EXCEPTION 'A % purchase order cannot be received', v_po.status; END IF;

  INSERT INTO public.po_receipts(company_id, purchase_order_id, package_id, received_at, notes, created_by)
  VALUES (v_po.company_id, p_po_id, p_package_id, COALESCE(p_received_at, current_date), p_notes, auth.uid())
  RETURNING id INTO v_receipt;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    v_qty := COALESCE((v_line->>'quantity')::integer, 0);
    IF v_qty < 0 THEN RAISE EXCEPTION 'Quantity cannot be negative'; END IF;
    SELECT * INTO v_poi FROM public.purchase_order_items
    WHERE purchase_order_id = p_po_id
      AND ((v_line->>'inventory_item_id') IS NOT NULL AND inventory_item_id = (v_line->>'inventory_item_id')::uuid
        OR (v_line->>'assembly_id') IS NOT NULL AND assembly_id = (v_line->>'assembly_id')::uuid)
    ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item is not on this purchase order'; END IF;
    v_short := 0;
    v_new := COALESCE(v_poi.quantity_received,0) + v_qty;
    IF COALESCE((v_line->>'short_close')::boolean,false) AND v_new < v_poi.quantity THEN
      v_short := v_poi.quantity - v_new;
    END IF;
    IF v_qty = 0 AND v_short = 0 THEN CONTINUE; END IF;
    v_any := true;
    INSERT INTO public.po_receipt_lines(receipt_id, item_type, inventory_item_id, assembly_id, quantity_received,
      quantity_ordered, quantity_previously_received, quantity_short_closed, variance, unit_cost)
    VALUES (v_receipt, v_poi.item_type, v_poi.inventory_item_id, v_poi.assembly_id, v_qty, v_poi.quantity,
      COALESCE(v_poi.quantity_received,0), v_short,
      CASE WHEN v_new > v_poi.quantity THEN 'over' WHEN v_new < v_poi.quantity THEN 'under' ELSE 'exact' END,
      COALESCE(v_poi.unit_cost,0));
    IF v_qty > 0 THEN
      UPDATE public.purchase_order_items
      SET quantity_received = v_new, actual_received_date = COALESCE(p_received_at, current_date)
      WHERE id = v_poi.id;
    END IF;
  END LOOP;
  IF NOT v_any THEN RAISE EXCEPTION 'Enter at least one received quantity'; END IF;

  -- Open if any line still has pieces neither received nor short-closed
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND COALESCE(poi.quantity_received,0) + COALESCE((
        SELECT sum(l.quantity_short_closed) FROM public.po_receipt_lines l JOIN public.po_receipts r ON r.id = l.receipt_id
        WHERE r.purchase_order_id = p_po_id
          AND (l.inventory_item_id IS NOT DISTINCT FROM poi.inventory_item_id AND l.assembly_id IS NOT DISTINCT FROM poi.assembly_id)),0) < poi.quantity
  ) INTO v_open;
  UPDATE public.purchase_orders
  SET status = CASE WHEN v_open THEN 'partial' ELSE 'closed' END,
      actual_delivery_date = CASE WHEN v_open THEN actual_delivery_date ELSE COALESCE(p_received_at, current_date) END
  WHERE id = p_po_id;
  RETURN v_receipt;
END $$;

-- Find a GL account for a company by subtype
CREATE OR REPLACE FUNCTION public.find_account(p_company uuid, p_subtype public.account_subtype)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.accounts WHERE account_subtype = p_subtype AND is_active
  ORDER BY (company_id IS NOT DISTINCT FROM p_company) DESC, created_at LIMIT 1;
$$;

-- Apply unassigned advances to open bills, earliest bill first
CREATE OR REPLACE FUNCTION public.apply_po_advances(p_po_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay record; v_bill record; v_bal numeric;
BEGIN
  FOR v_pay IN SELECT * FROM public.vendor_payments WHERE purchase_order_id = p_po_id AND receipt_id IS NULL
               ORDER BY paid_at, created_at FOR UPDATE LOOP
    SELECT r.id, r.bill_total - COALESCE((SELECT sum(amount) FROM public.vendor_payments WHERE receipt_id = r.id),0) AS bal
      INTO v_bill
    FROM public.po_receipts r
    WHERE r.purchase_order_id = p_po_id AND r.is_billed
      AND r.bill_total - COALESCE((SELECT sum(amount) FROM public.vendor_payments WHERE receipt_id = r.id),0) > 0.004
    ORDER BY r.bill_date, r.received_at, r.created_at LIMIT 1;
    EXIT WHEN NOT FOUND;
    v_bal := v_bill.bal;
    IF v_pay.amount <= v_bal + 0.004 THEN
      UPDATE public.vendor_payments SET receipt_id = v_bill.id WHERE id = v_pay.id;
    ELSE
      UPDATE public.vendor_payments SET receipt_id = v_bill.id, amount = v_bal WHERE id = v_pay.id;
      INSERT INTO public.vendor_payments(company_id, purchase_order_id, amount, paid_at, method, account_id, reference, is_advance, transaction_id, created_by)
      VALUES (v_pay.company_id, p_po_id, v_pay.amount - v_bal, v_pay.paid_at, v_pay.method, v_pay.account_id, v_pay.reference, v_pay.is_advance, v_pay.transaction_id, v_pay.created_by);
    END IF;
    PERFORM public.refresh_bill_paid(v_bill.id);
  END LOOP;
END $$;

-- Turn a receipt into a bill (the "Bill received" switch)
CREATE OR REPLACE FUNCTION public.convert_receipt_to_bill(
  p_receipt_id uuid, p_bill_number text, p_bill_date date, p_due_date date DEFAULT NULL,
  p_subtotal numeric DEFAULT NULL, p_tax numeric DEFAULT 0, p_shipping numeric DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.po_receipts%ROWTYPE; v_sub numeric; v_total numeric; v_tx uuid; v_inv uuid; v_ap uuid;
BEGIN
  IF NOT public.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can enter bills'; END IF;
  SELECT * INTO v_r FROM public.po_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_r.is_billed THEN RAISE EXCEPTION 'This receipt is already billed'; END IF;
  IF COALESCE(trim(p_bill_number),'') = '' THEN RAISE EXCEPTION 'Vendor invoice number is required'; END IF;
  IF COALESCE(p_tax,0) < 0 OR COALESCE(p_shipping,0) < 0 OR COALESCE(p_subtotal,0) < 0 THEN RAISE EXCEPTION 'Amounts cannot be negative'; END IF;
  SELECT round(COALESCE(sum(quantity_received * unit_cost),0),2) INTO v_sub FROM public.po_receipt_lines WHERE receipt_id = p_receipt_id;
  v_sub := round(COALESCE(p_subtotal, v_sub),2);
  v_total := v_sub + round(COALESCE(p_tax,0),2) + round(COALESCE(p_shipping,0),2);

  INSERT INTO public.transactions(transaction_date, reference_number, description, total_amount, transaction_type, reference_id, created_by, company_id)
  VALUES (COALESCE(p_bill_date,current_date), p_bill_number, 'Vendor bill for PO receipt', v_total, 'vendor_bill', p_receipt_id, auth.uid(), v_r.company_id)
  RETURNING id INTO v_tx;
  v_inv := public.find_account(v_r.company_id, 'inventory');
  v_ap := public.find_account(v_r.company_id, 'accounts_payable');
  IF v_inv IS NOT NULL AND v_ap IS NOT NULL THEN
    INSERT INTO public.transaction_lines(transaction_id, account_id, description, debit_amount, credit_amount) VALUES
      (v_tx, v_inv, 'Received inventory', v_total, 0),
      (v_tx, v_ap, 'Vendor bill ' || p_bill_number, 0, v_total);
  END IF;

  UPDATE public.po_receipts SET is_billed = true, bill_number = trim(p_bill_number), bill_date = COALESCE(p_bill_date,current_date),
    due_date = p_due_date, bill_subtotal = v_sub, bill_tax = round(COALESCE(p_tax,0),2), bill_shipping = round(COALESCE(p_shipping,0),2),
    bill_total = v_total, bill_transaction_id = v_tx, billed_at = now(), billed_by = auth.uid()
  WHERE id = p_receipt_id;
  PERFORM public.apply_po_advances(v_r.purchase_order_id);
  RETURN v_tx;
END $$;

-- Turn the switch back off (only when no regular payment was made against the bill)
CREATE OR REPLACE FUNCTION public.unbill_receipt(p_receipt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.po_receipts%ROWTYPE;
BEGIN
  IF NOT public.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can change bills'; END IF;
  SELECT * INTO v_r FROM public.po_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND OR NOT v_r.is_billed THEN RAISE EXCEPTION 'Receipt is not billed'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendor_payments WHERE receipt_id = p_receipt_id AND NOT is_advance) THEN
    RAISE EXCEPTION 'Payments were made against this bill; it cannot be un-billed';
  END IF;
  UPDATE public.vendor_payments SET receipt_id = NULL WHERE receipt_id = p_receipt_id;
  IF v_r.bill_transaction_id IS NOT NULL THEN
    DELETE FROM public.transaction_lines WHERE transaction_id = v_r.bill_transaction_id;
    DELETE FROM public.transactions WHERE id = v_r.bill_transaction_id;
  END IF;
  UPDATE public.po_receipts SET is_billed = false, bill_number = NULL, bill_date = NULL, due_date = NULL, bill_subtotal = NULL,
    bill_tax = NULL, bill_shipping = NULL, bill_total = NULL, bill_amount_paid = 0, bill_transaction_id = NULL, billed_at = NULL, billed_by = NULL
  WHERE id = p_receipt_id;
  PERFORM public.apply_po_advances(v_r.purchase_order_id);
END $$;

-- Record an advance or partial payment
CREATE OR REPLACE FUNCTION public.record_vendor_payment(
  p_po_id uuid, p_amount numeric, p_paid_at date, p_method text, p_account_id uuid,
  p_reference text DEFAULT NULL, p_receipt_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_po public.purchase_orders%ROWTYPE; v_limit numeric; v_paid numeric; v_amt numeric; v_tx uuid; v_ap uuid;
  v_sub public.account_subtype; v_bill public.po_receipts%ROWTYPE; v_any_open boolean;
BEGIN
  IF NOT public.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can record payments'; END IF;
  v_amt := round(COALESCE(p_amount,0),2);
  IF v_amt <= 0 THEN RAISE EXCEPTION 'Payment must be more than zero'; END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  SELECT account_subtype INTO v_sub FROM public.accounts WHERE id = p_account_id AND is_active;
  IF v_sub IS NULL OR v_sub NOT IN ('checking','credit_card') THEN RAISE EXCEPTION 'Pick an active bank or credit-card account'; END IF;

  SELECT GREATEST(COALESCE(v_po.total_amount,0), COALESCE((SELECT sum(bill_total) FROM public.po_receipts WHERE purchase_order_id = p_po_id AND is_billed),0))
    INTO v_limit;
  SELECT COALESCE(sum(amount),0) INTO v_paid FROM public.vendor_payments WHERE purchase_order_id = p_po_id;
  IF v_amt > v_limit - v_paid + 0.004 THEN
    RAISE EXCEPTION 'Payment is more than the % still owed on this PO', to_char(GREATEST(v_limit - v_paid,0),'FM999999990.00');
  END IF;
  IF p_receipt_id IS NOT NULL THEN
    SELECT * INTO v_bill FROM public.po_receipts WHERE id = p_receipt_id AND purchase_order_id = p_po_id AND is_billed;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found on this PO'; END IF;
    IF v_amt > v_bill.bill_total - v_bill.bill_amount_paid + 0.004 THEN RAISE EXCEPTION 'Payment is more than the bill balance'; END IF;
  END IF;

  INSERT INTO public.transactions(transaction_date, reference_number, description, total_amount, transaction_type, reference_id, created_by, company_id)
  VALUES (COALESCE(p_paid_at,current_date), p_reference, 'Vendor payment for PO ' || v_po.purchase_order_number, v_amt, 'vendor_payment', p_po_id, auth.uid(), v_po.company_id)
  RETURNING id INTO v_tx;
  v_ap := public.find_account(v_po.company_id, 'accounts_payable');
  IF v_ap IS NOT NULL THEN
    INSERT INTO public.transaction_lines(transaction_id, account_id, description, debit_amount, credit_amount) VALUES
      (v_tx, v_ap, 'Vendor payment', v_amt, 0),
      (v_tx, p_account_id, 'Vendor payment', 0, v_amt);
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.po_receipts WHERE purchase_order_id = p_po_id AND is_billed AND bill_total - bill_amount_paid > 0.004) INTO v_any_open;
  INSERT INTO public.vendor_payments(company_id, purchase_order_id, receipt_id, amount, paid_at, method, account_id, reference, is_advance, transaction_id, created_by)
  VALUES (v_po.company_id, p_po_id, p_receipt_id, v_amt, COALESCE(p_paid_at,current_date), p_method, p_account_id, p_reference,
          p_receipt_id IS NULL AND NOT v_any_open, v_tx, auth.uid());
  IF p_receipt_id IS NOT NULL THEN PERFORM public.refresh_bill_paid(p_receipt_id); END IF;
  PERFORM public.apply_po_advances(p_po_id);
  RETURN v_tx;
END $$;

-- Search credit-card transactions for receipt linking
CREATE OR REPLACE FUNCTION public.search_card_transactions(p_search text DEFAULT NULL)
RETURNS TABLE(id uuid, transaction_date date, description text, reference_number text, total_amount numeric, account_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DISTINCT ON (t.id) t.id, t.transaction_date, t.description, t.reference_number, t.total_amount, a.name
  FROM public.transactions t
  JOIN public.transaction_lines tl ON tl.transaction_id = t.id
  JOIN public.accounts a ON a.id = tl.account_id AND a.account_subtype = 'credit_card'
  WHERE p_search IS NULL OR p_search = ''
     OR t.description ILIKE '%' || p_search || '%' OR t.reference_number ILIKE '%' || p_search || '%'
     OR t.total_amount::text LIKE p_search || '%'
  ORDER BY t.id, t.transaction_date DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.record_po_receipt(uuid, jsonb, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_receipt_to_bill(uuid, text, date, date, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unbill_receipt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_vendor_payment(uuid, numeric, date, text, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_card_transactions(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_po_advances(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_bill_paid(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_account(uuid, public.account_subtype) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_inbound_package_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_vendor_bills() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_po_receipt(uuid, jsonb, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_receipt_to_bill(uuid, text, date, date, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unbill_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment(uuid, numeric, date, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_card_transactions(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_vendor_bills() TO authenticated;
