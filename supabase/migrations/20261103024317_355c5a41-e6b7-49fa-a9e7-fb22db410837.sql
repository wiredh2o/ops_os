
ALTER TABLE public.accounts
  ADD COLUMN bank_name text,
  ADD COLUMN bank_address text,
  ADD COLUMN routing_number text,
  ADD COLUMN check_account_number text,
  ADD COLUMN next_check_number integer NOT NULL DEFAULT 1001,
  ADD COLUMN check_company_name text,
  ADD COLUMN check_company_address text,
  ADD COLUMN check_logo_url text,
  ADD COLUMN print_offset_x numeric(5,3) NOT NULL DEFAULT 0,
  ADD COLUMN print_offset_y numeric(5,3) NOT NULL DEFAULT 0,
  ADD CONSTRAINT accounts_routing_format CHECK (routing_number IS NULL OR routing_number ~ '^[0-9]{9}$'),
  ADD CONSTRAINT accounts_check_account_format CHECK (check_account_number IS NULL OR check_account_number ~ '^[0-9-]{4,17}$'),
  ADD CONSTRAINT accounts_next_check_positive CHECK (next_check_number > 0);

ALTER TABLE public.vendor_payments
  ADD COLUMN check_number integer,
  ADD COLUMN payee_name text,
  ADD COLUMN memo text;
CREATE INDEX vendor_payments_check_idx ON public.vendor_payments(account_id, check_number) WHERE check_number IS NOT NULL;

CREATE OR REPLACE FUNCTION private.issue_vendor_check(
  p_account_id uuid, p_po_id uuid, p_amount numeric, p_check_date date,
  p_memo text DEFAULT NULL, p_receipt_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acc public.accounts%ROWTYPE; v_no integer; v_tx uuid; v_payee text;
BEGIN
  IF NOT private.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can issue checks'; END IF;
  SELECT * INTO v_acc FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR v_acc.account_subtype <> 'checking' OR NOT v_acc.is_active THEN RAISE EXCEPTION 'Pick an active checking account'; END IF;
  IF v_acc.routing_number IS NULL OR v_acc.check_account_number IS NULL THEN
    RAISE EXCEPTION 'Add the routing and account numbers for % in Settings first', v_acc.name;
  END IF;
  v_no := v_acc.next_check_number;
  SELECT s.name INTO v_payee FROM public.purchase_orders po JOIN public.suppliers s ON s.id = po.supplier_id WHERE po.id = p_po_id;
  v_tx := private.record_vendor_payment(p_po_id, p_amount, p_check_date, 'check', p_account_id, 'Check #' || v_no, p_receipt_id);
  UPDATE public.vendor_payments SET check_number = v_no, payee_name = v_payee, memo = p_memo WHERE transaction_id = v_tx;
  UPDATE public.transactions SET reference_number = 'Check #' || v_no WHERE id = v_tx;
  UPDATE public.accounts SET next_check_number = v_no + 1 WHERE id = p_account_id;
  RETURN jsonb_build_object('transaction_id', v_tx, 'check_number', v_no);
END $$;

CREATE OR REPLACE FUNCTION private.void_vendor_check(p_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r uuid; v_no integer; v_po uuid;
BEGIN
  IF NOT private.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can void checks'; END IF;
  SELECT check_number, purchase_order_id INTO v_no, v_po FROM public.vendor_payments WHERE transaction_id = p_transaction_id AND check_number IS NOT NULL LIMIT 1;
  IF v_no IS NULL THEN RAISE EXCEPTION 'Check not found'; END IF;
  FOR v_r IN SELECT DISTINCT receipt_id FROM public.vendor_payments WHERE transaction_id = p_transaction_id AND receipt_id IS NOT NULL LOOP
    NULL;
  END LOOP;
  CREATE TEMP TABLE IF NOT EXISTS _void_bills(id uuid) ON COMMIT DROP;
  INSERT INTO _void_bills SELECT DISTINCT receipt_id FROM public.vendor_payments WHERE transaction_id = p_transaction_id AND receipt_id IS NOT NULL;
  DELETE FROM public.vendor_payments WHERE transaction_id = p_transaction_id;
  DELETE FROM public.transaction_lines WHERE transaction_id = p_transaction_id;
  UPDATE public.transactions SET total_amount = 0, description = 'VOID check #' || v_no || ' — ' || COALESCE(description,'') WHERE id = p_transaction_id;
  PERFORM public.refresh_bill_paid(id) FROM _void_bills;
  DELETE FROM _void_bills;
END $$;

CREATE OR REPLACE FUNCTION public.issue_vendor_check(p_account_id uuid, p_po_id uuid, p_amount numeric, p_check_date date, p_memo text DEFAULT NULL, p_receipt_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.issue_vendor_check(p_account_id, p_po_id, p_amount, p_check_date, p_memo, p_receipt_id) $$;
CREATE OR REPLACE FUNCTION public.void_vendor_check(p_transaction_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.void_vendor_check(p_transaction_id) $$;

REVOKE ALL ON FUNCTION private.issue_vendor_check(uuid, uuid, numeric, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.void_vendor_check(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_vendor_check(uuid, uuid, numeric, date, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_vendor_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.issue_vendor_check(uuid, uuid, numeric, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.void_vendor_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vendor_check(uuid, uuid, numeric, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_vendor_check(uuid) TO authenticated;
