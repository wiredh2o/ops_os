-- Remove legacy distributor and vendor roles from app_role enum
-- Since PostgreSQL doesn't support DROP VALUE on enums directly, 
-- we'll recreate the enum with only the values we want to keep

-- First verify no users have the legacy roles that we're removing
-- (This should return 0 based on previous checks)
DO $$
DECLARE
  legacy_role_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_role_count 
  FROM public.user_roles 
  WHERE role IN ('distributor', 'vendor');
  
  IF legacy_role_count > 0 THEN
    RAISE EXCEPTION 'Cannot remove legacy roles - % users still have distributor or vendor roles', legacy_role_count;
  END IF;
END $$;

-- Create a simplified approach using string-based temporary function
-- Step 1: Create a temporary has_role function that works with text
CREATE OR REPLACE FUNCTION public.has_role_temp(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role
  )
$$;

-- Step 2: Update all RLS policies to use the temporary function temporarily
-- We need to disable and re-enable policies to avoid dependency issues

-- Update companies policy
DROP POLICY IF EXISTS "Companies manageable by admins and car wash admins" ON public.companies;
CREATE POLICY "Companies manageable by admins and car wash admins" 
ON public.companies 
FOR ALL 
USING (
  has_role_temp(auth.uid(), 'admin') OR 
  (has_role_temp(auth.uid(), 'car_wash_admin') AND 
   EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = companies.id))
);

-- Update profiles policy  
DROP POLICY IF EXISTS "Users can manage their own profile, admins can manage any profi" ON public.profiles;
CREATE POLICY "Users can manage their own profile, admins can manage any profile" 
ON public.profiles 
FOR ALL 
USING ((id = auth.uid()) OR has_role_temp(auth.uid(), 'admin'))
WITH CHECK ((id = auth.uid()) OR has_role_temp(auth.uid(), 'admin'));

-- Update pending_invites policies
DROP POLICY IF EXISTS "Admins and Sales Support can insert invites" ON public.pending_invites;
CREATE POLICY "Admins and Sales Support can insert invites" 
ON public.pending_invites 
FOR INSERT 
WITH CHECK (has_role_temp(auth.uid(), 'admin') OR has_role_temp(auth.uid(), 'sales_support'));

DROP POLICY IF EXISTS "Admins and Sales Support can view invites" ON public.pending_invites;
CREATE POLICY "Admins and Sales Support can view invites" 
ON public.pending_invites 
FOR SELECT 
USING (has_role_temp(auth.uid(), 'admin') OR has_role_temp(auth.uid(), 'sales_support'));

DROP POLICY IF EXISTS "Inviter or admin can update invites" ON public.pending_invites;
CREATE POLICY "Inviter or admin can update invites" 
ON public.pending_invites 
FOR UPDATE 
USING ((inviter_user_id = auth.uid()) OR has_role_temp(auth.uid(), 'admin'))
WITH CHECK ((inviter_user_id = auth.uid()) OR has_role_temp(auth.uid(), 'admin'));

-- Now we can safely recreate the enum and function
-- Step 3: Create new enum
CREATE TYPE public.app_role_clean AS ENUM (
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

-- Step 4: Update table columns
ALTER TABLE public.user_roles 
ALTER COLUMN role TYPE public.app_role_clean 
USING role::text::public.app_role_clean;

ALTER TABLE public.pending_invites 
ALTER COLUMN intended_role TYPE public.app_role_clean 
USING intended_role::text::public.app_role_clean;

-- Step 5: Drop old enum and rename new one
DROP TYPE public.app_role;
ALTER TYPE public.app_role_clean RENAME TO app_role;

-- Step 6: Recreate proper has_role function
DROP FUNCTION public.has_role(uuid, app_role);
DROP FUNCTION public.has_role_temp(uuid, text);

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

-- Step 7: Restore original policies with proper enum types
DROP POLICY "Companies manageable by admins and car wash admins" ON public.companies;
CREATE POLICY "Companies manageable by admins and car wash admins" 
ON public.companies 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  (has_role(auth.uid(), 'car_wash_admin'::app_role) AND 
   EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = companies.id))
);

DROP POLICY "Users can manage their own profile, admins can manage any profile" ON public.profiles;
CREATE POLICY "Users can manage their own profile, admins can manage any profile" 
ON public.profiles 
FOR ALL 
USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY "Admins and Sales Support can insert invites" ON public.pending_invites;
CREATE POLICY "Admins and Sales Support can insert invites" 
ON public.pending_invites 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role));

DROP POLICY "Admins and Sales Support can view invites" ON public.pending_invites;
CREATE POLICY "Admins and Sales Support can view invites" 
ON public.pending_invites 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role));

DROP POLICY "Inviter or admin can update invites" ON public.pending_invites;
CREATE POLICY "Inviter or admin can update invites" 
ON public.pending_invites 
FOR UPDATE 
USING ((inviter_user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((inviter_user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));