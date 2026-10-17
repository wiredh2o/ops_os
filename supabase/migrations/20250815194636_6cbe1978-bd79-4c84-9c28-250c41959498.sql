-- Remove legacy distributor and vendor roles from app_role enum
-- Keep distributor_admin, distributor_employee, vendor_admin, vendor_employee

-- Create the new enum type with updated values
CREATE TYPE public.app_role_new AS ENUM (
  'admin',
  'sales_support', 
  'production',
  'distributor_admin',
  'distributor_employee',
  'vendor_admin',
  'vendor_employee',
  'car_wash_admin',
  'car_wash_employee'
);

-- Create new has_role function with the new enum type
CREATE OR REPLACE FUNCTION public.has_role_new(_user_id uuid, _role app_role_new)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role::text
  )
$$;

-- Update tables to use the new enum type
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role_new USING role::text::public.app_role_new;
ALTER TABLE public.pending_invites ALTER COLUMN intended_role TYPE public.app_role_new USING intended_role::text::public.app_role_new;

-- Replace the old has_role function with the new one
DROP FUNCTION public.has_role(uuid, app_role);
ALTER FUNCTION public.has_role_new(uuid, app_role_new) RENAME TO has_role;

-- Replace the old enum type
DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;