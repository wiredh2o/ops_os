
-- Add shape and packing paper columns to inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS packed_shape text NOT NULL DEFAULT 'box',
  ADD COLUMN IF NOT EXISTS packed_diameter numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_packed_volume_cubic_inches numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paper_thickness_top numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_bottom numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_left numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_right numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_front numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_back numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_side numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_uniform numeric NOT NULL DEFAULT 0;

-- Add shape and packing paper columns to assemblies
ALTER TABLE public.assemblies
  ADD COLUMN IF NOT EXISTS packed_shape text NOT NULL DEFAULT 'box',
  ADD COLUMN IF NOT EXISTS packed_diameter numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_packed_volume_cubic_inches numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paper_thickness_top numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_bottom numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_left numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_right numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_front numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_back numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_side numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paper_thickness_uniform numeric NOT NULL DEFAULT 0;
