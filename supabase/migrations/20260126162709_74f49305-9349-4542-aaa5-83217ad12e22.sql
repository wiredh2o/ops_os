-- Add shipping_method_preference column to customer_orders
ALTER TABLE customer_orders 
ADD COLUMN IF NOT EXISTS shipping_method_preference text;