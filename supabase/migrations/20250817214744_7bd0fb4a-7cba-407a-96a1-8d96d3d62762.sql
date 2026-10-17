-- ========================================
-- CRITICAL TIMER PROTECTION SYSTEM
-- ========================================
-- DO NOT MODIFY - These constraints and triggers protect timer integrity

-- Add database constraints for timer validation
ALTER TABLE repair_items 
ADD CONSTRAINT check_timer_active_has_user 
CHECK (
  (timer_active = false AND timer_user_id IS NULL) OR 
  (timer_active = true AND timer_user_id IS NOT NULL)
);

ALTER TABLE repair_items 
ADD CONSTRAINT check_accumulated_hours_positive 
CHECK (total_accumulated_hours >= 0);

ALTER TABLE repair_items 
ADD CONSTRAINT check_timer_elapsed_positive 
CHECK (timer_elapsed_ms >= 0);

-- Create timer audit table for tracking all timer changes
CREATE TABLE IF NOT EXISTS repair_timer_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id UUID NOT NULL REFERENCES repair_items(id),
  action TEXT NOT NULL, -- 'start', 'pause', 'session_save', 'accumulate'
  user_id UUID NOT NULL,
  old_total_hours NUMERIC,
  new_total_hours NUMERIC,
  session_hours NUMERIC,
  timer_elapsed_ms BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE repair_timer_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timer audit viewable by authenticated users" 
ON repair_timer_audit FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Timer audit insertable by authenticated users" 
ON repair_timer_audit FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create secure timer functions
CREATE OR REPLACE FUNCTION start_repair_timer(
  p_repair_item_id UUID,
  p_user_id UUID
) RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  current_total_hours NUMERIC,
  timer_elapsed_ms BIGINT
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
  SELECT timer_active, timer_user_id, total_accumulated_hours, timer_elapsed_ms
  INTO current_timer_active, current_timer_user, current_total, current_elapsed
  FROM repair_items 
  WHERE id = p_repair_item_id;
  
  -- Validate timer can be started
  IF current_timer_active AND current_timer_user != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Timer already active by another user', current_total, current_elapsed;
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
  
  RETURN QUERY SELECT TRUE, 'Timer started successfully', current_total, current_elapsed;
END;
$$;

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
  -- Validate user can stop timer
  SELECT timer_user_id, total_accumulated_hours
  INTO current_timer_user, current_total
  FROM repair_items 
  WHERE id = p_repair_item_id;
  
  IF current_timer_user != p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Not authorized to stop this timer', current_total;
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
  
  RETURN QUERY SELECT TRUE, 'Timer stopped and time accumulated', new_total;
END;
$$;

-- Create trigger to validate timer state changes
CREATE OR REPLACE FUNCTION validate_timer_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure timer state consistency
  IF NEW.timer_active = TRUE AND NEW.timer_user_id IS NULL THEN
    RAISE EXCEPTION 'Timer cannot be active without a user';
  END IF;
  
  IF NEW.timer_active = FALSE AND NEW.timer_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Timer cannot be inactive with a user assigned';
  END IF;
  
  -- Prevent negative accumulated hours
  IF NEW.total_accumulated_hours < 0 THEN
    RAISE EXCEPTION 'Total accumulated hours cannot be negative';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER timer_validation_trigger
  BEFORE UPDATE ON repair_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_timer_changes();