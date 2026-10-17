-- Fix function search path security warnings

-- Fix calculate_inventory_actual_lead_time function search path
CREATE OR REPLACE FUNCTION public.calculate_inventory_actual_lead_time(item_id uuid)
 RETURNS TABLE(actual_lead_time_days integer, data_points integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  avg_lead_time NUMERIC;
  total_records INTEGER;
BEGIN
  -- Calculate average actual lead time from purchase order history
  SELECT 
    AVG(poi.actual_received_date - po.order_date),
    COUNT(*)
  INTO avg_lead_time, total_records
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON poi.purchase_order_id = po.id
  WHERE poi.inventory_item_id = item_id
  AND poi.actual_received_date IS NOT NULL
  AND po.order_date IS NOT NULL;
  
  RETURN QUERY SELECT 
    COALESCE(EXTRACT(days FROM avg_lead_time)::INTEGER, 0) as actual_lead_time_days,
    COALESCE(total_records, 0) as data_points;
END;
$function$;

-- Fix calculate_assembly_actual_lead_time function search path  
CREATE OR REPLACE FUNCTION public.calculate_assembly_actual_lead_time(assembly_id_param uuid)
 RETURNS TABLE(actual_lead_time_days integer, data_points integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  avg_lead_time NUMERIC;
  total_records INTEGER;
BEGIN
  -- Calculate average actual lead time from production order history
  SELECT 
    AVG(po.actual_completion - po.created_at),
    COUNT(*)
  INTO avg_lead_time, total_records
  FROM public.production_orders po
  JOIN public.production_order_items poi ON po.id = poi.production_order_id
  WHERE poi.assembly_id = assembly_id_param
  AND po.actual_completion IS NOT NULL
  AND po.created_at IS NOT NULL;
  
  RETURN QUERY SELECT 
    COALESCE(EXTRACT(days FROM avg_lead_time)::INTEGER, 0) as actual_lead_time_days,
    COALESCE(total_records, 0) as data_points;
END;
$function$;