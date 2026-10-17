-- Delete all production orders that have no associated items
DELETE FROM production_orders 
WHERE id NOT IN (
  SELECT DISTINCT production_order_id FROM production_order_items WHERE production_order_id IS NOT NULL
);