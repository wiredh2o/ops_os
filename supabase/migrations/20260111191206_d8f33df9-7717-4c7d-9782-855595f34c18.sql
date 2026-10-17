-- Add carrier tracking columns to production_orders
ALTER TABLE public.production_orders 
ADD COLUMN IF NOT EXISTS carrier TEXT,
ADD COLUMN IF NOT EXISTS is_mock_shipment BOOLEAN DEFAULT FALSE;

-- Add index for carrier lookups
CREATE INDEX IF NOT EXISTS idx_production_orders_carrier ON public.production_orders(carrier);

-- Comment for documentation
COMMENT ON COLUMN public.production_orders.carrier IS 'Shipping carrier used: fedex, ups, usps';
COMMENT ON COLUMN public.production_orders.is_mock_shipment IS 'True if shipment was created in sandbox/mock mode';