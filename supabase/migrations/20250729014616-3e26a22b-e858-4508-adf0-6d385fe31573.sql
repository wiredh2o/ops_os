-- Rename discount_tiers table to price_levels
ALTER TABLE public.discount_tiers RENAME TO price_levels;

-- Rename the foreign key columns to match
ALTER TABLE public.companies RENAME COLUMN discount_tier_id TO price_level_id;
ALTER TABLE public.profiles RENAME COLUMN discount_tier_id TO price_level_id;

-- Update the foreign key constraint names for clarity (optional but good practice)
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_discount_tier_id_fkey;
ALTER TABLE public.companies ADD CONSTRAINT companies_price_level_id_fkey 
FOREIGN KEY (price_level_id) REFERENCES public.price_levels(id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_discount_tier_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_price_level_id_fkey 
FOREIGN KEY (price_level_id) REFERENCES public.price_levels(id);

-- Update the RLS policy name
DROP POLICY IF EXISTS "Admin, Sales_Support, and Accounting can manage discount tiers" ON public.price_levels;

CREATE POLICY "Admin, Sales_Support, and Accounting can manage price levels" 
ON public.price_levels 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'sales_support'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'sales_support'::app_role) OR 
  has_role(auth.uid(), 'accounting'::app_role)
);

-- Update the view policy name
DROP POLICY IF EXISTS "Everyone can view active discount tiers" ON public.price_levels;

CREATE POLICY "Everyone can view active price levels" 
ON public.price_levels 
FOR SELECT 
USING (is_active = true);

-- Insert default Retail price level if it doesn't exist
INSERT INTO public.price_levels (name, description, discount_percentage, is_active, created_by)
SELECT 'Retail', 'Standard retail pricing with no discount', 0, true, '00000000-0000-0000-0000-000000000000'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.price_levels WHERE name = 'Retail' AND discount_percentage = 0
);

-- Update index name
DROP INDEX IF EXISTS idx_companies_discount_tier_id;
CREATE INDEX idx_companies_price_level_id ON public.companies(price_level_id);