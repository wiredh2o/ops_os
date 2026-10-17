-- First, migrate any existing orders with removed statuses
UPDATE customer_orders 
SET order_status = 'pending' 
WHERE order_status IN ('processing', 'confirmed');

-- Update the CHECK constraint
ALTER TABLE customer_orders 
  DROP CONSTRAINT IF EXISTS customer_orders_order_status_check;

ALTER TABLE customer_orders 
  ADD CONSTRAINT customer_orders_order_status_check 
  CHECK (order_status IN ('pending', 'partially_fulfilled', 'fulfilled', 'cancelled'));

-- Update the trigger function to allow transitions from pending
CREATE OR REPLACE FUNCTION public.update_customer_order_fulfillment_status()
RETURNS TRIGGER AS $$
DECLARE
    total_ordered INTEGER;
    total_invoiced INTEGER;
    new_status TEXT;
BEGIN
    SELECT 
        COALESCE(SUM(quantity_ordered), 0),
        COALESCE(SUM(quantity_invoiced), 0)
    INTO total_ordered, total_invoiced
    FROM public.customer_order_items
    WHERE customer_order_id = NEW.customer_order_id;
    
    -- Determine new status based on invoicing
    IF total_invoiced = 0 THEN
        new_status := 'pending';
    ELSIF total_invoiced < total_ordered THEN
        new_status := 'partially_fulfilled';
    ELSE
        new_status := 'fulfilled';
    END IF;
    
    -- Update the order status (skip cancelled orders only)
    UPDATE public.customer_orders
    SET order_status = new_status, updated_at = now()
    WHERE id = NEW.customer_order_id
    AND order_status != 'cancelled';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;