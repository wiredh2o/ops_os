-- Update the RLS policy on profiles table to allow admins to manage any profile
-- while regular users can only manage their own profile

DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;

CREATE POLICY "Users can manage their own profile, admins can manage any profile" 
ON public.profiles 
FOR ALL 
USING (
  (id = auth.uid()) OR 
  (has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  (id = auth.uid()) OR 
  (has_role(auth.uid(), 'admin'::app_role))
);