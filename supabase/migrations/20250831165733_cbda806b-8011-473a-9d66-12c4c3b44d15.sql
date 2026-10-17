-- Add assigned_tray column to inbound_packages table
ALTER TABLE public.inbound_packages 
ADD COLUMN assigned_tray text;

-- Renumber all package items sequentially based on creation order
UPDATE public.inbound_package_items 
SET unboxing_order = sub.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at) as row_num
  FROM public.inbound_package_items
) sub
WHERE inbound_package_items.id = sub.id;

-- Now add the unique constraint to prevent future duplicates
ALTER TABLE public.inbound_package_items 
ADD CONSTRAINT unique_package_unboxing_order 
UNIQUE (package_id, unboxing_order);