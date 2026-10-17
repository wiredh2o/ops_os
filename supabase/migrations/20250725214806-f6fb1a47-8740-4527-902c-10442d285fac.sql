-- Fix security warnings by setting search_path for all functions

-- Update existing functions to include SET search_path = ''
ALTER FUNCTION public.calculate_inventory_rolling_averages(UUID, DATE) SET search_path = '';
ALTER FUNCTION public.calculate_assembly_rolling_averages(UUID, DATE) SET search_path = '';
ALTER FUNCTION public.calculate_dynamic_reorder_point(UUID, INTEGER, NUMERIC) SET search_path = '';
ALTER FUNCTION public.record_inventory_order_demand() SET search_path = '';
ALTER FUNCTION public.record_assembly_shipment() SET search_path = '';