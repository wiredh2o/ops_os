-- Add repairability and estimated cost fields to repair_items table
ALTER TABLE repair_items ADD COLUMN repairability TEXT;
ALTER TABLE repair_items ADD COLUMN estimated_cost NUMERIC;