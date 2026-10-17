-- Create the app_role enum with all roles including company-specific ones
CREATE TYPE public.app_role AS ENUM (
  'admin',
  'sales_support',
  'production_repair',
  'accounting',
  'car_wash_admin',
  'car_wash_employee',
  'vendor'
);

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

-- Create profiles table
CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  company_id uuid REFERENCES public.companies(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT exists (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );
  RETURN new;
END;
$$;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for companies
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

-- RLS Policies for profiles
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

-- RLS Policies for user_roles
CREATE POLICY "User roles viewable by owner and admins" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (
  user_id = auth.uid() OR
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'car_wash_admin') AND 
   EXISTS (SELECT 1 FROM public.profiles p1, public.profiles p2 
           WHERE p1.id = auth.uid() AND p2.id = user_roles.user_id 
           AND p1.company_id = p2.company_id))
);

CREATE POLICY "User roles manageable by admins and company admins" 
ON public.user_roles 
FOR ALL 
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'car_wash_admin') AND 
   EXISTS (SELECT 1 FROM public.profiles p1, public.profiles p2 
           WHERE p1.id = auth.uid() AND p2.id = user_roles.user_id 
           AND p1.company_id = p2.company_id))
);

-- Add triggers for updated_at columns
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();