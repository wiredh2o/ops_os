-- Reset Test Company orders back to completed status
UPDATE production_orders 
SET 
  status = 'completed',
  shipped_at = NULL,
  fedex_tracking_number = NULL,
  fedex_label_url = NULL,
  sold_at = NULL,
  payment_status = NULL,
  payment_received_at = NULL
WHERE customer_company_id IN (
  SELECT id FROM companies WHERE name ILIKE '%Test Company%'
)
AND status = 'shipped'