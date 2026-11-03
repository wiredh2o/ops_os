ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS entry_number text, ADD COLUMN IF NOT EXISTS is_adjusting boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS request_key uuid UNIQUE;

CREATE TABLE public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  adjustment_date date NOT NULL,
  old_quantity numeric NOT NULL, new_quantity numeric NOT NULL,
  old_value numeric NOT NULL, new_value numeric NOT NULL,
  old_unit_cost numeric NOT NULL, new_unit_cost numeric NOT NULL,
  reason text,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  request_key uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.inventory_adjustments(inventory_item_id, adjustment_date);
CREATE INDEX ON public.inventory_adjustments(request_key);
GRANT SELECT ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and accounting read inventory adjustments" ON public.inventory_adjustments
  FOR SELECT TO authenticated USING (private.can_manage_vendor_bills());

-- Debit-normal accounts grow with debits; others grow with credits.
CREATE OR REPLACE FUNCTION private.apply_account_line(p_account uuid, p_debit numeric, p_credit numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.accounts SET current_balance = current_balance +
    CASE WHEN account_type IN ('asset','expense') THEN p_debit - p_credit ELSE p_credit - p_debit END
  WHERE id = p_account;
$$;
REVOKE ALL ON FUNCTION private.apply_account_line(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.next_journal_entry_number() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (COALESCE(max(NULLIF(regexp_replace(entry_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text
  FROM public.transactions WHERE transaction_type IN ('general_journal','inventory_adjustment');
$$;
REVOKE ALL ON FUNCTION private.next_journal_entry_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.next_journal_entry_number() TO authenticated;

CREATE OR REPLACE FUNCTION private.post_inventory_adjustments(
  p_date date, p_offset_account_id uuid, p_lines jsonb, p_request_key uuid, p_memo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.accounts%ROWTYPE; v_off public.accounts%ROWTYPE; v_line jsonb; v_item public.inventory_items%ROWTYPE;
  v_old_qty numeric; v_old_cost numeric; v_new_qty numeric; v_new_cost numeric; v_new_value numeric;
  v_net numeric := 0; v_tx uuid; v_count int := 0; v_prev uuid; v_ids uuid[] := '{}';
BEGIN
  IF NOT private.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can adjust inventory'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Missing request key'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Pick an adjustment date'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
  SELECT transaction_id INTO v_prev FROM public.inventory_adjustments WHERE request_key = p_request_key LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('transaction_id', v_prev, 'replayed', true); END IF;

  SELECT * INTO v_inv FROM public.accounts WHERE account_subtype = 'inventory' AND is_active ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add an active Inventory Asset account in the chart of accounts first'; END IF;
  IF p_offset_account_id IS NULL THEN
    SELECT * INTO v_off FROM public.accounts WHERE account_subtype = 'cost_of_goods_sold' AND is_active ORDER BY created_at LIMIT 1;
  ELSE
    SELECT * INTO v_off FROM public.accounts WHERE id = p_offset_account_id AND is_active;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add an active Cost of Goods Sold account in the chart of accounts first'; END IF;
  IF v_off.id = v_inv.id OR v_off.account_type NOT IN ('expense','income') THEN
    RAISE EXCEPTION 'The adjustment account must be a COGS, expense or income account';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'No items to adjust'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM public.inventory_items WHERE id = (v_line->>'item_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
    IF (v_line->>'item_id')::uuid = ANY(v_ids) THEN RAISE EXCEPTION 'Item % is listed twice', v_item.sku; END IF;
    v_ids := v_ids || v_item.id;
    v_old_qty := COALESCE(v_item.quantity_on_hand, 0);
    v_old_cost := COALESCE(v_item.unit_cost, 0);
    v_new_qty := COALESCE((v_line->>'new_quantity')::numeric, v_old_qty);
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Quantity on hand for % cannot go below 0', v_item.sku; END IF;
    IF v_line ? 'new_value' AND v_line->>'new_value' IS NOT NULL THEN
      v_new_value := round((v_line->>'new_value')::numeric, 2);
      IF v_new_value < 0 THEN RAISE EXCEPTION 'Value for % cannot be negative', v_item.sku; END IF;
      IF v_new_qty = 0 THEN
        IF v_new_value <> 0 THEN RAISE EXCEPTION 'Value for % must be 0 when quantity is 0', v_item.sku; END IF;
        v_new_cost := v_old_cost;
      ELSE
        v_new_cost := round(v_new_value / v_new_qty, 6);
      END IF;
    ELSE
      v_new_cost := v_old_cost;
    END IF;
    v_new_value := round(v_new_qty * v_new_cost, 2);
    IF v_new_qty = v_old_qty AND v_new_cost = v_old_cost THEN CONTINUE; END IF;

    UPDATE public.inventory_items SET quantity_on_hand = v_new_qty, unit_cost = v_new_cost WHERE id = v_item.id;
    INSERT INTO public.inventory_adjustments(inventory_item_id, adjustment_date, old_quantity, new_quantity,
      old_value, new_value, old_unit_cost, new_unit_cost, reason, request_key, created_by)
    VALUES (v_item.id, p_date, v_old_qty, v_new_qty, round(v_old_qty * v_old_cost, 2), v_new_value,
      v_old_cost, v_new_cost, NULLIF(btrim(COALESCE(v_line->>'reason', p_memo, '')), ''), p_request_key, auth.uid());
    v_net := v_net + v_new_value - round(v_old_qty * v_old_cost, 2);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN RAISE EXCEPTION 'Nothing changed'; END IF;

  IF v_net <> 0 THEN
    INSERT INTO public.transactions(company_id, created_by, description, total_amount, transaction_date,
      transaction_type, entry_number, is_adjusting, request_key)
    VALUES (v_inv.company_id, auth.uid(),
      COALESCE(NULLIF(btrim(p_memo), ''), 'Inventory adjustment (' || v_count || ' item' || CASE WHEN v_count > 1 THEN 's' ELSE '' END || ')'),
      abs(v_net), p_date, 'inventory_adjustment', private.next_journal_entry_number(), true, p_request_key)
    RETURNING id INTO v_tx;
    IF v_net > 0 THEN
      INSERT INTO public.transaction_lines(transaction_id, account_id, debit_amount, credit_amount, description)
      VALUES (v_tx, v_inv.id, v_net, 0, 'Inventory adjustment'), (v_tx, v_off.id, 0, v_net, 'Inventory adjustment');
      PERFORM private.apply_account_line(v_inv.id, v_net, 0); PERFORM private.apply_account_line(v_off.id, 0, v_net);
    ELSE
      INSERT INTO public.transaction_lines(transaction_id, account_id, debit_amount, credit_amount, description)
      VALUES (v_tx, v_off.id, -v_net, 0, 'Inventory adjustment'), (v_tx, v_inv.id, 0, -v_net, 'Inventory adjustment');
      PERFORM private.apply_account_line(v_off.id, -v_net, 0); PERFORM private.apply_account_line(v_inv.id, 0, -v_net);
    END IF;
    UPDATE public.inventory_adjustments SET transaction_id = v_tx WHERE request_key = p_request_key;
  END IF;
  RETURN jsonb_build_object('transaction_id', v_tx, 'items', v_count, 'net', v_net, 'replayed', false);
END $$;

CREATE OR REPLACE FUNCTION private.post_journal_entry(
  p_date date, p_entry_number text, p_is_adjusting boolean, p_memo text, p_lines jsonb, p_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_line jsonb; v_dr numeric := 0; v_cr numeric := 0; v_d numeric; v_c numeric; v_tx uuid; v_n int := 0; v_company uuid; v_no text;
BEGIN
  IF NOT private.can_manage_vendor_bills() THEN RAISE EXCEPTION 'Only admin or accounting can post journal entries'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Missing request key'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Pick a date'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
  SELECT id INTO v_tx FROM public.transactions WHERE request_key = p_request_key;
  IF FOUND THEN RETURN jsonb_build_object('transaction_id', v_tx, 'replayed', true); END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_d := round(COALESCE((v_line->>'debit')::numeric, 0), 2); v_c := round(COALESCE((v_line->>'credit')::numeric, 0), 2);
    IF v_d < 0 OR v_c < 0 OR (v_d > 0 AND v_c > 0) THEN RAISE EXCEPTION 'Each line needs either a debit or a credit'; END IF;
    IF v_d = 0 AND v_c = 0 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = (v_line->>'account_id')::uuid AND is_active) THEN RAISE EXCEPTION 'Pick an account on every line'; END IF;
    v_dr := v_dr + v_d; v_cr := v_cr + v_c; v_n := v_n + 1;
  END LOOP;
  IF v_n < 2 THEN RAISE EXCEPTION 'An entry needs at least two lines'; END IF;
  IF v_dr <> v_cr THEN RAISE EXCEPTION 'Debits (%) must equal credits (%)', v_dr, v_cr; END IF;
  v_no := COALESCE(NULLIF(btrim(p_entry_number), ''), private.next_journal_entry_number());
  SELECT company_id INTO v_company FROM public.accounts WHERE id = (p_lines->0->>'account_id')::uuid;
  INSERT INTO public.transactions(company_id, created_by, description, total_amount, transaction_date, transaction_type, entry_number, is_adjusting, request_key)
  VALUES (v_company, auth.uid(), COALESCE(NULLIF(btrim(p_memo), ''), 'General journal entry ' || v_no), v_dr, p_date, 'general_journal', v_no, COALESCE(p_is_adjusting, false), p_request_key)
  RETURNING id INTO v_tx;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_d := round(COALESCE((v_line->>'debit')::numeric, 0), 2); v_c := round(COALESCE((v_line->>'credit')::numeric, 0), 2);
    IF v_d = 0 AND v_c = 0 THEN CONTINUE; END IF;
    INSERT INTO public.transaction_lines(transaction_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_tx, (v_line->>'account_id')::uuid, v_d, v_c, NULLIF(btrim(COALESCE(v_line->>'memo', '')), ''));
    PERFORM private.apply_account_line((v_line->>'account_id')::uuid, v_d, v_c);
  END LOOP;
  RETURN jsonb_build_object('transaction_id', v_tx, 'entry_number', v_no, 'replayed', false);
END $$;

CREATE OR REPLACE FUNCTION public.post_inventory_adjustments(p_date date, p_offset_account_id uuid, p_lines jsonb, p_request_key uuid, p_memo text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.post_inventory_adjustments(p_date, p_offset_account_id, p_lines, p_request_key, p_memo) $$;
CREATE OR REPLACE FUNCTION public.post_journal_entry(p_date date, p_entry_number text, p_is_adjusting boolean, p_memo text, p_lines jsonb, p_request_key uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.post_journal_entry(p_date, p_entry_number, p_is_adjusting, p_memo, p_lines, p_request_key) $$;
CREATE OR REPLACE FUNCTION public.next_journal_entry_number() RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.next_journal_entry_number() $$;

REVOKE ALL ON FUNCTION private.post_inventory_adjustments(date, uuid, jsonb, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.post_journal_entry(date, text, boolean, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_inventory_adjustments(date, uuid, jsonb, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_journal_entry(date, text, boolean, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_journal_entry_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.post_inventory_adjustments(date, uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.post_journal_entry(date, text, boolean, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_inventory_adjustments(date, uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(date, text, boolean, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_journal_entry_number() TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;