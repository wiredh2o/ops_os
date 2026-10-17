-- Add item_order column to inbound_package_items table
ALTER TABLE public.inbound_package_items 
ADD COLUMN item_order integer;

-- Create index for better performance when querying by package_id and item_order
CREATE INDEX idx_inbound_package_items_package_order 
ON public.inbound_package_items(package_id, item_order);

-- Update existing records to have sequential item_order based on created_at
WITH ordered_items AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at) as new_order
  FROM public.inbound_package_items
)
UPDATE public.inbound_package_items 
SET item_order = ordered_items.new_order
FROM ordered_items
WHERE public.inbound_package_items.id = ordered_items.id;