-- Drop the existing function first (return type is changing)
DROP FUNCTION IF EXISTS public.search_repair_items(TEXT);

-- Recreate the search_repair_items function with customer_po included
CREATE OR REPLACE FUNCTION public.search_repair_items(search_term TEXT)
RETURNS TABLE (
  id UUID,
  item_name TEXT,
  serial_number TEXT,
  mac_address TEXT,
  status TEXT,
  problem_reported TEXT,
  diagnosis TEXT,
  completion_outcome TEXT,
  customer_po TEXT,
  company_id UUID,
  company_name TEXT,
  company_email TEXT,
  company_phone TEXT,
  package_id UUID,
  tracking_number TEXT,
  outbound_tracking_number TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ri.id,
    ri.item_name,
    ri.serial_number,
    ri.mac_address,
    ri.status,
    ri.problem_reported,
    ri.diagnosis,
    ri.completion_outcome,
    ri.customer_po,
    c.id AS company_id,
    c.name AS company_name,
    c.email AS company_email,
    c.phone AS company_phone,
    ip.id AS package_id,
    ip.tracking_number,
    po.tracking_number AS outbound_tracking_number,
    po.delivered_at,
    ri.created_at,
    ri.updated_at
  FROM repair_items ri
  LEFT JOIN inbound_packages ip ON ri.package_id = ip.id
  LEFT JOIN companies c ON ip.company_id = c.id
  LEFT JOIN production_order_items poi ON poi.repair_item_id = ri.id
  LEFT JOIN production_orders po ON poi.production_order_id = po.id AND po.order_type = 'repair_shipment'
  WHERE
    ri.item_name ILIKE '%' || search_term || '%'
    OR ri.serial_number ILIKE '%' || search_term || '%'
    OR ri.mac_address ILIKE '%' || search_term || '%'
    OR ri.customer_po ILIKE '%' || search_term || '%'
    OR ip.tracking_number ILIKE '%' || search_term || '%'
    OR po.tracking_number ILIKE '%' || search_term || '%'
    OR c.name ILIKE '%' || search_term || '%'
  ORDER BY ri.updated_at DESC
  LIMIT 100;
END;
$$;