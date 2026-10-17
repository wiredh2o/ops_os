-- Fix the remaining function security warning
-- Let's check which functions exist and update any remaining ones

-- Update any remaining functions
ALTER FUNCTION public.process_inventory_deduction() SET search_path = '';
ALTER FUNCTION public.calculate_assembly_cost(UUID) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.has_role(UUID, app_role) SET search_path = '';
ALTER FUNCTION public.handle_inventory_purchase() SET search_path = '';