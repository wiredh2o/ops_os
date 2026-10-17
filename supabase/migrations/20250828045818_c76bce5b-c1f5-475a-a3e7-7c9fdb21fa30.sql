-- Fix the handle_inventory_purchase trigger to use correct field names
CREATE OR REPLACE FUNCTION public.handle_inventory_purchase()
RETURNS TRIGGER AS $$
DECLARE
  transaction_id uuid;
BEGIN
  -- Create a transaction record for inventory purchases
  IF TG_OP = 'INSERT' AND NEW.quantity_on_hand > 0 AND NEW.unit_cost > 0 THEN
    INSERT INTO public.transactions (
      description,
      total_amount,
      transaction_type,
      reference_id,
      created_by
    ) VALUES (
      'Inventory Purchase: ' || COALESCE(NEW.sales_description, NEW.sku),
      NEW.unit_cost * NEW.quantity_on_hand,
      'inventory_purchase',
      NEW.id,
      NEW.created_by
    ) RETURNING id INTO transaction_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;