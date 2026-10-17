-- Add item_count column to inbound_packages table
ALTER TABLE public.inbound_packages ADD COLUMN item_count INTEGER DEFAULT 1;