-- Update the app_role enum to include company-specific roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'car_wash_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'car_wash_employee';

-- Create companies table for car wash businesses
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  address text,
  phone text,
  email text,
  contact_person text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Add company_id to profiles table
ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Create companies policies
CREATE POLICY "Companies viewable by authenticated users" 
ON public.companies 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Companies manageable by admins and car wash admins" 
ON public.companies 
FOR ALL 
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  (public.has_role(auth.uid(), 'car_wash_admin') AND 
   EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = companies.id))
);

-- Update profiles policies to include company-based access
DROP POLICY IF EXISTS "Profiles viewable by owner and admins" ON public.profiles;
DROP POLICY IF EXISTS "Profiles manageable by owner and admins" ON public.profiles;

CREATE POLICY "Profiles viewable by owner, admins, and company admins" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (
  id = auth.uid() OR
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'car_wash_admin') AND 
   company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
);

CREATE POLICY "Profiles manageable by owner, admins, and company admins" 
ON public.profiles 
FOR ALL 
TO authenticated
USING (
  id = auth.uid() OR
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'car_wash_admin') AND 
   company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
);

-- Add trigger for companies updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();