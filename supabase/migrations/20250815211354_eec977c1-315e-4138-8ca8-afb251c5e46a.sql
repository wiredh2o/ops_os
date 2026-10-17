-- Fix security warnings by setting search_path for all functions

-- Update get_current_user_company_id function with proper search_path
CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = 'public'
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Update has_company_access function with proper search_path
CREATE OR REPLACE FUNCTION public.has_company_access(target_company_id UUID)
RETURNS BOOLEAN 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = 'public'
AS $$
  SELECT 
    -- Admins and sales support have access to all companies
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'sales_support'::app_role) OR
    -- Other users only have access to their own company
    (SELECT company_id FROM public.profiles WHERE id = auth.uid()) = target_company_id;
$$;

-- Update is_admin_or_owner function with proper search_path
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS BOOLEAN 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = 'public'
AS $$
  SELECT 
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'sales_support'::app_role);
$$;