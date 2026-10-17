-- Remove old roles and add new admin/employee role pairs
-- First, we need to update any existing users with old roles to new roles
-- This is a breaking change, so we'll map them to admin roles by default

-- Update existing vendor users to vendor_admin
UPDATE public.user_roles 
SET role = 'vendor_admin'::app_role 
WHERE role = 'vendor'::app_role;

-- Update existing distributor users to distributor_admin  
UPDATE public.user_roles 
SET role = 'distributor_admin'::app_role 
WHERE role = 'distributor'::app_role;

-- Now update the enum type
-- We need to recreate the enum to remove old values and add new ones
ALTER TYPE public.app_role RENAME TO app_role_old;

CREATE TYPE public.app_role AS ENUM (
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
ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;

-- Update any other tables that use the enum
ALTER TABLE public.profiles 
ALTER COLUMN default_inventory_view_mode TYPE public.inventory_view_mode USING default_inventory_view_mode;

-- Drop the old enum
DROP TYPE public.app_role_old;