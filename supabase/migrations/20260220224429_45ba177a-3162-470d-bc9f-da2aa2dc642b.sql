-- Add always_ship_stacked and max_stack_quantity to inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS always_ship_stacked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_stack_quantity integer DEFAULT NULL;

-- Add always_ship_stacked and max_stack_quantity to assemblies
ALTER TABLE assemblies
  ADD COLUMN IF NOT EXISTS always_ship_stacked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_stack_quantity integer DEFAULT NULL;