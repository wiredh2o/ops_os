-- Step 1: Add new enum values (they need to be committed before use)
ALTER TYPE public.app_role ADD VALUE 'distributor_admin';
ALTER TYPE public.app_role ADD VALUE 'distributor_employee'; 
ALTER TYPE public.app_role ADD VALUE 'vendor_admin';
ALTER TYPE public.app_role ADD VALUE 'vendor_employee';