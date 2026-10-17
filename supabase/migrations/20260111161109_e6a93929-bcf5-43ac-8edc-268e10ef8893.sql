-- Drop and recreate the function with correct order_type values
DROP FUNCTION IF EXISTS get_ready_to_ship_customer_orders();

CREATE OR REPLACE FUNCTION get_ready_to_ship_customer_orders()
RETURNS TABLE (
  id uuid,
  order_number text,
  customer_name text,
  created_at timestamptz,
  priority text,
  status text,
  total_amount numeric,
  notes text,
  customer_email text,
  customer_phone text,
  shipping_preference text,
  store_at_point_of_use boolean,
  customer_po text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    c.name as customer_name,
    po.created_at,
    po.priority::text,
    po.status::text,
    po.total_amount,
    po.notes,
    po.customer_email,
    po.customer_phone,
    po.shipping_preference::text,
    po.store_at_point_of_use,
    po.customer_po
  FROM production_orders po
  LEFT JOIN companies c ON po.customer_company_id = c.id
  WHERE po.status IN ('pending', 'completed', 'label_staged')
    AND po.order_type IN ('customer', 'repair')
  ORDER BY po.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;