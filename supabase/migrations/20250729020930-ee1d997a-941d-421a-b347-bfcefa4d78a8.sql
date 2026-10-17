-- Update RLS policies for sales tax licenses to restrict access by role
DROP POLICY IF EXISTS "Sales tax licenses viewable by authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Sales tax licenses uploadable by authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Sales tax licenses updatable by authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Sales tax licenses deletable by authenticated users" ON storage.objects;

-- Create role-restricted policies for sales tax licenses
CREATE POLICY "Sales tax licenses viewable by authorized roles" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'car_wash_admin'::app_role) OR
    has_role(auth.uid(), 'sales_support'::app_role) OR
    has_role(auth.uid(), 'accounting'::app_role)
  )
);

CREATE POLICY "Sales tax licenses uploadable by authorized roles" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'car_wash_admin'::app_role) OR
    has_role(auth.uid(), 'sales_support'::app_role) OR
    has_role(auth.uid(), 'accounting'::app_role)
  )
);

CREATE POLICY "Sales tax licenses updatable by authorized roles" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'car_wash_admin'::app_role) OR
    has_role(auth.uid(), 'sales_support'::app_role) OR
    has_role(auth.uid(), 'accounting'::app_role)
  )
);

CREATE POLICY "Sales tax licenses deletable by authorized roles" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'car_wash_admin'::app_role) OR
    has_role(auth.uid(), 'sales_support'::app_role) OR
    has_role(auth.uid(), 'accounting'::app_role)
  )
);