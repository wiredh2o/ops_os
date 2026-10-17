-- Remove legacy distributor and vendor roles from app_role enum
-- Keep distributor_admin, distributor_employee, vendor_admin, vendor_employee

-- First, let's check if any users have these legacy roles (should be none based on previous check)
-- If there were any, we'd need to migrate them first

-- Remove the legacy roles from the enum
ALTER TYPE public.app_role RENAME TO app_role_old;

CREATE TYPE public.app_role AS ENUM (
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

-- Update all tables that use the enum
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
ALTER TABLE public.pending_invites ALTER COLUMN intended_role TYPE public.app_role USING intended_role::text::public.app_role;

-- Update the has_role function signature
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role_old);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Drop the old enum type
DROP TYPE public.app_role_old;