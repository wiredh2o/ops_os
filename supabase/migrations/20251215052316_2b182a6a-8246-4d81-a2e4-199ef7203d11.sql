-- Set is_taxable = false for all distributors
UPDATE companies 
SET is_taxable = false, updated_at = now()
WHERE is_distributor = true;