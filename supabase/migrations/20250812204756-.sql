-- Add sold_at and payment_received_at to production_orders for shipment-based recognition
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ NULL;

-- Note: RLS policies already allow authenticated users to update this table.
-- No additional triggers are added here to avoid altering existing deduction logic.