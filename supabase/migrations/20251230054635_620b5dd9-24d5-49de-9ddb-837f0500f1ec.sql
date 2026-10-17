-- First, ensure the shipping-labels bucket exists and is PRIVATE (not public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipping-labels', 'shipping-labels', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop any existing policies on shipping-labels
DROP POLICY IF EXISTS "Shipping labels uploadable by service role" ON storage.objects;
DROP POLICY IF EXISTS "Shipping labels readable by authorized roles" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shipping labels" ON storage.objects;
DROP POLICY IF EXISTS "Public can view shipping labels" ON storage.objects;

-- Allow service role and authenticated users to upload labels
CREATE POLICY "Shipping labels uploadable by authenticated users"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shipping-labels');

-- Only allow specific roles to read/download shipping labels
CREATE POLICY "Shipping labels readable by authorized roles"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shipping-labels' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'sales_support'::app_role) OR
    has_role(auth.uid(), 'production'::app_role) OR
    has_role(auth.uid(), 'accounting'::app_role) OR
    has_role(auth.uid(), 'marketing'::app_role)
  )
);