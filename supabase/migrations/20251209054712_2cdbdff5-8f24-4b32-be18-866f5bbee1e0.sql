-- Add UOM fields to purchase_order_items
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS purchase_uom_id uuid REFERENCES public.inventory_purchase_uoms(id),
ADD COLUMN IF NOT EXISTS purchase_uom text,
ADD COLUMN IF NOT EXISTS purchase_uom_quantity integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS stocking_quantity integer;

-- Add UOM fields to production_order_items
ALTER TABLE public.production_order_items 
ADD COLUMN IF NOT EXISTS sales_uom_id uuid REFERENCES public.inventory_sales_uoms(id),
ADD COLUMN IF NOT EXISTS sales_uom_description text,
ADD COLUMN IF NOT EXISTS sales_uom_quantity integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS stocking_quantity integer;

-- Add comments for clarity
COMMENT ON COLUMN public.purchase_order_items.purchase_uom_quantity IS 'Number of stocking units per purchase package';
COMMENT ON COLUMN public.purchase_order_items.stocking_quantity IS 'Total stocking units = quantity * purchase_uom_quantity';
COMMENT ON COLUMN public.production_order_items.sales_uom_quantity IS 'Number of stocking units per sales lot';
COMMENT ON COLUMN public.production_order_items.stocking_quantity IS 'Total stocking units = quantity * sales_uom_quantity';