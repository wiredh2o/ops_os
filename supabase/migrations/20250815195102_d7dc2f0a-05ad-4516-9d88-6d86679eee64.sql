-- Remove legacy distributor and vendor roles from app_role enum
-- Using CASCADE approach to force removal and rebuild

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

-- Step 1: Create the new enum first
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

-- Step 2: Update table columns to use new enum
ALTER TABLE public.user_roles 
ALTER COLUMN role TYPE public.app_role_new 
USING role::text::public.app_role_new;

ALTER TABLE public.pending_invites 
ALTER COLUMN intended_role TYPE public.app_role_new 
USING intended_role::text::public.app_role_new;

-- Step 3: Use CASCADE to drop the old enum and all its dependencies
DROP TYPE public.app_role CASCADE;

-- Step 4: Rename the new enum
ALTER TYPE public.app_role_new RENAME TO app_role;

-- Step 5: Recreate the has_role function
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

-- Step 6: Recreate all the policies that were dropped by CASCADE
CREATE POLICY "Companies manageable by admins and car wash admins" 
ON public.companies 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  (has_role(auth.uid(), 'car_wash_admin'::app_role) AND 
   EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = companies.id))
);

CREATE POLICY "Users can manage their own profile, admins can manage any profile" 
ON public.profiles 
FOR ALL 
USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins and Sales Support can insert invites" 
ON public.pending_invites 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role));

CREATE POLICY "Admins and Sales Support can view invites" 
ON public.pending_invites 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role));

CREATE POLICY "Inviter or admin can update invites" 
ON public.pending_invites 
FOR UPDATE 
USING ((inviter_user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((inviter_user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Recreate price levels policy (without 'accounting' role since it's not in our enum)
CREATE POLICY "Admin and Sales_Support can manage price levels" 
ON public.price_levels 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_support'::app_role));

-- Recreate storage policies (without 'accounting' role)
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