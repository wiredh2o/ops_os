-- Create packing_tapes table for managing multiple tape types
CREATE TABLE public.packing_tapes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    width_inches NUMERIC NOT NULL,
    length_yards NUMERIC NOT NULL,
    cost_per_roll NUMERIC NOT NULL DEFAULT 0,
    shipping_cost_multiplier NUMERIC NOT NULL DEFAULT 1.0,
    supplier TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID NOT NULL DEFAULT auth.uid(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.packing_tapes ENABLE ROW LEVEL SECURITY;

-- Create policies (same pattern as box_sizes)
CREATE POLICY "Packing tapes viewable by authenticated users" 
ON public.packing_tapes FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Packing tapes manageable by authenticated users" 
ON public.packing_tapes FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_packing_tapes_updated_at
BEFORE UPDATE ON public.packing_tapes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();