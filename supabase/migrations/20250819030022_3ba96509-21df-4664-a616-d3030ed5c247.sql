-- Add expected_item_count column to inbound_packages table
ALTER TABLE public.inbound_packages 
ADD COLUMN expected_item_count INTEGER;