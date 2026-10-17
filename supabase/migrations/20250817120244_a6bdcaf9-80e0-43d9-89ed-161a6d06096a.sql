-- First, close all existing orphaned sessions (where end_time is NULL)
-- Keep only the most recent one for each repair_item_id and close the rest
WITH ranked_sessions AS (
  SELECT 
    id,
    repair_item_id,
    start_time,
    ROW_NUMBER() OVER (PARTITION BY repair_item_id ORDER BY start_time DESC) as rn
  FROM public.repair_time_logs 
  WHERE end_time IS NULL
)
UPDATE public.repair_time_logs 
SET 
  end_time = start_time + INTERVAL '1 second',
  total_hours = 0.0003, -- 1 second in hours  
  updated_at = now()
WHERE id IN (
  SELECT id FROM ranked_sessions WHERE rn > 1
);

-- Now create the unique partial index to prevent future duplicates
CREATE UNIQUE INDEX idx_repair_time_logs_active_sessions 
ON public.repair_time_logs (repair_item_id) 
WHERE end_time IS NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_repair_time_logs_active_sessions IS 'Ensures only one active timer session per repair item at a time';