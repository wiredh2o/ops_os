ALTER TABLE public.profiles
  ADD COLUMN marketing_view_revenue boolean NOT NULL DEFAULT false,
  ADD COLUMN marketing_view_margin boolean NOT NULL DEFAULT false,
  ADD COLUMN marketing_view_supplier_price boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_marketing_financial_flags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.marketing_view_revenue OR NEW.marketing_view_margin OR NEW.marketing_view_supplier_price THEN
      IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
        RAISE EXCEPTION 'Only admins may enable marketing financial visibility' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF NEW.marketing_view_revenue IS DISTINCT FROM OLD.marketing_view_revenue
    OR NEW.marketing_view_margin IS DISTINCT FROM OLD.marketing_view_margin
    OR NEW.marketing_view_supplier_price IS DISTINCT FROM OLD.marketing_view_supplier_price THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only admins may change marketing financial visibility' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_marketing_financial_flags() FROM PUBLIC;
CREATE TRIGGER protect_marketing_financial_flags BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_marketing_financial_flags();

DROP POLICY IF EXISTS "Authenticated users can manage user roles" ON public.user_roles;
CREATE POLICY "Admins manage role assignments" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Company admins manage only matching employee roles" ON public.user_roles FOR ALL TO authenticated
USING (
  user_id <> auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.company_id IS NOT NULL AND p.company_id = public.get_current_user_company_id())
  AND ((role = 'car_wash_employee' AND public.has_role(auth.uid(), 'car_wash_admin'))
    OR (role = 'vendor_employee' AND public.has_role(auth.uid(), 'vendor_admin'))
    OR (role = 'distributor_employee' AND public.has_role(auth.uid(), 'distributor_admin')))
)
WITH CHECK (
  user_id <> auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.company_id IS NOT NULL AND p.company_id = public.get_current_user_company_id())
  AND ((role = 'car_wash_employee' AND public.has_role(auth.uid(), 'car_wash_admin'))
    OR (role = 'vendor_employee' AND public.has_role(auth.uid(), 'vendor_admin'))
    OR (role = 'distributor_employee' AND public.has_role(auth.uid(), 'distributor_admin')))
);