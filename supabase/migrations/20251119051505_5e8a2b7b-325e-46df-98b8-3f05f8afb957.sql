-- Step 1: Orphan inbound packages (so they can be reassigned later)
UPDATE inbound_packages SET company_id = NULL WHERE company_id IS NOT NULL;

-- Step 2: Handle other foreign key constraints
UPDATE accounts SET company_id = NULL WHERE company_id IS NOT NULL;
UPDATE production_orders SET customer_company_id = NULL WHERE customer_company_id IS NOT NULL;
UPDATE purchase_orders SET company_id = NULL WHERE company_id IS NOT NULL;
UPDATE profiles SET company_id = NULL WHERE company_id IS NOT NULL;

-- Step 3: Delete all customer records from companies table
DELETE FROM companies;