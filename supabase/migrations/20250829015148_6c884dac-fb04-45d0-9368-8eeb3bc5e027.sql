-- Manually update a few test records to see if triggers work
-- First, let's check if we have records with dimensions but null volumes
SELECT sku, dimension_l, dimension_w, dimension_h, volume_cubic_inches 
FROM inventory_items 
WHERE dimension_l IS NOT NULL AND dimension_w IS NOT NULL AND dimension_h IS NOT NULL 
AND volume_cubic_inches IS NULL 
LIMIT 3;

-- Update the records by recalculating their volumes based on dimensions
UPDATE public.inventory_items 
SET volume_cubic_inches = dimension_l * dimension_w * dimension_h,
    packed_volume_cubic_inches = CASE 
      WHEN packed_dimension_l IS NOT NULL AND packed_dimension_w IS NOT NULL AND packed_dimension_h IS NOT NULL
      THEN packed_dimension_l * packed_dimension_w * packed_dimension_h
      ELSE NULL
    END
WHERE dimension_l IS NOT NULL AND dimension_w IS NOT NULL AND dimension_h IS NOT NULL;

-- Check the results
SELECT sku, weight_oz, volume_cubic_inches, density, packed_volume_cubic_inches, packed_density 
FROM inventory_items 
WHERE volume_cubic_inches IS NOT NULL 
LIMIT 5;