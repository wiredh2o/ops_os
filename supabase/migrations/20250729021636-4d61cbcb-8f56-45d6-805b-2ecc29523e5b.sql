-- Add expiration date and OCR data fields to companies table
ALTER TABLE public.companies 
ADD COLUMN sales_tax_license_expires_at DATE,
ADD COLUMN sales_tax_license_ocr_data JSONB,
ADD COLUMN sales_tax_license_ocr_processed_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying of expiring licenses
CREATE INDEX idx_companies_license_expiration 
ON public.companies(sales_tax_license_expires_at) 
WHERE is_distributor = true AND sales_tax_license_expires_at IS NOT NULL;