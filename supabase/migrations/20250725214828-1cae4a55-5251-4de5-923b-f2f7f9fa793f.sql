-- Fix remaining function security warnings by setting search_path

-- Update the remaining functions that still have mutable search paths
ALTER FUNCTION public.update_account_balance() SET search_path = '';
ALTER FUNCTION public.handle_status_change() SET search_path = '';