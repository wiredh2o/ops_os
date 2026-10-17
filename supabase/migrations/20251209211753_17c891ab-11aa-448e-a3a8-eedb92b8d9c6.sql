-- Create assembly_sales_uoms table (mirrors inventory_sales_uoms)
CREATE TABLE public.assembly_sales_uoms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assembly_id UUID NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_assembly_sales_uoms_assembly_id ON public.assembly_sales_uoms(assembly_id);

-- Enable RLS
ALTER TABLE public.assembly_sales_uoms ENABLE ROW LEVEL SECURITY;

-- RLS policies (matching assemblies table pattern)
CREATE POLICY "Assembly sales UOMs viewable by authenticated users"
ON public.assembly_sales_uoms
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Assembly sales UOMs manageable by authenticated users"
ON public.assembly_sales_uoms
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Trigger to ensure only one default UOM per assembly
CREATE OR REPLACE FUNCTION public.ensure_single_default_assembly_sales_uom()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.assembly_sales_uoms
    SET is_default = false
    WHERE assembly_id = NEW.assembly_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_single_default_assembly_sales_uom_trigger
BEFORE INSERT OR UPDATE ON public.assembly_sales_uoms
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_default_assembly_sales_uom();

-- Migrate existing assemblies to have default UOMs
INSERT INTO public.assembly_sales_uoms (assembly_id, description, quantity, unit_price, is_default, sort_order)
SELECT id, '1pc Lot', 1, selling_price, true, 0
FROM public.assemblies
WHERE selling_price > 0;