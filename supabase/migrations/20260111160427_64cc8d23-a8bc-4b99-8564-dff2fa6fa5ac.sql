-- Drop and recreate the function with matching signature
DROP FUNCTION IF EXISTS get_ready_to_ship_customer_orders();

CREATE OR REPLACE FUNCTION get_ready_to_ship_customer_orders()
RETURNS TABLE (
  id uuid,
  order_number text,
  customer_name text,
  customer_company_id uuid,
  total_amount numeric,
  status text,
  priority text,
  created_at timestamptz,
  notes text,
  order_type text,
  payment_status text,
  payment_terms text,
  fedex_tracking_number text,
  fedex_label_url text,
  label_created_at timestamptz,
  shipping_cost numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    po.customer_name,
    po.customer_company_id,
    po.total_amount,
    po.status,
    po.priority,
    po.created_at,
    po.notes,
    po.order_type,
    po.payment_status,
    c.payment_terms,
    po.fedex_tracking_number,
    po.fedex_label_url,
    po.label_created_at,
    po.shipping_cost
  FROM production_orders po
  LEFT JOIN companies c ON po.customer_company_id = c.id
  WHERE po.status IN ('pending', 'completed', 'label_staged')
    AND po.order_type IN ('production', 'repair')
  ORDER BY 
    CASE po.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END,
    po.created_at ASC;
END;
$$;