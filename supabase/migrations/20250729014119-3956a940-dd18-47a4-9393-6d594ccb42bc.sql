-- Update RLS policy to allow Admin, Sales_Support, and Accounting to manage discount tiers
DROP POLICY IF EXISTS "Admins can manage discount tiers" ON public.discount_tiers;

CREATE POLICY "Admin, Sales_Support, and Accounting can manage discount tiers" 
ON public.discount_tiers 
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