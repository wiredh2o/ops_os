-- Create unique partial index to prevent multiple active timer sessions per repair item
CREATE UNIQUE INDEX idx_repair_time_logs_active_sessions 
ON public.repair_time_logs (repair_item_id) 
WHERE end_time IS NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_repair_time_logs_active_sessions IS 'Ensures only one active timer session per repair item at a time';

-- Clean up existing orphaned sessions by setting end_time to start_time for sessions older than 24 hours with no end_time
UPDATE public.repair_time_logs 
SET 
  end_time = start_time + INTERVAL '1 second',
  total_hours = 0.0003, -- 1 second in hours
  updated_at = now()
WHERE end_time IS NULL 
  AND start_time < now() - INTERVAL '24 hours';