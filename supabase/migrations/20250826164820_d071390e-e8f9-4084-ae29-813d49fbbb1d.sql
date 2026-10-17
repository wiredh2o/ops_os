-- Fix remaining security warnings for functions missing search_path

-- Fix update_package_images_updated_at function
CREATE OR REPLACE FUNCTION public.update_package_images_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix update_repair_status_on_total_hours function
CREATE OR REPLACE FUNCTION public.update_repair_status_on_total_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When total_accumulated_hours changes and exceeds 5 minutes (0.0833 hours)
  IF NEW.total_accumulated_hours > 0.0833 AND NEW.status = 'repairable' THEN
    NEW.status := 'in_repair';
    NEW.updated_at := now();
  END IF;
  
  RETURN NEW;
END;
$function$;