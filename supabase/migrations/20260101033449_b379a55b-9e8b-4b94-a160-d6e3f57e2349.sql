-- Update function to pull customer_po from inbound_packages for repair orders
CREATE OR REPLACE FUNCTION public.get_ready_to_ship_customer_orders()
RETURNS TABLE(
  id uuid,
  order_number text,
  customer_name text,
  created_at timestamptz,
  priority text,
  status text,
  shipping_preference text,
  total_amount numeric,
  customer_email text,
  customer_phone text,
  customer_po text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    po.customer_name,
    po.created_at,
    po.priority,
    po.status,
    po.shipping_preference::text,
    po.total_amount,
    po.customer_email,
    po.customer_phone,
    COALESCE(
      po.customer_po,
      (
        SELECT DISTINCT ip.customer_po 
        FROM production_order_items poi2
        JOIN repair_items ri ON poi2.repair_item_id = ri.id
        JOIN inbound_packages ip ON ri.package_id = ip.id
        WHERE poi2.production_order_id = po.id
        AND ip.customer_po IS NOT NULL
        LIMIT 1
      )
    ) as customer_po
  FROM public.production_orders po
  WHERE po.order_type IN ('customer', 'repair')
  AND po.status IN ('pending', 'approved', 'in_progress', 'completed', 'label_created')
  ORDER BY po.created_at DESC;
END;
$$;