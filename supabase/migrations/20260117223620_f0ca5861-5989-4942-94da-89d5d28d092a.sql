-- Remove the separate billing ZIP columns since we'll use billing_address ZIP
ALTER TABLE companies DROP COLUMN IF EXISTS fedex_account_zip;
ALTER TABLE companies DROP COLUMN IF EXISTS ups_account_zip;