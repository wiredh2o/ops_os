-- Restore the shipped order back to completed status
UPDATE production_orders 
SET status = 'completed', 
    sold_at = NULL, 
    payment_received_at = NULL
WHERE id = 'b548d506-18a8-46ad-8aa8-790e054c529c';

-- Add deposit tracking columns to production_orders
ALTER TABLE production_orders 
ADD COLUMN IF NOT EXISTS deposit_paid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0;

-- Update default payment_terms value from 'prepay' to 'due_in_advance'
ALTER TABLE companies 
ALTER COLUMN payment_terms SET DEFAULT 'due_in_advance';

-- Update existing 'prepay' values to 'due_in_advance'
UPDATE companies 
SET payment_terms = 'due_in_advance' 
WHERE payment_terms = 'prepay' OR payment_terms IS NULL;