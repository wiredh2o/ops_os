-- Add customer_po column to production_orders
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS customer_po text;

-- Drop and recreate get_ready_to_ship_customer_orders function with customer_po and label_created status
DROP FUNCTION IF EXISTS public.get_ready_to_ship_customer_orders();

CREATE FUNCTION public.get_ready_to_ship_customer_orders()
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
    po.customer_po
  FROM public.production_orders po
  WHERE po.order_type IN ('customer', 'repair')
  AND po.status IN ('pending', 'approved', 'in_progress', 'completed', 'label_created')
  AND (
    -- Repair orders are always ready to ship (no inventory check needed)
    po.order_type = 'repair'
    OR
    -- ship_complete: all items have enough available-to-ship for this specific order
    (po.shipping_preference = 'ship_complete' AND NOT EXISTS (
      SELECT 1
      FROM public.production_order_items poi
      LEFT JOIN public.inventory_items ii ON poi.inventory_item_id = ii.id
      LEFT JOIN public.assemblies a ON poi.assembly_id = a.id
      WHERE poi.production_order_id = po.id
      AND (
        (poi.item_type = 'inventory_item' AND (GREATEST(ii.quantity_on_hand - (ii.quantity_allocated - poi.quantity), 0) < poi.quantity))
        OR 
        (poi.item_type = 'assembly' AND (GREATEST(a.quantity_on_hand - (a.quantity_allocated - poi.quantity), 0) < poi.quantity))
      )
    ))
    OR
    -- ship_as_available: at least some quantity is available now
    (po.shipping_preference = 'ship_as_available' AND EXISTS (
      SELECT 1
      FROM public.production_order_items poi
      LEFT JOIN public.inventory_items ii ON poi.inventory_item_id = ii.id
      LEFT JOIN public.assemblies a ON poi.assembly_id = a.id
      WHERE poi.production_order_id = po.id
      AND (
        (poi.item_type = 'inventory_item' AND (GREATEST(ii.quantity_on_hand - ii.quantity_allocated, 0) > 0))
        OR 
        (poi.item_type = 'assembly' AND (GREATEST(a.quantity_on_hand - a.quantity_allocated, 0) > 0))
      )
    ))
  )
  ORDER BY po.created_at ASC;
END;
$$;