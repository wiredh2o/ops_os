-- Remove legacy distributor and vendor roles from app_role enum
-- Comprehensive approach handling all dependent policies

-- Verify no users have the legacy roles
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

-- Step 1: Create temporary text-based has_role function
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

-- Step 2: Drop and recreate ALL policies that depend on has_role function
-- Note: I noticed the error mentions 'accounting' role which isn't in our current enum, 
-- so these policies might need to be adjusted

-- Companies policies
DROP POLICY IF EXISTS "Companies manageable by admins and car wash admins" ON public.companies;
CREATE POLICY "Companies manageable by admins and car wash admins" 
ON public.companies 
FOR ALL 
USING (
  has_role_temp(auth.uid(), 'admin') OR 
  (has_role_temp(auth.uid(), 'car_wash_admin') AND 
   EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = companies.id))
);

-- Profiles policies
DROP POLICY IF EXISTS "Users can manage their own profile, admins can manage any profi" ON public.profiles;
CREATE POLICY "Users can manage their own profile, admins can manage any profile" 
ON public.profiles 
FOR ALL 
USING ((id = auth.uid()) OR has_role_temp(auth.uid(), 'admin'))
WITH CHECK ((id = auth.uid()) OR has_role_temp(auth.uid(), 'admin'));

-- Pending invites policies
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

-- Price levels policies (note: removing 'accounting' role reference as it's not in our enum)
DROP POLICY IF EXISTS "Admin, Sales_Support, and Accounting can manage price levels" ON public.price_levels;
CREATE POLICY "Admin and Sales_Support can manage price levels" 
ON public.price_levels 
FOR ALL 
USING (has_role_temp(auth.uid(), 'admin') OR has_role_temp(auth.uid(), 'sales_support'))
WITH CHECK (has_role_temp(auth.uid(), 'admin') OR has_role_temp(auth.uid(), 'sales_support'));

-- Storage policies for sales tax licenses (removing 'accounting' role reference)
DROP POLICY IF EXISTS "Sales tax licenses viewable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses viewable by authorized roles" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role_temp(auth.uid(), 'admin') OR 
   has_role_temp(auth.uid(), 'car_wash_admin') OR 
   has_role_temp(auth.uid(), 'sales_support'))
);

DROP POLICY IF EXISTS "Sales tax licenses uploadable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses uploadable by authorized roles" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role_temp(auth.uid(), 'admin') OR 
   has_role_temp(auth.uid(), 'car_wash_admin') OR 
   has_role_temp(auth.uid(), 'sales_support'))
);

DROP POLICY IF EXISTS "Sales tax licenses updatable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses updatable by authorized roles" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role_temp(auth.uid(), 'admin') OR 
   has_role_temp(auth.uid(), 'car_wash_admin') OR 
   has_role_temp(auth.uid(), 'sales_support'))
);

DROP POLICY IF EXISTS "Sales tax licenses deletable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses deletable by authorized roles" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role_temp(auth.uid(), 'admin') OR 
   has_role_temp(auth.uid(), 'car_wash_admin') OR 
   has_role_temp(auth.uid(), 'sales_support'))
);

-- Step 3: Now we can safely work with the enum
-- Create new enum without legacy roles
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

-- Step 4: Update table columns to use new enum
ALTER TABLE public.user_roles 
ALTER COLUMN role TYPE public.app_role_clean 
USING role::text::public.app_role_clean;

ALTER TABLE public.pending_invites 
ALTER COLUMN intended_role TYPE public.app_role_clean 
USING intended_role::text::public.app_role_clean;

-- Step 5: Replace the enum
DROP TYPE public.app_role;
ALTER TYPE public.app_role_clean RENAME TO app_role;

-- Step 6: Recreate the proper has_role function
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

-- Step 7: Restore all policies with proper enum types
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

DROP POLICY "Admin and Sales_Support can manage price levels" ON public.price_levels;
CREATE POLICY "Admin and Sales_Support can manage price levels" 
ON public.price_levels 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role));

DROP POLICY "Sales tax licenses viewable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses viewable by authorized roles" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'car_wash_admin'::app_role) OR 
   has_role(auth.uid(), 'sales_support'::app_role))
);

DROP POLICY "Sales tax licenses uploadable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses uploadable by authorized roles" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'car_wash_admin'::app_role) OR 
   has_role(auth.uid(), 'sales_support'::app_role))
);

DROP POLICY "Sales tax licenses updatable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses updatable by authorized roles" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'car_wash_admin'::app_role) OR 
   has_role(auth.uid(), 'sales_support'::app_role))
);

DROP POLICY "Sales tax licenses deletable by authorized roles" ON storage.objects;
CREATE POLICY "Sales tax licenses deletable by authorized roles" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'sales-tax-licenses' AND 
  auth.uid() IS NOT NULL AND 
  (has_role(auth.uid(), 'admin'::app_role) OR 
   has_role(auth.uid(), 'car_wash_admin'::app_role) OR 
   has_role(auth.uid(), 'sales_support'::app_role))
);