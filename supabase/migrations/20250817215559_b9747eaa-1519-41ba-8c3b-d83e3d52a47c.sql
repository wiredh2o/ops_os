-- Fix the ambiguous column reference error in timer functions
CREATE OR REPLACE FUNCTION start_repair_timer(
  p_repair_item_id UUID,
  p_user_id UUID
) RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  current_total_hours NUMERIC,
  current_elapsed_ms BIGINT  -- Changed from timer_elapsed_ms to avoid conflict
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_timer_active BOOLEAN;
  current_timer_user UUID;
  current_total NUMERIC;
  current_elapsed BIGINT;
BEGIN
  -- Check current timer state
  SELECT r.timer_active, r.timer_user_id, r.total_accumulated_hours, r.timer_elapsed_ms
  INTO current_timer_active, current_timer_user, current_total, current_elapsed
  FROM repair_items r 
  WHERE r.id = p_repair_item_id;
  
  -- Validate timer can be started
  IF current_timer_active AND current_timer_user != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Timer already active by another user'::TEXT, current_total, current_elapsed;
    RETURN;
  END IF;
  
  -- Start/resume timer
  UPDATE repair_items 
  SET 
    timer_active = TRUE,
    timer_user_id = p_user_id,
    timer_last_started = now()
  WHERE id = p_repair_item_id;
  
  -- Log audit record
  INSERT INTO repair_timer_audit (
    repair_item_id, action, user_id, old_total_hours, new_total_hours, timer_elapsed_ms
  ) VALUES (
    p_repair_item_id, 'start', p_user_id, current_total, current_total, current_elapsed
  );
  
  RETURN QUERY SELECT TRUE, 'Timer started successfully'::TEXT, current_total, current_elapsed;
END;
$$;