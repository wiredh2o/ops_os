-- Create labor_items table for service offerings
CREATE TABLE public.labor_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  unit_of_measure TEXT NOT NULL DEFAULT 'hour',
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Add labor_item_id to production_order_items
ALTER TABLE public.production_order_items 
ADD COLUMN labor_item_id UUID REFERENCES public.labor_items(id);

-- Update item_type enum to include labor
ALTER TABLE public.production_order_items 
ALTER COLUMN item_type DROP DEFAULT;

UPDATE public.production_order_items 
SET item_type = 'custom' 
WHERE item_type NOT IN ('inventory_item', 'assembly');

-- Add is_taxable column to production_order_items
ALTER TABLE public.production_order_items 
ADD COLUMN is_taxable BOOLEAN NOT NULL DEFAULT true;

-- Enable RLS on labor_items
ALTER TABLE public.labor_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for labor_items
CREATE POLICY "Labor items viewable by authenticated users" 
ON public.labor_items 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Labor items manageable by authenticated users" 
ON public.labor_items 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_labor_items_updated_at
BEFORE UPDATE ON public.labor_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_labor_items_item_number ON public.labor_items(item_number);
CREATE INDEX idx_production_order_items_labor_item_id ON public.production_order_items(labor_item_id);