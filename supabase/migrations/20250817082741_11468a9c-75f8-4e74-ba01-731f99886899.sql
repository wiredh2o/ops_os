-- Add assembly_id column to repair_item_estimates table
ALTER TABLE public.repair_item_estimates 
ADD COLUMN assembly_id UUID REFERENCES public.assemblies(id);