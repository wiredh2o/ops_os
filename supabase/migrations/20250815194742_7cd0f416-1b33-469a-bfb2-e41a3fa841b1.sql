-- Remove legacy distributor and vendor roles from app_role enum
-- Step 1: Create new enum without legacy roles
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

-- Step 2: Create new has_role function with new enum type
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

-- Step 3: Update all RLS policies to use the new function
DROP POLICY IF EXISTS "Companies manageable by admins and car wash admins" ON public.companies;
CREATE POLICY "Companies manageable by admins and car wash admins" 
ON public.companies 
FOR ALL 
USING (has_role_new(auth.uid(), 'admin'::app_role_new) OR (has_role_new(auth.uid(), 'car_wash_admin'::app_role_new) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.company_id = companies.id))))));

-- Update price_levels policy (assuming it exists based on the error)
DROP POLICY IF EXISTS "Admin, Sales_Support, and Accounting can manage price levels" ON public.price_levels;
CREATE POLICY "Admin, Sales_Support, and Accounting can manage price levels" 
ON public.price_levels 
FOR ALL 
USING (has_role_new(auth.uid(), 'admin'::app_role_new) OR has_role_new(auth.uid(), 'sales_support'::app_role_new));

-- Update pending_invites policies
DROP POLICY IF EXISTS "Admins and Sales Support can insert invites" ON public.pending_invites;
CREATE POLICY "Admins and Sales Support can insert invites" 
ON public.pending_invites 
FOR INSERT 
WITH CHECK (has_role_new(auth.uid(), 'admin'::app_role_new) OR has_role_new(auth.uid(), 'sales_support'::app_role_new));

DROP POLICY IF EXISTS "Admins and Sales Support can view invites" ON public.pending_invites;
CREATE POLICY "Admins and Sales Support can view invites" 
ON public.pending_invites 
FOR SELECT 
USING (has_role_new(auth.uid(), 'admin'::app_role_new) OR has_role_new(auth.uid(), 'sales_support'::app_role_new));

DROP POLICY IF EXISTS "Inviter or admin can update invites" ON public.pending_invites;
CREATE POLICY "Inviter or admin can update invites" 
ON public.pending_invites 
FOR UPDATE 
USING ((inviter_user_id = auth.uid()) OR has_role_new(auth.uid(), 'admin'::app_role_new))
WITH CHECK ((inviter_user_id = auth.uid()) OR has_role_new(auth.uid(), 'admin'::app_role_new));

-- Update profiles policy
DROP POLICY IF EXISTS "Users can manage their own profile, admins can manage any profi" ON public.profiles;
CREATE POLICY "Users can manage their own profile, admins can manage any profile" 
ON public.profiles 
FOR ALL 
USING ((id = auth.uid()) OR has_role_new(auth.uid(), 'admin'::app_role_new))
WITH CHECK ((id = auth.uid()) OR has_role_new(auth.uid(), 'admin'::app_role_new));

-- Step 4: Update tables to use new enum
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role_new USING role::text::public.app_role_new;
ALTER TABLE public.pending_invites ALTER COLUMN intended_role TYPE public.app_role_new USING intended_role::text::public.app_role_new;

-- Step 5: Replace old function and enum
DROP FUNCTION public.has_role(uuid, app_role);
DROP TYPE public.app_role;

-- Step 6: Rename new types to final names
ALTER TYPE public.app_role_new RENAME TO app_role;
ALTER FUNCTION public.has_role_new(uuid, app_role) RENAME TO has_role;