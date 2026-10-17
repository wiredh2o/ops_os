-- Remove the old get_repair_item_total_hours function
DROP FUNCTION IF EXISTS public.get_repair_item_total_hours(uuid);

-- Drop the old trigger that uses repair_time_logs for status changes
DROP TRIGGER IF EXISTS repair_status_trigger ON public.repair_time_logs;
DROP FUNCTION IF EXISTS public.update_repair_status_on_time_log();

-- Add NOT NULL constraint to total_accumulated_hours with a default value
ALTER TABLE public.repair_items 
  ALTER COLUMN total_accumulated_hours SET DEFAULT 0.0;

-- Update any existing NULL values to 0
UPDATE public.repair_items 
SET total_accumulated_hours = 0.0 
WHERE total_accumulated_hours IS NULL;

-- Now add the NOT NULL constraint
ALTER TABLE public.repair_items 
  ALTER COLUMN total_accumulated_hours SET NOT NULL;

-- Create a new trigger to update status based on total_accumulated_hours
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

-- Create trigger on repair_items table
CREATE TRIGGER repair_status_hours_trigger
  BEFORE UPDATE ON public.repair_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_repair_status_on_total_hours();