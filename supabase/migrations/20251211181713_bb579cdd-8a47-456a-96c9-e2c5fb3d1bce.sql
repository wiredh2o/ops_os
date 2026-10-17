-- Add outsourcing fields to inventory_items (matching assemblies pattern)
ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS is_externally_sourced boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS external_supplier_id uuid REFERENCES public.suppliers(id),
ADD COLUMN IF NOT EXISTS external_part_number text;