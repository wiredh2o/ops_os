-- =============================================
-- Phase 1: Create Multi-UOM Relationship Tables
-- =============================================

-- Table for multiple sales UOM configurations per inventory item
CREATE TABLE public.inventory_sales_uoms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(inventory_item_id, quantity)
);

-- Table for multiple purchase UOM configurations per inventory item
CREATE TABLE public.inventory_purchase_uoms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  purchase_uom TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
  supplier_name TEXT,
  lead_time_days INTEGER CHECK (lead_time_days >= 0),
  minimum_order_quantity INTEGER DEFAULT 1 CHECK (minimum_order_quantity >= 1),
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(inventory_item_id, supplier_name, purchase_uom, quantity)
);

-- Enable RLS
ALTER TABLE public.inventory_sales_uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchase_uoms ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inventory_sales_uoms
CREATE POLICY "Inventory sales UOMs viewable by authenticated users"
  ON public.inventory_sales_uoms
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory sales UOMs manageable by authenticated users"
  ON public.inventory_sales_uoms
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for inventory_purchase_uoms
CREATE POLICY "Inventory purchase UOMs viewable by authenticated users"
  ON public.inventory_purchase_uoms
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Inventory purchase UOMs manageable by authenticated users"
  ON public.inventory_purchase_uoms
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Create indexes for better query performance
CREATE INDEX idx_inventory_sales_uoms_item ON public.inventory_sales_uoms(inventory_item_id);
CREATE INDEX idx_inventory_sales_uoms_default ON public.inventory_sales_uoms(inventory_item_id, is_default) WHERE is_default = true;
CREATE INDEX idx_inventory_purchase_uoms_item ON public.inventory_purchase_uoms(inventory_item_id);
CREATE INDEX idx_inventory_purchase_uoms_default ON public.inventory_purchase_uoms(inventory_item_id, is_default) WHERE is_default = true;

-- Trigger function to ensure only one default per inventory item for sales UOMs
CREATE OR REPLACE FUNCTION public.ensure_single_default_sales_uom()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.inventory_sales_uoms
    SET is_default = false
    WHERE inventory_item_id = NEW.inventory_item_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function to ensure only one default per inventory item for purchase UOMs
CREATE OR REPLACE FUNCTION public.ensure_single_default_purchase_uom()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.inventory_purchase_uoms
    SET is_default = false
    WHERE inventory_item_id = NEW.inventory_item_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER ensure_single_default_sales_uom_trigger
  BEFORE INSERT OR UPDATE ON public.inventory_sales_uoms
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_sales_uom();

CREATE TRIGGER ensure_single_default_purchase_uom_trigger
  BEFORE INSERT OR UPDATE ON public.inventory_purchase_uoms
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_purchase_uom();

-- Updated_at trigger for sales UOMs
CREATE TRIGGER update_inventory_sales_uoms_updated_at
  BEFORE UPDATE ON public.inventory_sales_uoms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_package_images_updated_at();

-- Updated_at trigger for purchase UOMs
CREATE TRIGGER update_inventory_purchase_uoms_updated_at
  BEFORE UPDATE ON public.inventory_purchase_uoms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_package_images_updated_at();

-- =============================================
-- Phase 2: Migrate Existing UOM Data
-- =============================================

-- Migrate existing sales UOM configurations
INSERT INTO public.inventory_sales_uoms (inventory_item_id, quantity, unit_price, description, is_default, sort_order)
SELECT 
  id,
  COALESCE(sales_uom_quantity, 1),
  COALESCE(sales_unit_price, unit_price),
  CASE 
    WHEN sales_uom_quantity IS NOT NULL THEN 'Pack of ' || sales_uom_quantity::text
    ELSE NULL
  END,
  true,
  0
FROM public.inventory_items
WHERE has_sales_conversion = true
  AND sales_uom_quantity IS NOT NULL
  AND sales_uom_quantity > 0;

-- Migrate existing purchase UOM configurations
INSERT INTO public.inventory_purchase_uoms (inventory_item_id, purchase_uom, quantity, unit_cost, supplier_name, lead_time_days, minimum_order_quantity, is_default, sort_order)
SELECT 
  id,
  COALESCE(purchase_uom, 'case'),
  COALESCE(purchase_uom_quantity, 1),
  COALESCE(purchase_unit_cost, unit_cost, 0),
  vendor,
  lead_time_days,
  COALESCE(minimum_order_quantity, 1),
  true,
  0
FROM public.inventory_items
WHERE has_purchase_conversion = true
  AND purchase_uom_quantity IS NOT NULL
  AND purchase_uom_quantity > 0;