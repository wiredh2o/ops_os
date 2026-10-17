-- Add return shipping address field to inbound_packages table
ALTER TABLE public.inbound_packages 
ADD COLUMN return_shipping_address TEXT;