-- Add additional attributes to inventory_items table
ALTER TABLE public.inventory_items ADD COLUMN width numeric;
ALTER TABLE public.inventory_items ADD COLUMN length numeric;
ALTER TABLE public.inventory_items ADD COLUMN depth numeric;
ALTER TABLE public.inventory_items ADD COLUMN weight_oz numeric;
ALTER TABLE public.inventory_items ADD COLUMN volume_cubic_inches numeric;
ALTER TABLE public.inventory_items ADD COLUMN image_urls text[] DEFAULT '{}';
ALTER TABLE public.inventory_items ADD COLUMN video_url text;
ALTER TABLE public.inventory_items ADD COLUMN lead_time_days integer;
ALTER TABLE public.inventory_items ADD COLUMN minimum_order_quantity integer DEFAULT 1;
ALTER TABLE public.inventory_items ADD COLUMN vendor text;
ALTER TABLE public.inventory_items ADD COLUMN purchase_description text;
ALTER TABLE public.inventory_items ADD COLUMN sales_description text;
ALTER TABLE public.inventory_items ADD COLUMN is_taxable boolean DEFAULT true;
ALTER TABLE public.inventory_items ADD COLUMN manufacturer_part_number text;