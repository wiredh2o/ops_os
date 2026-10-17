-- Add third-party shipping account support for distributors
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS use_third_party_shipping boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fedex_account_number text,
ADD COLUMN IF NOT EXISTS fedex_account_zip text,
ADD COLUMN IF NOT EXISTS ups_account_number text,
ADD COLUMN IF NOT EXISTS ups_account_zip text;

-- Add comments for documentation
COMMENT ON COLUMN companies.use_third_party_shipping IS 'When true, shipments are billed to customer carrier account';
COMMENT ON COLUMN companies.fedex_account_number IS 'Customer FedEx account number for third-party billing';
COMMENT ON COLUMN companies.fedex_account_zip IS 'Billing ZIP code for customer FedEx account';
COMMENT ON COLUMN companies.ups_account_number IS 'Customer UPS account number for third-party billing';
COMMENT ON COLUMN companies.ups_account_zip IS 'Billing ZIP code for customer UPS account';