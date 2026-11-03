CREATE TABLE public.check_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  check_number integer NOT NULL,
  transaction_id uuid NOT NULL,
  request_key uuid,
  amount numeric NOT NULL,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, check_number),
  UNIQUE (request_key)
);
GRANT SELECT ON public.check_register TO authenticated;
GRANT ALL ON public.check_register TO service_role;
ALTER TABLE public.check_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bill managers read check register" ON public.check_register FOR SELECT TO authenticated
  USING (private.can_manage_vendor_bills());

INSERT INTO public.check_register(account_id, check_number, transaction_id, amount, created_by, created_at)
SELECT DISTINCT ON (account_id, check_number) account_id, check_number, transaction_id,
  (SELECT sum(amount) FROM public.vendor_payments v2 WHERE v2.transaction_id = v.transaction_id), created_by, created_at
FROM public.vendor_payments v WHERE check_number IS NOT NULL AND account_id IS NOT NULL
ORDER BY account_id, check_number, created_at;

-- Next check number may never move back onto an already-issued (or voided) number.
CREATE OR REPLACE FUNCTION private.guard_next_check_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max integer;
BEGIN
  IF NEW.next_check_number IS DISTINCT FROM OLD.next_check_number THEN
    SELECT max(check_number) INTO v_max FROM public.check_register WHERE account_id = NEW.id;
    IF v_max IS NOT NULL AND NEW.next_check_number <= v_max THEN
      RAISE EXCEPTION 'Next check number must be above % (already issued or voided)', v_max;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accounts_guard_next_check BEFORE UPDATE OF next_check_number ON public.accounts
FOR EACH ROW EXECUTE FUNCTION private.guard_next_check_number();

DROP FUNCTION public.issue_vendor_check(uuid, uuid, numeric, date, text, uuid);
DROP FUNCTION private.issue_vendor_check(uuid, uuid, numeric, date, text, uuid);

CREATE FUNCTION private.issue_vendor_check(
  p_account_id uuid, p_po_id uuid, p_amount numeric, p_check_date date,
  p_memo text DEFAULT NULL, p_receipt_id uuid DEFAULT NULL, p_request_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acc public.accounts%ROWTYPE; v_no integer; v_tx uuid; v_payee text; v_prev public.check_register%ROWTYPE;
BEGIN
  IF NOT private.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can issue checks'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Missing request key'; END IF;
  -- Serialize retries of the same request
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
  SELECT * INTO v_prev FROM public.check_register WHERE request_key = p_request_key;
  IF FOUND THEN
    RETURN jsonb_build_object('transaction_id', v_prev.transaction_id, 'check_number', v_prev.check_number, 'replayed', true);
  END IF;
  SELECT * INTO v_acc FROM public.accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND OR v_acc.account_subtype <> 'checking' OR NOT v_acc.is_active THEN RAISE EXCEPTION 'Pick an active checking account'; END IF;
  IF v_acc.routing_number IS NULL OR v_acc.check_account_number IS NULL THEN
    RAISE EXCEPTION 'Add the routing and account numbers for % in Settings first', v_acc.name;
  END IF;
  v_no := GREATEST(v_acc.next_check_number,
    COALESCE((SELECT max(check_number) + 1 FROM public.check_register WHERE account_id = p_account_id), 0));
  SELECT s.name INTO v_payee FROM public.purchase_orders po JOIN public.suppliers s ON s.id = po.supplier_id WHERE po.id = p_po_id;
  v_tx := private.record_vendor_payment(p_po_id, p_amount, p_check_date, 'check', p_account_id, 'Check #' || v_no, p_receipt_id);
  UPDATE public.vendor_payments SET check_number = v_no, payee_name = v_payee, memo = p_memo WHERE transaction_id = v_tx;
  UPDATE public.transactions SET reference_number = 'Check #' || v_no WHERE id = v_tx;
  INSERT INTO public.check_register(account_id, check_number, transaction_id, request_key, amount, created_by)
  VALUES (p_account_id, v_no, v_tx, p_request_key, p_amount, auth.uid());
  UPDATE public.accounts SET next_check_number = v_no + 1 WHERE id = p_account_id;
  RETURN jsonb_build_object('transaction_id', v_tx, 'check_number', v_no);
END $$;

CREATE OR REPLACE FUNCTION private.void_vendor_check(p_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg public.check_register%ROWTYPE; v_bill uuid; v_bills uuid[];
BEGIN
  IF NOT private.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can void checks'; END IF;
  SELECT * INTO v_reg FROM public.check_register WHERE transaction_id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Check not found'; END IF;
  IF v_reg.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Check #% is already void', v_reg.check_number; END IF;
  SELECT array_agg(DISTINCT receipt_id) INTO v_bills FROM public.vendor_payments
    WHERE transaction_id = p_transaction_id AND receipt_id IS NOT NULL;
  DELETE FROM public.vendor_payments WHERE transaction_id = p_transaction_id;
  DELETE FROM public.transaction_lines WHERE transaction_id = p_transaction_id;
  UPDATE public.transactions SET total_amount = 0, description = 'VOID check #' || v_reg.check_number || ' — ' || COALESCE(description,'') WHERE id = p_transaction_id;
  UPDATE public.check_register SET voided_at = now() WHERE id = v_reg.id;
  IF v_bills IS NOT NULL THEN
    FOREACH v_bill IN ARRAY v_bills LOOP PERFORM public.refresh_bill_paid(v_bill); END LOOP;
  END IF;
END $$;

CREATE FUNCTION public.issue_vendor_check(p_account_id uuid, p_po_id uuid, p_amount numeric, p_check_date date, p_memo text DEFAULT NULL, p_receipt_id uuid DEFAULT NULL, p_request_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.issue_vendor_check(p_account_id, p_po_id, p_amount, p_check_date, p_memo, p_receipt_id, p_request_key) $$;

REVOKE ALL ON FUNCTION private.issue_vendor_check(uuid, uuid, numeric, date, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_vendor_check(uuid, uuid, numeric, date, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.issue_vendor_check(uuid, uuid, numeric, date, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_vendor_check(uuid, uuid, numeric, date, text, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.guard_next_check_number() FROM PUBLIC, anon, authenticated;