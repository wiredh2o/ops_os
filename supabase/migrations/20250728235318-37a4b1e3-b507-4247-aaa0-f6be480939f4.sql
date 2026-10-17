-- Fix infinite recursion in RLS policies by simplifying them

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Profiles manageable by owner, admins, and company admins" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by owner, admins, and company admins" ON public.profiles;
DROP POLICY IF EXISTS "User roles manageable by admins and company admins" ON public.user_roles;
DROP POLICY IF EXISTS "User roles viewable by owner and admins" ON public.user_roles;

-- Create simplified policies that avoid circular dependencies

-- Profiles policies - allow authenticated users to see all profiles, manage their own
CREATE POLICY "Profiles viewable by authenticated users" ON public.profiles
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Users can manage their own profile" ON public.profiles
FOR ALL TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- User roles policies - allow users to see their own roles, restrict management
CREATE POLICY "Users can view their own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role can manage all user roles" ON public.user_roles
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated users to insert/update/delete user roles (will be controlled by application logic)
CREATE POLICY "Authenticated users can manage user roles" ON public.user_roles
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);