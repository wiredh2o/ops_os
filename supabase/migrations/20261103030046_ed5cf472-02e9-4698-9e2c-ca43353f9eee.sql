
CREATE OR REPLACE FUNCTION public.apply_po_advances(p_po_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay record; v_bill record;
BEGIN
  LOOP
    SELECT * INTO v_pay FROM public.vendor_payments WHERE purchase_order_id = p_po_id AND receipt_id IS NULL
      ORDER BY paid_at, created_at, id LIMIT 1 FOR UPDATE;
    EXIT WHEN NOT FOUND;
    SELECT r.id, r.bill_total - COALESCE((SELECT sum(amount) FROM public.vendor_payments WHERE receipt_id = r.id),0) AS bal
      INTO v_bill
    FROM public.po_receipts r
    WHERE r.purchase_order_id = p_po_id AND r.is_billed
      AND r.bill_total - COALESCE((SELECT sum(amount) FROM public.vendor_payments WHERE receipt_id = r.id),0) > 0.004
    ORDER BY r.bill_date, r.received_at, r.created_at LIMIT 1;
    EXIT WHEN NOT FOUND;
    IF v_pay.amount <= v_bill.bal + 0.004 THEN
      UPDATE public.vendor_payments SET receipt_id = v_bill.id WHERE id = v_pay.id;
    ELSE
      UPDATE public.vendor_payments SET receipt_id = v_bill.id, amount = v_bill.bal WHERE id = v_pay.id;
      INSERT INTO public.vendor_payments(company_id, purchase_order_id, amount, paid_at, method, account_id, reference, is_advance, transaction_id, created_by, created_at, check_number, payee_name, memo)
      VALUES (v_pay.company_id, p_po_id, v_pay.amount - v_bill.bal, v_pay.paid_at, v_pay.method, v_pay.account_id, v_pay.reference, v_pay.is_advance, v_pay.transaction_id, v_pay.created_by, v_pay.created_at, v_pay.check_number, v_pay.payee_name, v_pay.memo);
    END IF;
    PERFORM public.refresh_bill_paid(v_bill.id);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.apply_po_advances(uuid) FROM PUBLIC, anon, authenticated;
