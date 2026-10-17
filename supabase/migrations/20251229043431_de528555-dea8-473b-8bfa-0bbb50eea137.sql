-- Add Stripe integration fields to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_sync_status TEXT DEFAULT 'not_in_stripe',
ADD COLUMN IF NOT EXISTS stripe_last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'prepay',
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC;

-- Add payment and shipping fields to production_orders table
ALTER TABLE public.production_orders
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS fedex_tracking_number TEXT,
ADD COLUMN IF NOT EXISTS fedex_label_url TEXT,
ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC,
ADD COLUMN IF NOT EXISTS shipping_carrier TEXT,
ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

-- Create index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id ON public.companies(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_companies_stripe_sync_status ON public.companies(stripe_sync_status);

-- Create shipping-labels storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipping-labels', 'shipping-labels', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for shipping-labels bucket
CREATE POLICY "Authenticated users can upload shipping labels"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'shipping-labels' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view shipping labels"
ON storage.objects FOR SELECT
USING (bucket_id = 'shipping-labels' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete shipping labels"
ON storage.objects FOR DELETE
USING (bucket_id = 'shipping-labels' AND auth.uid() IS NOT NULL);