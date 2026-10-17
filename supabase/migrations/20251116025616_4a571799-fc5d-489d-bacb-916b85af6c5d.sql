-- Delete all purchase order items (child records first)
DELETE FROM purchase_order_items;

-- Delete all purchase orders (parent records second)
DELETE FROM purchase_orders;