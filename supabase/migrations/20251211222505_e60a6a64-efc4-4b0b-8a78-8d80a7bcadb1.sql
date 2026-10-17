-- Add is_consigned boolean to assemblies table
-- When true AND is_externally_sourced = true, receiving will consume constituent components
ALTER TABLE public.assemblies 
ADD COLUMN is_consigned BOOLEAN NOT NULL DEFAULT false;