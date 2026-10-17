-- Add FedEx tracking metadata columns to production_orders
ALTER TABLE production_orders 
  ADD COLUMN IF NOT EXISTS fedex_last_status_check timestamp with time zone,
  ADD COLUMN IF NOT EXISTS fedex_delivery_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS fedex_estimated_delivery timestamp with time zone;

-- Create optimized search function for customer service lookups
CREATE OR REPLACE FUNCTION search_repair_items(search_term text)
RETURNS TABLE (
  repair_item_id uuid,
  item_name text,
  serial_number text,
  mac_address text,
  item_status text,
  problem_reported text,
  diagnosis text,
  notes text,
  completion_outcome text,
  customer_name text,
  customer_phone text,
  customer_email text,
  inbound_tracking text,
  package_id uuid,
  outbound_tracking text,
  order_number text,
  order_id uuid,
  shipped_at timestamptz,
  fedex_delivery_date timestamptz,
  fedex_estimated_delivery timestamptz,
  repair_item_created_at timestamptz,
  repair_item_updated_at timestamptz
) AS $$
  SELECT 
    ri.id,
    ri.item_name,
    ri.serial_number,
    ri.mac_address,
    ri.status,
    ri.problem_reported,
    ri.diagnosis,
    ri.notes,
    ri.completion_outcome,
    c.name,
    c.phone,
    c.email,
    ip.tracking_number,
    ip.id,
    po.fedex_tracking_number,
    po.order_number,
    po.id,
    po.shipped_at,
    po.fedex_delivery_date,
    po.fedex_estimated_delivery,
    ri.created_at,
    ri.updated_at
  FROM repair_items ri
  LEFT JOIN inbound_packages ip ON ri.package_id = ip.id
  LEFT JOIN companies c ON ip.company_id = c.id
  LEFT JOIN production_order_items poi ON poi.repair_item_id = ri.id
  LEFT JOIN production_orders po ON poi.production_order_id = po.id
  WHERE 
    ri.serial_number ILIKE '%' || search_term || '%'
    OR ri.mac_address ILIKE '%' || search_term || '%'
    OR ip.tracking_number ILIKE '%' || search_term || '%'
    OR po.fedex_tracking_number ILIKE '%' || search_term || '%'
    OR po.order_number ILIKE '%' || search_term || '%'
    OR c.name ILIKE '%' || search_term || '%'
    OR c.phone ILIKE '%' || search_term || '%'
    OR ri.item_name ILIKE '%' || search_term || '%'
  ORDER BY ri.updated_at DESC
  LIMIT 50;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_repair_items(text) TO authenticated;