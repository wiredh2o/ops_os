
-- Drop existing overly permissive policies on customer_orders
DROP POLICY IF EXISTS "Users can view customer orders" ON public.customer_orders;
DROP POLICY IF EXISTS "Users can create customer orders" ON public.customer_orders;
DROP POLICY IF EXISTS "Users can update customer orders" ON public.customer_orders;
DROP POLICY IF EXISTS "Users can delete customer orders" ON public.customer_orders;

-- SELECT: internal roles can view all orders
CREATE POLICY "Internal roles can view customer orders"
ON public.customer_orders
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'sales_support') OR
  public.has_role(auth.uid(), 'production') OR
  public.has_role(auth.uid(), 'accounting')
);

-- INSERT: admin and sales_support can create orders
CREATE POLICY "Admin and sales can create customer orders"
ON public.customer_orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'sales_support')
);

-- UPDATE: admin, sales_support, and production can update orders
CREATE POLICY "Admin sales and production can update customer orders"
ON public.customer_orders
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'sales_support') OR
  public.has_role(auth.uid(), 'production')
);

-- DELETE: admin only
CREATE POLICY "Only admins can delete customer orders"
ON public.customer_orders
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);
