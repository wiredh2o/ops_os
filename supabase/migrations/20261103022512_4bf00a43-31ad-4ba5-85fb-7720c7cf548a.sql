
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER FUNCTION public.record_po_receipt(uuid, jsonb, date, uuid, text) SET SCHEMA private;
ALTER FUNCTION public.convert_receipt_to_bill(uuid, text, date, date, numeric, numeric, numeric) SET SCHEMA private;
ALTER FUNCTION public.unbill_receipt(uuid) SET SCHEMA private;
ALTER FUNCTION public.record_vendor_payment(uuid, numeric, date, text, uuid, text, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_manage_vendor_bills() SET SCHEMA private;

CREATE OR REPLACE FUNCTION public.can_manage_vendor_bills()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT private.can_manage_vendor_bills() $$;
CREATE OR REPLACE FUNCTION public.record_po_receipt(p_po_id uuid, p_lines jsonb, p_received_at date DEFAULT current_date, p_package_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.record_po_receipt(p_po_id, p_lines, p_received_at, p_package_id, p_notes) $$;
CREATE OR REPLACE FUNCTION public.convert_receipt_to_bill(p_receipt_id uuid, p_bill_number text, p_bill_date date, p_due_date date DEFAULT NULL, p_subtotal numeric DEFAULT NULL, p_tax numeric DEFAULT 0, p_shipping numeric DEFAULT 0)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.convert_receipt_to_bill(p_receipt_id, p_bill_number, p_bill_date, p_due_date, p_subtotal, p_tax, p_shipping) $$;
CREATE OR REPLACE FUNCTION public.unbill_receipt(p_receipt_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.unbill_receipt(p_receipt_id) $$;
CREATE OR REPLACE FUNCTION public.record_vendor_payment(p_po_id uuid, p_amount numeric, p_paid_at date, p_method text, p_account_id uuid, p_reference text DEFAULT NULL, p_receipt_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT private.record_vendor_payment(p_po_id, p_amount, p_paid_at, p_method, p_account_id, p_reference, p_receipt_id) $$;

-- private implementations call public helpers by qualified name; private.can_manage_vendor_bills is referenced as public.* inside, repoint
CREATE OR REPLACE FUNCTION public.can_manage_vendor_bills()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT private.can_manage_vendor_bills() $$;

REVOKE ALL ON FUNCTION private.record_po_receipt(uuid, jsonb, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.convert_receipt_to_bill(uuid, text, date, date, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.unbill_receipt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.record_vendor_payment(uuid, numeric, date, text, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_vendor_bills() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_po_receipt(uuid, jsonb, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.convert_receipt_to_bill(uuid, text, date, date, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION private.unbill_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_vendor_payment(uuid, numeric, date, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_vendor_bills() TO authenticated;

REVOKE ALL ON FUNCTION public.record_po_receipt(uuid, jsonb, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_receipt_to_bill(uuid, text, date, date, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unbill_receipt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_vendor_payment(uuid, numeric, date, text, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_vendor_bills() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_po_receipt(uuid, jsonb, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_receipt_to_bill(uuid, text, date, date, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unbill_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment(uuid, numeric, date, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_vendor_bills() TO authenticated;
