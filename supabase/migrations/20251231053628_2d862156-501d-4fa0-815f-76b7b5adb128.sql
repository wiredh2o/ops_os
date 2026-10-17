-- Add store credit balance to companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS store_credit_balance NUMERIC DEFAULT 0;

-- Add pending refund balance for check processing
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS pending_refund_balance NUMERIC DEFAULT 0;

-- Create store credit transactions audit table
CREATE TABLE public.store_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'debit', 'refund_pending', 'refund_issued')),
  source_type TEXT NOT NULL CHECK (source_type IN ('order_cancellation', 'checkout_applied', 'manual_adjustment', 'refund_check')),
  source_order_id UUID REFERENCES public.production_orders(id) ON DELETE SET NULL,
  description TEXT,
  check_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.store_credit_transactions ENABLE ROW LEVEL SECURITY;

-- Create policy for viewing - company users can view their company's transactions
CREATE POLICY "Store credit transactions viewable by company users"
ON public.store_credit_transactions FOR SELECT
USING (auth.uid() IS NOT NULL AND (is_admin_or_owner() OR has_company_access(company_id)));

-- Create policy for managing - all internal roles can manage
CREATE POLICY "Store credit transactions manageable by internal roles"
ON public.store_credit_transactions FOR ALL
USING (
  auth.uid() IS NOT NULL AND (
    is_admin_or_owner() OR 
    has_role(auth.uid(), 'accounting'::app_role) OR
    has_role(auth.uid(), 'sales_support'::app_role) OR
    has_role(auth.uid(), 'production'::app_role) OR
    has_role(auth.uid(), 'marketing'::app_role)
  )
);

-- Create index for faster lookups
CREATE INDEX idx_store_credit_transactions_company_id ON public.store_credit_transactions(company_id);
CREATE INDEX idx_store_credit_transactions_created_at ON public.store_credit_transactions(created_at DESC);