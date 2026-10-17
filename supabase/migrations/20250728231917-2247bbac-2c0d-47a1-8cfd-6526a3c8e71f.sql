-- Add new order types to support proactive reordering
-- First, add order_subtype enum to distinguish customer orders from auto-generated ones
DO $$ BEGIN
    CREATE TYPE order_subtype AS ENUM ('customer', 'auto_generated_purchase', 'replenishment_production');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add order_subtype column to production_orders to distinguish customer orders from replenishment production
ALTER TABLE public.production_orders 
ADD COLUMN IF NOT EXISTS order_subtype order_subtype DEFAULT 'customer';

-- Add order_subtype column to purchase_orders to distinguish manual orders from auto-generated ones
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS order_subtype order_subtype DEFAULT 'customer';

-- Add auto_generated flag for easy filtering
ALTER TABLE public.production_orders 
ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false;

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false;

-- Add source information for auto-generated orders
ALTER TABLE public.production_orders 
ADD COLUMN IF NOT EXISTS source_reason text;

ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS source_reason text;

-- Create indexes for efficient querying of auto-generated orders
CREATE INDEX IF NOT EXISTS idx_production_orders_auto_generated ON public.production_orders(auto_generated, order_subtype);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_auto_generated ON public.purchase_orders(auto_generated, order_subtype);

-- Add reorder trigger information to track when items reach reorder points
CREATE TABLE IF NOT EXISTS public.reorder_triggers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type text NOT NULL CHECK (item_type IN ('inventory_item', 'assembly')),
  item_id uuid NOT NULL,
  current_quantity integer NOT NULL,
  reorder_point integer NOT NULL,
  days_until_stockout integer,
  trending_velocity numeric,
  trigger_reason text NOT NULL,
  order_generated boolean DEFAULT false,
  generated_order_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone
);

-- Enable RLS on reorder_triggers
ALTER TABLE public.reorder_triggers ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for reorder_triggers
CREATE POLICY "Reorder triggers manageable by authenticated users" 
ON public.reorder_triggers FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Add enhanced reorder calculation tracking
CREATE TABLE IF NOT EXISTS public.reorder_calculations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  calculation_date date DEFAULT CURRENT_DATE,
  total_items_processed integer DEFAULT 0,
  total_assemblies_processed integer DEFAULT 0,
  items_needing_reorder integer DEFAULT 0,
  assemblies_needing_reorder integer DEFAULT 0,
  purchase_orders_generated integer DEFAULT 0,
  production_orders_generated integer DEFAULT 0,
  calculation_duration_ms integer,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on reorder_calculations
ALTER TABLE public.reorder_calculations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for reorder_calculations
CREATE POLICY "Reorder calculations viewable by authenticated users" 
ON public.reorder_calculations FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Add trigger to update updated_at on reorder_triggers
CREATE TRIGGER update_reorder_triggers_updated_at
  BEFORE UPDATE ON public.reorder_triggers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();