-- Remove expected_item_count column from inbound_packages table
ALTER TABLE public.inbound_packages DROP COLUMN IF EXISTS expected_item_count;