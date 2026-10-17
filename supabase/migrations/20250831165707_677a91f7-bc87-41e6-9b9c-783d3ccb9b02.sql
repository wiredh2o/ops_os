-- Add assigned_tray column to inbound_packages table
ALTER TABLE public.inbound_packages 
ADD COLUMN assigned_tray text;

-- Fix existing duplicate unboxing_order values
WITH duplicates AS (
  SELECT package_id, unboxing_order, 
         ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at) as new_order
  FROM public.inbound_package_items
  WHERE (package_id, unboxing_order) IN (
    SELECT package_id, unboxing_order
    FROM public.inbound_package_items
    GROUP BY package_id, unboxing_order
    HAVING COUNT(*) > 1
  )
)
UPDATE public.inbound_package_items 
SET unboxing_order = duplicates.new_order
FROM duplicates
WHERE inbound_package_items.package_id = duplicates.package_id
  AND inbound_package_items.unboxing_order = duplicates.unboxing_order;

-- Now add the unique constraint to prevent future duplicates
ALTER TABLE public.inbound_package_items 
ADD CONSTRAINT unique_package_unboxing_order 
UNIQUE (package_id, unboxing_order);