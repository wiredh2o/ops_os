-- Remove description column from assemblies table
ALTER TABLE public.assemblies DROP COLUMN IF EXISTS description;