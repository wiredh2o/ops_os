-- Add visible_for_sale column to inventory_items table
ALTER TABLE public.inventory_items 
ADD COLUMN visible_for_sale boolean NOT NULL DEFAULT true;

-- Add visible_for_sale column to assemblies table
ALTER TABLE public.assemblies 
ADD COLUMN visible_for_sale boolean NOT NULL DEFAULT true;

-- Add comments for documentation
COMMENT ON COLUMN public.inventory_items.visible_for_sale IS 'Whether this item is visible for sale to customers';
COMMENT ON COLUMN public.assemblies.visible_for_sale IS 'Whether this assembly is visible for sale to customers';