REVOKE ALL ON FUNCTION public.can_manage_credit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_credit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_company_payment_terms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_credit_hold_on_ship() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_payment_term() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_on_credit_hold(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_credit() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_credit() TO service_role;