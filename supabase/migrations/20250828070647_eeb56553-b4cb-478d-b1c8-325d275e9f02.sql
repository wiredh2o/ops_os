-- Fix consumption_start_date for all existing items and assemblies
-- Set to today's date for proper day 0 calculation logic

UPDATE public.inventory_items 
SET consumption_start_date = CURRENT_DATE
WHERE consumption_start_date IS NULL OR consumption_start_date != CURRENT_DATE;

UPDATE public.assemblies 
SET consumption_start_date = CURRENT_DATE
WHERE consumption_start_date IS NULL OR consumption_start_date != CURRENT_DATE;

-- Update daily consumption rates to use historical data for day 0 logic
-- This ensures items show correct historical-based consumption rates
SELECT public.update_daily_consumption_rates();