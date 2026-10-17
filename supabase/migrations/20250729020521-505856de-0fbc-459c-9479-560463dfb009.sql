-- Create storage bucket for sales tax licenses
INSERT INTO storage.buckets (id, name, public) VALUES ('sales-tax-licenses', 'sales-tax-licenses', false);

-- Create RLS policies for sales tax licenses bucket
CREATE POLICY "Sales tax licenses viewable by authenticated users" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Sales tax licenses uploadable by authenticated users" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Sales tax licenses updatable by authenticated users" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Sales tax licenses deletable by authenticated users" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'sales-tax-licenses' 
  AND auth.uid() IS NOT NULL
);

-- Add sales tax license image URL column to companies table
ALTER TABLE public.companies 
ADD COLUMN sales_tax_license_url TEXT;