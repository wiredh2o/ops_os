-- Create carrier type enum
DO $$ BEGIN
  CREATE TYPE shipping_carrier_type AS ENUM ('fedex', 'ups', 'usps');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create carrier_accounts table for storing carrier-specific account info
-- This includes things like EPS balance for USPS, negotiated rates info, etc.
CREATE TABLE IF NOT EXISTS public.carrier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier shipping_carrier_type NOT NULL,
  account_number text NOT NULL,
  account_name text,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  is_active boolean NOT NULL DEFAULT true,
  -- USPS EPS specific fields
  eps_balance numeric,
  eps_balance_updated_at timestamp with time zone,
  -- UPS specific fields
  negotiated_rates_enabled boolean DEFAULT false,
  -- General fields
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE(carrier, environment)
);

-- Enable RLS
ALTER TABLE public.carrier_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for carrier_accounts - only admins can manage
CREATE POLICY "Carrier accounts manageable by admins"
  ON public.carrier_accounts
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Carrier accounts viewable by shipping users"
  ON public.carrier_accounts
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'production'::app_role)
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_carrier_accounts_carrier_env 
  ON public.carrier_accounts(carrier, environment, is_active);

-- Add carrier service code column to production_orders if not exists
ALTER TABLE public.production_orders 
  ADD COLUMN IF NOT EXISTS carrier_service_code text;

-- Create trigger to update updated_at on carrier_accounts
CREATE TRIGGER update_carrier_accounts_updated_at
  BEFORE UPDATE ON public.carrier_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();