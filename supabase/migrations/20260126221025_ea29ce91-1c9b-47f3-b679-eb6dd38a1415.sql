-- Add order_date column to customer_orders table
ALTER TABLE customer_orders 
ADD COLUMN order_date date DEFAULT CURRENT_DATE;