-- Add credit_applied column to production_orders
ALTER TABLE public.production_orders
ADD COLUMN IF NOT EXISTS credit_applied NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.production_orders.credit_applied 
IS 'Amount of store credit applied to this order';