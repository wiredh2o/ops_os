-- Rename item_order column to unboxing_order for better context
ALTER TABLE public.inbound_package_items 
RENAME COLUMN item_order TO unboxing_order;