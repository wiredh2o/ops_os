-- Phase 1: Create repair_item_actuals table (mirrors repair_item_estimates)
CREATE TABLE public.repair_item_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id UUID NOT NULL REFERENCES repair_items(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  labor_item_id UUID REFERENCES labor_items(id),
  assembly_id UUID REFERENCES assemblies(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  unit_rate NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  is_taxable BOOLEAN DEFAULT true,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.repair_item_actuals ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Repair item actuals manageable by authenticated users"
ON public.repair_item_actuals
FOR ALL
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Repair item actuals viewable by authenticated users"
ON public.repair_item_actuals
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_repair_item_actuals_repair_item_id ON public.repair_item_actuals(repair_item_id);

-- Phase 2: Add inbound_package_id to production_orders
ALTER TABLE public.production_orders 
ADD COLUMN IF NOT EXISTS inbound_package_id UUID REFERENCES inbound_packages(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_production_orders_inbound_package_id ON public.production_orders(inbound_package_id);

-- Phase 3: Add repair_item_id to production_order_items
ALTER TABLE public.production_order_items 
ADD COLUMN IF NOT EXISTS repair_item_id UUID REFERENCES repair_items(id);

-- Create index for grouping line items by repair item
CREATE INDEX IF NOT EXISTS idx_production_order_items_repair_item_id ON public.production_order_items(repair_item_id);

-- Phase 4: Add 'repair' to order_type enum
ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'repair';

-- Phase 5: Add 'invoiced' status to repair_items (no enum, just status column)
-- Note: The status column in repair_items is TEXT, so we don't need enum changes
-- Valid statuses will be: logged, diagnosed, in_repair, completed, invoiced