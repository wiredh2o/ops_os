-- NULL all volume fields for inventory items and assemblies
UPDATE public.inventory_items 
SET volume_cubic_inches = NULL, packed_volume_cubic_inches = NULL;

UPDATE public.assemblies 
SET volume_cubic_inches = NULL, packed_volume_cubic_inches = NULL;

-- Add dummy packed dimension data (1.0 x 1.0 x 1.0) for all items
UPDATE public.inventory_items 
SET 
  packed_dimension_l = 1.0,
  packed_dimension_w = 1.0,
  packed_dimension_h = 1.0;

UPDATE public.assemblies 
SET 
  packed_dimension_l = 1.0,
  packed_dimension_w = 1.0,
  packed_dimension_h = 1.0;