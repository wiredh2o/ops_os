-- Add assigned_tray column to inbound_packages table
ALTER TABLE public.inbound_packages 
ADD COLUMN assigned_tray text;

-- Add unique constraint to prevent duplicate unboxing_order per package on the correct table
ALTER TABLE public.inbound_package_items 
ADD CONSTRAINT unique_package_unboxing_order 
UNIQUE (package_id, unboxing_order);