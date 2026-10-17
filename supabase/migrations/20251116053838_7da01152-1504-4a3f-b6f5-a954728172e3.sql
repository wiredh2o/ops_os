-- Add customer_number and cust_since fields to companies table
ALTER TABLE public.companies 
ADD COLUMN customer_number INTEGER,
ADD COLUMN cust_since DATE DEFAULT CURRENT_DATE NOT NULL;

-- Backfill existing 13 customers with sequential numbers starting at 25001
WITH numbered_companies AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) + 25000 as new_number,
    created_at::date as customer_since
  FROM public.companies
)
UPDATE public.companies c
SET 
  customer_number = nc.new_number,
  cust_since = nc.customer_since
FROM numbered_companies nc
WHERE c.id = nc.id;

-- Make customer_number unique and not null
ALTER TABLE public.companies 
ALTER COLUMN customer_number SET NOT NULL,
ADD CONSTRAINT companies_customer_number_unique UNIQUE (customer_number);

-- Create sequence for auto-generation (starts at 25014 since we have 13 existing)
CREATE SEQUENCE customer_number_seq START WITH 25014;

-- Create trigger function to auto-assign customer numbers
CREATE OR REPLACE FUNCTION public.assign_customer_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.customer_number IS NULL THEN
    NEW.customer_number := nextval('customer_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
CREATE TRIGGER set_customer_number
  BEFORE INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_customer_number();

-- Make company_id nullable in inbound_packages (enables orphaning strategy)
ALTER TABLE public.inbound_packages 
ALTER COLUMN company_id DROP NOT NULL;

-- Add comment explaining this is intentional for migration support
COMMENT ON COLUMN public.inbound_packages.company_id IS 
  'Can be NULL temporarily during customer data migration. Should be reassigned before making NOT NULL again.';