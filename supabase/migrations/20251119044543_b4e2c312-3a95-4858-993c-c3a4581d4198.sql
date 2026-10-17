-- Phase 1: Safe Automated Deletion of Duplicate Customers
-- This migration deletes customers created on 2025-11-19 (the duplicate import)
-- while preserving the original 13 customers with 5-digit customer numbers

-- First, create a backup/audit trail of what's being deleted
CREATE TABLE IF NOT EXISTS public.deleted_customers_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  original_customer_id UUID NOT NULL,
  customer_number INTEGER,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  deletion_reason TEXT
);

-- Comment: Add RLS to audit table
ALTER TABLE public.deleted_customers_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view deletion audit"
  ON public.deleted_customers_audit
  FOR SELECT
  USING (public.is_admin_or_owner());

-- Insert records into audit table before deletion
INSERT INTO public.deleted_customers_audit (
  original_customer_id,
  customer_number,
  name,
  email,
  phone,
  created_at,
  deletion_reason
)
SELECT 
  id,
  customer_number,
  name,
  email,
  phone,
  created_at,
  'Duplicate import cleanup - imported on 2025-11-19'
FROM public.companies
WHERE created_at::date = '2025-11-19';

-- Now delete the duplicate customers (those created on 2025-11-19)
DELETE FROM public.companies 
WHERE created_at::date = '2025-11-19';