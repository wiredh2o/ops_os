-- Step 2: Update existing roles to new admin roles
UPDATE public.user_roles 
SET role = 'vendor_admin'::app_role 
WHERE role = 'vendor'::app_role;

UPDATE public.user_roles 
SET role = 'distributor_admin'::app_role 
WHERE role = 'distributor'::app_role;