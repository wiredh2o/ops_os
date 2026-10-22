GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Internal staff can view invoices" ON public.production_orders;
DROP POLICY IF EXISTS "Internal staff can create invoices" ON public.production_orders;
DROP POLICY IF EXISTS "Internal staff can update invoices" ON public.production_orders;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.production_orders;
DROP POLICY IF EXISTS "External users view own company invoices" ON public.production_orders;
CREATE POLICY "Internal staff can view invoices" ON public.production_orders FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()) OR public.has_role(auth.uid(),'marketing'));
CREATE POLICY "Internal staff can create invoices" ON public.production_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_staff(auth.uid()) OR public.has_role(auth.uid(),'marketing'));
CREATE POLICY "Internal staff can update invoices" ON public.production_orders FOR UPDATE TO authenticated
  USING (public.is_internal_staff(auth.uid()) OR public.has_role(auth.uid(),'marketing'))
  WITH CHECK (public.is_internal_staff(auth.uid()) OR public.has_role(auth.uid(),'marketing'));
CREATE POLICY "Admins can delete invoices" ON public.production_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "External users view own company invoices" ON public.production_orders FOR SELECT TO authenticated
  USING (customer_company_id IS NOT NULL AND customer_company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));