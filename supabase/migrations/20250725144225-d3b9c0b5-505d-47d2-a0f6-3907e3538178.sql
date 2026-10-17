-- Fix function search path security issues
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_status_change()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = ''
AS $$
DECLARE
  order_type TEXT;
  customer_email TEXT;
  customer_phone TEXT;
  order_number TEXT;
BEGIN
  -- Determine order type and get customer info
  IF TG_TABLE_NAME = 'production_orders' THEN
    order_type = 'production';
    customer_email = NEW.customer_email;
    customer_phone = NEW.customer_phone;
    order_number = NEW.order_number;
  ELSIF TG_TABLE_NAME = 'repair_orders' THEN
    order_type = 'repair';
    customer_email = NEW.customer_email;
    customer_phone = NEW.customer_phone;
    order_number = NEW.repair_number;
  END IF;

  -- Log status change if status actually changed
  IF OLD IS NULL OR OLD.status != NEW.status THEN
    INSERT INTO public.status_history (
      order_type,
      order_id,
      old_status,
      new_status,
      changed_by
    ) VALUES (
      order_type,
      NEW.id,
      COALESCE(OLD.status, 'new'),
      NEW.status,
      COALESCE(auth.uid(), NEW.created_by)
    );
  END IF;

  RETURN NEW;
END;
$$;