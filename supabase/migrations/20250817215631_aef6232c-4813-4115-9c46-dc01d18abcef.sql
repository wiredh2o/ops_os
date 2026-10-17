-- Drop and recreate the timer functions to fix column ambiguity
DROP FUNCTION IF EXISTS start_repair_timer(UUID, UUID);
DROP FUNCTION IF EXISTS stop_repair_timer(UUID, UUID, NUMERIC);

-- Recreate start_repair_timer with fixed column names
CREATE OR REPLACE FUNCTION start_repair_timer(
  p_repair_item_id UUID,
  p_user_id UUID
) RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  current_total_hours NUMERIC,
  current_elapsed_ms BIGINT
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
  -- Check current timer state with table alias to avoid ambiguity
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

-- Recreate stop_repair_timer function  
CREATE OR REPLACE FUNCTION stop_repair_timer(
  p_repair_item_id UUID,
  p_user_id UUID,
  p_session_hours NUMERIC
) RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  new_total_hours NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_timer_user UUID;
  current_total NUMERIC;
  new_total NUMERIC;
BEGIN
  -- Validate user can stop timer with table alias
  SELECT r.timer_user_id, r.total_accumulated_hours
  INTO current_timer_user, current_total
  FROM repair_items r 
  WHERE r.id = p_repair_item_id;
  
  IF current_timer_user != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Not authorized to stop this timer'::TEXT, current_total;
    RETURN;
  END IF;
  
  -- Calculate new total
  new_total := current_total + p_session_hours;
  
  -- Stop timer and accumulate time
  UPDATE repair_items 
  SET 
    timer_active = FALSE,
    timer_user_id = NULL,
    timer_elapsed_ms = 0,
    total_accumulated_hours = new_total
  WHERE id = p_repair_item_id;
  
  -- Log audit record
  INSERT INTO repair_timer_audit (
    repair_item_id, action, user_id, old_total_hours, new_total_hours, session_hours
  ) VALUES (
    p_repair_item_id, 'accumulate', p_user_id, current_total, new_total, p_session_hours
  );
  
  RETURN QUERY SELECT TRUE, 'Timer stopped and time accumulated'::TEXT, new_total;
END;
$$;