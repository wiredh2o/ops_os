-- Fix existing orders where payment was received but status wasn't updated
UPDATE production_orders 
SET payment_status = 'paid'
WHERE payment_received_at IS NOT NULL 
  AND stripe_payment_intent_id IS NOT NULL 
  AND (payment_status IS NULL OR payment_status != 'paid');