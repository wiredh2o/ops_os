-- Add taxable column to assemblies table
ALTER TABLE public.assemblies 
ADD COLUMN taxable boolean NOT NULL DEFAULT true;