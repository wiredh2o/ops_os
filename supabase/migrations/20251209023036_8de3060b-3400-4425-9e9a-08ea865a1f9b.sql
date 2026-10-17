-- Add Three-Way UOM system fields to inventory_items
-- Stocking UOM (base unit for inventory tracking)
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS stocking_uom text NOT NULL DEFAULT 'each';

-- Purchase UOM conversion fields
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS has_purchase_conversion boolean NOT NULL DEFAULT false;

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS purchase_uom text;

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS purchase_uom_quantity integer;

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS purchase_unit_cost numeric;

-- Sales UOM conversion fields
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS has_sales_conversion boolean NOT NULL DEFAULT false;

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS sales_uom text;

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS sales_uom_quantity integer;

ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS sales_unit_price numeric;

-- Add comments for clarity
COMMENT ON COLUMN public.inventory_items.stocking_uom IS 'Base unit of measure for inventory tracking (default: each)';
COMMENT ON COLUMN public.inventory_items.has_purchase_conversion IS 'Whether this item uses a different purchase unit than stocking unit';
COMMENT ON COLUMN public.inventory_items.purchase_uom IS 'Unit of measure when purchasing (box, case, tray, tube, reel, large_reel)';
COMMENT ON COLUMN public.inventory_items.purchase_uom_quantity IS 'Number of stocking units per purchase unit (e.g., 100 screws per box)';
COMMENT ON COLUMN public.inventory_items.purchase_unit_cost IS 'Cost per purchase unit (e.g., $5 per box)';
COMMENT ON COLUMN public.inventory_items.has_sales_conversion IS 'Whether this item uses a different sales unit than stocking unit';
COMMENT ON COLUMN public.inventory_items.sales_uom IS 'Unit of measure when selling (pair, bag, pack, dozen, set)';
COMMENT ON COLUMN public.inventory_items.sales_uom_quantity IS 'Number of stocking units per sales unit (e.g., 12 per dozen)';
COMMENT ON COLUMN public.inventory_items.sales_unit_price IS 'Price per sales unit';