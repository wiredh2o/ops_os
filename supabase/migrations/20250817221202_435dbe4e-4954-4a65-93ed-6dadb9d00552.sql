-- Add millisecond-resolution timer with single source of truth
-- Step 1: Add the new authoritative millisecond column
ALTER TABLE repair_items 
ADD COLUMN total_accumulated_ms BIGINT NOT NULL DEFAULT 0;

-- Step 2: Migrate existing data from hours to milliseconds
UPDATE repair_items 
SET total_accumulated_ms = FLOOR(total_accumulated_hours * 3600000);

-- Step 3: Add audit column for millisecond tracking
ALTER TABLE repair_timer_audit 
ADD COLUMN session_ms BIGINT,
ADD COLUMN total_accumulated_ms BIGINT;

-- Step 4: Create enhanced timer functions with millisecond precision
DROP FUNCTION IF EXISTS start_repair_timer(UUID, UUID);
DROP FUNCTION IF EXISTS stop_repair_timer(UUID, UUID, NUMERIC);

-- Enhanced start_repair_timer with millisecond precision
CREATE OR REPLACE FUNCTION start_repair_timer(
  p_repair_item_id UUID,
  p_user_id UUID
) RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  total_accumulated_ms BIGINT,
  current_elapsed_ms BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_timer_active BOOLEAN;
  current_timer_user UUID;
  current_total_ms BIGINT;
  current_elapsed BIGINT;
BEGIN
  -- Check current timer state
  SELECT r.timer_active, r.timer_user_id, r.total_accumulated_ms, r.timer_elapsed_ms
  INTO current_timer_active, current_timer_user, current_total_ms, current_elapsed
  FROM repair_items r 
  WHERE r.id = p_repair_item_id;
  
  -- Validate timer can be started
  IF current_timer_active AND current_timer_user != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Timer already active by another user'::TEXT, current_total_ms, current_elapsed;
    RETURN;
  END IF;
  
  -- Monotonic protection: ensure timer never goes backwards
  IF current_total_ms < 0 THEN
    current_total_ms := 0;
    UPDATE repair_items SET total_accumulated_ms = 0 WHERE id = p_repair_item_id;
  END IF;
  
  -- Start/resume timer
  UPDATE repair_items 
  SET 
    timer_active = TRUE,
    timer_user_id = p_user_id,
    timer_last_started = now()
  WHERE id = p_repair_item_id;
  
  -- Enhanced audit record with millisecond tracking
  INSERT INTO repair_timer_audit (
    repair_item_id, action, user_id, old_total_hours, new_total_hours, 
    timer_elapsed_ms, total_accumulated_ms
  ) VALUES (
    p_repair_item_id, 'start', p_user_id, 
    current_total_ms / 3600000.0, current_total_ms / 3600000.0,
    current_elapsed, current_total_ms
  );
  
  RETURN QUERY SELECT TRUE, 'Timer started successfully'::TEXT, current_total_ms, current_elapsed;
END;
$$;

-- Enhanced stop_repair_timer with millisecond precision
CREATE OR REPLACE FUNCTION stop_repair_timer(
  p_repair_item_id UUID,
  p_user_id UUID,
  p_session_ms BIGINT
) RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  new_total_ms BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_timer_user UUID;
  current_total_ms BIGINT;
  new_total_ms BIGINT;
BEGIN
  -- Validate user can stop timer
  SELECT r.timer_user_id, r.total_accumulated_ms
  INTO current_timer_user, current_total_ms
  FROM repair_items r 
  WHERE r.id = p_repair_item_id;
  
  IF current_timer_user != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Not authorized to stop this timer'::TEXT, current_total_ms;
    RETURN;
  END IF;
  
  -- Calculate new total with monotonic protection
  new_total_ms := GREATEST(current_total_ms + GREATEST(p_session_ms, 0), current_total_ms);
  
  -- Stop timer and accumulate time
  UPDATE repair_items 
  SET 
    timer_active = FALSE,
    timer_user_id = NULL,
    timer_elapsed_ms = 0,
    total_accumulated_ms = new_total_ms,
    total_accumulated_hours = new_total_ms / 3600000.0  -- Keep synced for compatibility
  WHERE id = p_repair_item_id;
  
  -- Enhanced audit record
  INSERT INTO repair_timer_audit (
    repair_item_id, action, user_id, old_total_hours, new_total_hours, 
    session_hours, session_ms, total_accumulated_ms
  ) VALUES (
    p_repair_item_id, 'accumulate', p_user_id, 
    current_total_ms / 3600000.0, new_total_ms / 3600000.0,
    p_session_ms / 3600000.0, p_session_ms, new_total_ms
  );
  
  RETURN QUERY SELECT TRUE, 'Timer stopped and time accumulated'::TEXT, new_total_ms;
END;
$$;

-- Add trigger to automatically sync total_accumulated_hours when total_accumulated_ms changes
CREATE OR REPLACE FUNCTION sync_accumulated_hours() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
AS $$
BEGIN
  NEW.total_accumulated_hours = NEW.total_accumulated_ms / 3600000.0;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_accumulated_hours_trigger
  BEFORE UPDATE OF total_accumulated_ms ON repair_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_accumulated_hours();