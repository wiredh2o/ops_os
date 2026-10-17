-- Step 1: Reset repair items that are in shipping-related statuses back to 'completed'
UPDATE repair_items 
SET status = 'completed', 
    updated_at = now()
WHERE status IN ('invoiced', 'queued_for_shipping');

-- Step 2: Delete all production order items
DELETE FROM production_order_items;

-- Step 3: Delete all production orders
DELETE FROM production_orders;

-- Step 4: Reset the order number sequence to start fresh at 50000
ALTER SEQUENCE repair_order_number_seq RESTART WITH 50000;