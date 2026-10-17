-- Create packing_papers table for managing paper filler types
CREATE TABLE public.packing_papers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    width_inches NUMERIC NOT NULL DEFAULT 24,
    weight_oz_per_foot NUMERIC NOT NULL,
    cost_per_foot NUMERIC NOT NULL DEFAULT 0,
    shipping_cost_multiplier NUMERIC NOT NULL DEFAULT 1.0,
    supplier TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID NOT NULL DEFAULT auth.uid(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    CONSTRAINT packing_papers_positive CHECK (
        width_inches > 0 AND weight_oz_per_foot > 0
    )
);

-- Enable RLS
ALTER TABLE public.packing_papers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to read packing papers"
ON public.packing_papers FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to insert packing papers"
ON public.packing_papers FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update packing papers"
ON public.packing_papers FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to delete packing papers"
ON public.packing_papers FOR DELETE
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_packing_papers_updated_at
BEFORE UPDATE ON public.packing_papers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();