-- Create discount_tiers table for admin-managed discount options
CREATE TABLE public.discount_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  discount_percentage numeric NOT NULL CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

-- Enable RLS on discount_tiers
ALTER TABLE public.discount_tiers ENABLE ROW LEVEL SECURITY;

-- Only admins can manage discount tiers
CREATE POLICY "Admins can manage discount tiers" 
ON public.discount_tiers 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Everyone can view active discount tiers (for dropdowns, etc.)
CREATE POLICY "Everyone can view active discount tiers" 
ON public.discount_tiers 
FOR SELECT 
USING (is_active = true);

-- Add trigger for updated_at
CREATE TRIGGER update_discount_tiers_updated_at
BEFORE UPDATE ON public.discount_tiers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Remove the direct percentage column from profiles
ALTER TABLE public.profiles DROP COLUMN distributor_discount_percentage;

-- Add foreign key reference to discount_tiers
ALTER TABLE public.profiles 
ADD COLUMN discount_tier_id uuid REFERENCES public.discount_tiers(id);

-- Create default discount tiers
INSERT INTO public.discount_tiers (name, discount_percentage, description, created_by) VALUES
  ('Standard Distributor', 10, 'Standard distributor discount', '13a16401-8308-4499-b849-4ce57ee09c1c'),
  ('Premium Distributor', 15, 'Premium distributor discount', '13a16401-8308-4499-b849-4ce57ee09c1c'),
  ('Elite Distributor', 20, 'Elite distributor discount', '13a16401-8308-4499-b849-4ce57ee09c1c'),
  ('Volume Distributor', 25, 'High volume distributor discount', '13a16401-8308-4499-b849-4ce57ee09c1c');