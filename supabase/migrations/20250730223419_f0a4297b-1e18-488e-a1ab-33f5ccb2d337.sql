-- Add shipping_preference enum type
CREATE TYPE shipping_preference AS ENUM ('ship_complete', 'ship_as_available');

-- Add shipping_preference column to production_orders
ALTER TABLE public.production_orders 
ADD COLUMN shipping_preference shipping_preference DEFAULT 'ship_complete';

-- Function to get ready-to-build production orders (assembly_build type)
CREATE OR REPLACE FUNCTION public.get_ready_to_build_production_orders()
RETURNS TABLE(
  id uuid,
  order_number text,
  customer_name text,
  created_at timestamp with time zone,
  priority text,
  status text,
  notes text,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    po.customer_name,
    po.created_at,
    po.priority,
    po.status,
    po.notes,
    po.total_amount
  FROM public.production_orders po
  WHERE po.order_type = 'assembly_build'
  AND po.status IN ('pending', 'approved')
  AND NOT EXISTS (
    -- Check if any required component lacks sufficient inventory
    SELECT 1
    FROM public.production_order_items poi
    JOIN public.assembly_components ac ON poi.assembly_id = ac.assembly_id
    JOIN public.inventory_items ii ON ac.inventory_item_id = ii.id
    WHERE poi.production_order_id = po.id
    AND poi.item_type = 'assembly'
    AND ii.quantity_on_hand < (ac.quantity_needed * poi.quantity)
  )
  ORDER BY po.created_at ASC;
END;
$function$;

-- Function to get ready-to-ship customer orders
CREATE OR REPLACE FUNCTION public.get_ready_to_ship_customer_orders()
RETURNS TABLE(
  id uuid,
  order_number text,
  customer_name text,
  created_at timestamp with time zone,
  priority text,
  status text,
  shipping_preference shipping_preference,
  total_amount numeric,
  customer_email text,
  customer_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.order_number,
    po.customer_name,
    po.created_at,
    po.priority,
    po.status,
    po.shipping_preference,
    po.total_amount,
    po.customer_email,
    po.customer_phone
  FROM public.production_orders po
  WHERE po.order_type = 'customer'
  AND po.status IN ('pending', 'approved', 'in_progress', 'completed')
  AND (
    -- For ship_complete: all items must be available
    (po.shipping_preference = 'ship_complete' AND NOT EXISTS (
      SELECT 1
      FROM public.production_order_items poi
      LEFT JOIN public.inventory_items ii ON poi.inventory_item_id = ii.id
      LEFT JOIN public.assemblies a ON poi.assembly_id = a.id
      WHERE poi.production_order_id = po.id
      AND (
        (poi.item_type = 'inventory_item' AND (ii.quantity_on_hand < poi.quantity))
        OR 
        (poi.item_type = 'assembly' AND (a.quantity_on_hand < poi.quantity))
      )
    ))
    OR
    -- For ship_as_available: at least some items must be available
    (po.shipping_preference = 'ship_as_available' AND EXISTS (
      SELECT 1
      FROM public.production_order_items poi
      LEFT JOIN public.inventory_items ii ON poi.inventory_item_id = ii.id
      LEFT JOIN public.assemblies a ON poi.assembly_id = a.id
      WHERE poi.production_order_id = po.id
      AND (
        (poi.item_type = 'inventory_item' AND (ii.quantity_on_hand > 0))
        OR 
        (poi.item_type = 'assembly' AND (a.quantity_on_hand > 0))
      )
    ))
  )
  ORDER BY po.created_at ASC;
END;
$function$;