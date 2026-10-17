-- Create repair_item_estimates table for tracking repair estimates
CREATE TABLE public.repair_item_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repair_item_id UUID NOT NULL,
  inventory_item_id UUID,
  labor_item_id UUID,
  quantity INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  unit_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.repair_item_estimates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Repair item estimates manageable by authenticated users" 
ON public.repair_item_estimates 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Repair item estimates viewable by authenticated users" 
ON public.repair_item_estimates 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_repair_item_estimates_updated_at
BEFORE UPDATE ON public.repair_item_estimates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();