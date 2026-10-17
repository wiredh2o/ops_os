-- Add customer enhancement fields to companies table
ALTER TABLE public.companies 
ADD COLUMN is_distributor boolean NOT NULL DEFAULT false,
ADD COLUMN discount_taxable boolean NOT NULL DEFAULT true,
ADD COLUMN billing_address text,
ADD COLUMN shipping_addresses jsonb DEFAULT '[]'::jsonb,
ADD COLUMN default_shipping_address_id text,
ADD COLUMN preferred_shipping_carrier text,
ADD COLUMN signature_required boolean NOT NULL DEFAULT false;