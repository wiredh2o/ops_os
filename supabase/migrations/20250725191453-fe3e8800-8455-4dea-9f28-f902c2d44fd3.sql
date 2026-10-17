-- Remove the old description column since we now have sales_description
ALTER TABLE public.inventory_items DROP COLUMN description;