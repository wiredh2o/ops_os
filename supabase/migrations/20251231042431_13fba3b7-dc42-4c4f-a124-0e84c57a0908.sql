-- Create sequence starting at 50001
CREATE SEQUENCE IF NOT EXISTS repair_order_number_seq START WITH 50001;

-- Create function to get next formatted order number
CREATE OR REPLACE FUNCTION get_next_repair_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN 'REP-' || nextval('repair_order_number_seq')::TEXT;
END;
$$;