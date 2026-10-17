-- Populate sample component price history data for testing
-- This will create weekly price snapshots for the past 12 weeks for existing inventory items

DO $$ 
DECLARE
  item_record RECORD;
  week_date DATE;
  week_counter INTEGER;
  base_price NUMERIC;
  price_variation NUMERIC;
BEGIN
  -- Loop through inventory items that have unit_price set
  FOR item_record IN 
    SELECT id, sku, unit_price 
    FROM public.inventory_items 
    WHERE unit_price > 0
    LIMIT 20  -- Limit for sample data
  LOOP
    base_price := item_record.unit_price;
    
    -- Create 12 weeks of price history (going back in time)
    FOR week_counter IN 0..11 LOOP
      week_date := date_trunc('week', CURRENT_DATE)::date - (week_counter * 7);
      
      -- Add some price variation (±15%)
      price_variation := base_price * (0.85 + (RANDOM() * 0.3));
      
      -- Insert price history record
      INSERT INTO public.component_price_history (
        inventory_item_id,
        price_date,
        last_paid_unit_cost,
        purchase_order_reference
      ) VALUES (
        item_record.id,
        week_date,
        price_variation,
        'SAMPLE-PO-' || week_counter
      )
      ON CONFLICT (inventory_item_id, price_date) DO NOTHING;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Sample component price history populated';
END $$;