-- Add active column to assemblies table
ALTER TABLE public.assemblies 
ADD COLUMN active boolean NOT NULL DEFAULT true;