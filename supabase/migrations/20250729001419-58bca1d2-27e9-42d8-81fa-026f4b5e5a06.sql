-- First create the new enum with all required values including old ones temporarily
ALTER TYPE public.app_role ADD VALUE 'distributor_admin';
ALTER TYPE public.app_role ADD VALUE 'distributor_employee'; 
ALTER TYPE public.app_role ADD VALUE 'vendor_admin';
ALTER TYPE public.app_role ADD VALUE 'vendor_employee';

-- Now update existing roles to new ones
UPDATE public.user_roles 
SET role = 'vendor_admin'::app_role 
WHERE role = 'vendor'::app_role;

UPDATE public.user_roles 
SET role = 'distributor_admin'::app_role 
WHERE role = 'distributor'::app_role;

-- Now we need to recreate the enum without the old values
-- Unfortunately PostgreSQL doesn't allow removing enum values directly
-- So we create a new enum and migrate to it

CREATE TYPE public.app_role_new AS ENUM (
  'admin',
  'car_wash_admin',
  'car_wash_employee', 
  'distributor_admin',
  'distributor_employee',
  'vendor_admin',
  'vendor_employee'
);

-- Update the user_roles table to use the new enum
ALTER TABLE public.user_roles 
ALTER COLUMN role TYPE public.app_role_new USING role::text::public.app_role_new;

-- Drop the old enum and rename the new one
DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;