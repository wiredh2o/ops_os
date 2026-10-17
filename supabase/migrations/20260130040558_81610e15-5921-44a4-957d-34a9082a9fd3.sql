-- Fix search_path for new functions created in this migration
CREATE OR REPLACE FUNCTION get_next_serial_sequence(p_prefix TEXT, p_date DATE)
RETURNS INTEGER AS $$
DECLARE
  v_sequence INTEGER;
BEGIN
  INSERT INTO public.serial_sequence_daily (prefix, date, last_sequence)
  VALUES (p_prefix, p_date, 1)
  ON CONFLICT (prefix, date) 
  DO UPDATE SET last_sequence = public.serial_sequence_daily.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;
  
  RETURN v_sequence;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_serialized_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;