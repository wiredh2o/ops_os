DROP POLICY IF EXISTS "Branding public read" ON storage.objects;
DROP POLICY IF EXISTS "Branding admin write" ON storage.objects;
DROP POLICY IF EXISTS "Branding admin update" ON storage.objects;
DROP POLICY IF EXISTS "Branding admin delete" ON storage.objects;
CREATE POLICY "Branding public read" ON storage.objects FOR SELECT USING (bucket_id = 'branding');
CREATE POLICY "Branding admin write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Branding admin update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Branding admin delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.is_internal_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid
    AND role IN ('admin','sales_support','production','accounting','tech_support'));
$$;

DROP POLICY IF EXISTS "Public images read" ON storage.objects;
DROP POLICY IF EXISTS "Staff images write" ON storage.objects;
DROP POLICY IF EXISTS "Staff images update" ON storage.objects;
DROP POLICY IF EXISTS "Staff images delete" ON storage.objects;
CREATE POLICY "Public images read" ON storage.objects FOR SELECT USING (bucket_id IN ('inventory-images','package-images'));
CREATE POLICY "Staff images write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('inventory-images','package-images') AND public.is_internal_staff(auth.uid()));
CREATE POLICY "Staff images update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('inventory-images','package-images') AND public.is_internal_staff(auth.uid())) WITH CHECK (bucket_id IN ('inventory-images','package-images') AND public.is_internal_staff(auth.uid()));
CREATE POLICY "Staff images delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('inventory-images','package-images') AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff private files read" ON storage.objects;
DROP POLICY IF EXISTS "Staff private files write" ON storage.objects;
DROP POLICY IF EXISTS "Staff private files update" ON storage.objects;
DROP POLICY IF EXISTS "Staff private files delete" ON storage.objects;
CREATE POLICY "Staff private files read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id IN ('repairs-intake','shipping-labels','sales-tax-licenses') AND public.is_internal_staff(auth.uid()));
CREATE POLICY "Staff private files write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('repairs-intake','shipping-labels','sales-tax-licenses') AND public.is_internal_staff(auth.uid()));
CREATE POLICY "Staff private files update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('repairs-intake','shipping-labels','sales-tax-licenses') AND public.is_internal_staff(auth.uid())) WITH CHECK (bucket_id IN ('repairs-intake','shipping-labels','sales-tax-licenses') AND public.is_internal_staff(auth.uid()));
CREATE POLICY "Staff private files delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('repairs-intake','shipping-labels','sales-tax-licenses') AND public.is_internal_staff(auth.uid()));