-- Remove name field from inventory_items and assemblies tables
ALTER TABLE public.inventory_items DROP COLUMN name;
ALTER TABLE public.assemblies DROP COLUMN name;