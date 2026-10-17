-- Force recalculation of densities for existing records by triggering an update
-- This will invoke the density calculation triggers

-- Update all inventory items to recalculate densities
UPDATE public.inventory_items 
SET updated_at = now()
WHERE weight_oz IS NOT NULL AND weight_oz > 0;

-- Update all assemblies to recalculate densities  
UPDATE public.assemblies 
SET updated_at = now()
WHERE weight_oz IS NOT NULL AND weight_oz > 0;