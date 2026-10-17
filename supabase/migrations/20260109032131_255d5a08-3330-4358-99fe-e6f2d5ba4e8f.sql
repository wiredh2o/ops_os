-- Rename shipped_at to label_created_at for semantic clarity
ALTER TABLE public.production_orders
  RENAME COLUMN shipped_at TO label_created_at;

-- Add picked_up_at column for first carrier scan timestamp
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;

-- Add comment for clarity
COMMENT ON COLUMN public.production_orders.label_created_at IS 'Timestamp when the shipping label was created';
COMMENT ON COLUMN public.production_orders.picked_up_at IS 'Timestamp when the carrier first scanned/picked up the package';