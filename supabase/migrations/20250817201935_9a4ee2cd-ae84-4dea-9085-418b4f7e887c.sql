-- Add total_accumulated_hours column to repair_items table
ALTER TABLE public.repair_items 
ADD COLUMN total_accumulated_hours NUMERIC DEFAULT 0;

-- Update existing items to have their current accumulated time from logs
UPDATE public.repair_items 
SET total_accumulated_hours = COALESCE((
  SELECT SUM(total_hours) 
  FROM public.repair_time_logs 
  WHERE repair_item_id = repair_items.id
), 0);