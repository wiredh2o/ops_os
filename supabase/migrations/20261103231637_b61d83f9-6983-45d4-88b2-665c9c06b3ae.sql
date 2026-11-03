ALTER TABLE public.inventory_adjustments ALTER COLUMN inventory_item_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS assembly_id uuid REFERENCES public.assemblies(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_adjustments ADD CONSTRAINT inventory_adjustments_one_target
  CHECK ((inventory_item_id IS NULL) <> (assembly_id IS NULL));
CREATE INDEX IF NOT EXISTS inventory_adjustments_assembly_idx ON public.inventory_adjustments(assembly_id, adjustment_date);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_account_number_unique
  ON public.accounts (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), account_number)
  WHERE account_number IS NOT NULL AND account_number <> '';

CREATE OR REPLACE FUNCTION public.prevent_used_account_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transaction_lines WHERE account_id = OLD.id) THEN
    RAISE EXCEPTION 'This account has journal entries; switch it off instead of deleting it';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS accounts_prevent_used_delete ON public.accounts;
CREATE TRIGGER accounts_prevent_used_delete BEFORE DELETE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_used_account_delete();

CREATE OR REPLACE FUNCTION private.post_inventory_adjustments(
  p_date date, p_offset_account_id uuid, p_lines jsonb, p_request_key uuid, p_memo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.accounts%ROWTYPE; v_off public.accounts%ROWTYPE; v_line jsonb;
  v_kind text; v_id uuid; v_sku text; v_qty numeric; v_cost numeric;
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
    v_kind := COALESCE(v_line->>'kind', 'item');
    v_id := (v_line->>'item_id')::uuid;
    IF v_kind = 'assembly' THEN
      SELECT id, sku, quantity_on_hand, unit_cost INTO v_id, v_sku, v_qty, v_cost FROM public.assemblies WHERE id = v_id FOR UPDATE;
    ELSIF v_kind = 'item' THEN
      SELECT id, sku, quantity_on_hand, unit_cost INTO v_id, v_sku, v_qty, v_cost FROM public.inventory_items WHERE id = v_id FOR UPDATE;
    ELSE RAISE EXCEPTION 'Unknown line type %', v_kind; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
    IF v_id = ANY(v_ids) THEN RAISE EXCEPTION 'Item % is listed twice', v_sku; END IF;
    v_ids := v_ids || v_id;
    v_old_qty := COALESCE(v_qty, 0);
    v_old_cost := COALESCE(v_cost, 0);
    v_new_qty := COALESCE((v_line->>'new_quantity')::numeric, v_old_qty);
    IF v_new_qty < 0 THEN RAISE EXCEPTION 'Quantity on hand for % cannot go below 0', v_sku; END IF;
    IF v_line ? 'new_value' AND v_line->>'new_value' IS NOT NULL THEN
      v_new_value := round((v_line->>'new_value')::numeric, 2);
      IF v_new_value < 0 THEN RAISE EXCEPTION 'Value for % cannot be negative', v_sku; END IF;
      IF v_new_qty = 0 THEN
        IF v_new_value <> 0 THEN RAISE EXCEPTION 'Value for % must be 0 when quantity is 0', v_sku; END IF;
        v_new_cost := v_old_cost;
      ELSE
        v_new_cost := round(v_new_value / v_new_qty, 6);
      END IF;
    ELSE
      v_new_cost := v_old_cost;
    END IF;
    v_new_value := round(v_new_qty * v_new_cost, 2);
    IF v_new_qty = v_old_qty AND v_new_cost = v_old_cost THEN CONTINUE; END IF;

    IF v_kind = 'assembly' THEN
      UPDATE public.assemblies SET quantity_on_hand = v_new_qty, unit_cost = v_new_cost WHERE id = v_id;
    ELSE
      UPDATE public.inventory_items SET quantity_on_hand = v_new_qty, unit_cost = v_new_cost WHERE id = v_id;
    END IF;
    INSERT INTO public.inventory_adjustments(inventory_item_id, assembly_id, adjustment_date, old_quantity, new_quantity,
      old_value, new_value, old_unit_cost, new_unit_cost, reason, request_key, created_by)
    VALUES (CASE WHEN v_kind = 'item' THEN v_id END, CASE WHEN v_kind = 'assembly' THEN v_id END,
      p_date, v_old_qty, v_new_qty, round(v_old_qty * v_old_cost, 2), v_new_value,
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