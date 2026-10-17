-- Add weight_oz column to box_sizes table
ALTER TABLE public.box_sizes 
ADD COLUMN IF NOT EXISTS weight_oz NUMERIC DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.box_sizes.weight_oz IS 'Empty box tare weight in ounces';

-- Create production_order_shipments table for multi-box shipment tracking
CREATE TABLE public.production_order_shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  package_number INTEGER NOT NULL DEFAULT 1,
  carrier TEXT,
  service_type TEXT,
  tracking_number TEXT,
  label_path TEXT,
  shipping_cost NUMERIC DEFAULT 0,
  box_id UUID REFERENCES public.box_sizes(id) ON DELETE SET NULL,
  box_dimensions JSONB,
  package_weight_oz NUMERIC DEFAULT 0,
  box_cost NUMERIC DEFAULT 0,
  paper_cost NUMERIC DEFAULT 0,
  paper_length_ft NUMERIC DEFAULT 0,
  is_mock BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups by production order
CREATE INDEX idx_production_order_shipments_order_id 
ON public.production_order_shipments(production_order_id);

-- Enable RLS
ALTER TABLE public.production_order_shipments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies matching production_orders pattern
CREATE POLICY "Users can view production order shipments"
ON public.production_order_shipments
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create shipments"
ON public.production_order_shipments
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update shipments"
ON public.production_order_shipments
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete shipments"
ON public.production_order_shipments
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Add comment for table
COMMENT ON TABLE public.production_order_shipments IS 'Tracks individual packages/labels for multi-box shipments';