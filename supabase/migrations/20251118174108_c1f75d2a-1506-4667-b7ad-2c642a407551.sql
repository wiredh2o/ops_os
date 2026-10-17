-- Remove unused address column from companies table
ALTER TABLE public.companies 
DROP COLUMN IF EXISTS address;

-- Add comment for clarity
COMMENT ON TABLE public.companies IS 'Customer/company records. Uses billing_address for billing and shipping_addresses (JSONB array) for shipping locations. The legacy address field has been removed.';