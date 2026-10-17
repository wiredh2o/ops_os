-- Add distributor to app_role enum
ALTER TYPE public.app_role ADD VALUE 'distributor';
ALTER TYPE public.app_role ADD VALUE 'sales_support';

-- Add distributor discount percentage to profiles
ALTER TABLE public.profiles 
ADD COLUMN distributor_discount_percentage numeric DEFAULT 0 CHECK (distributor_discount_percentage >= 0 AND distributor_discount_percentage <= 100);

-- Add eligible_for_distributor_discount to inventory_items
ALTER TABLE public.inventory_items 
ADD COLUMN eligible_for_distributor_discount boolean DEFAULT true;

-- Add eligible_for_distributor_discount to assemblies
ALTER TABLE public.assemblies 
ADD COLUMN eligible_for_distributor_discount boolean DEFAULT true;

-- Add eligible_for_distributor_discount to labor_items
ALTER TABLE public.labor_items 
ADD COLUMN eligible_for_distributor_discount boolean DEFAULT true;

-- Create comment for clarity on discount percentage options
COMMENT ON COLUMN public.profiles.distributor_discount_percentage IS 'Distributor discount percentage - one of 4 admin-defined options, settable by admin or sales_support roles';