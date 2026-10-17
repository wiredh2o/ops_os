-- Add payment token support to production_orders
ALTER TABLE production_orders
ADD COLUMN IF NOT EXISTS payment_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS payment_token_expires_at TIMESTAMPTZ;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_production_orders_payment_token 
ON production_orders(payment_token) 
WHERE payment_token IS NOT NULL;

-- Allow public access for valid, non-expired payment tokens
CREATE POLICY "Allow public order access via payment token"
ON production_orders FOR SELECT
USING (
  payment_token IS NOT NULL 
  AND payment_token_expires_at IS NOT NULL
  AND payment_token_expires_at > now()
);