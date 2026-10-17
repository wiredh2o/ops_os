-- Create secure view for accounts with column-level security
CREATE VIEW public.accounts_secure AS
SELECT 
  id,
  name,
  description,
  is_active,
  created_at,
  updated_at,
  created_by,
  company_id,
  -- Conditional columns based on field-level permissions
  CASE 
    WHEN can_access_field(auth.uid(), 'accounts', 'account_number', 'read', company_id) 
    THEN account_number 
    ELSE NULL 
  END as account_number,
  CASE 
    WHEN can_access_field(auth.uid(), 'accounts', 'account_type', 'read', company_id) 
    THEN account_type 
    ELSE NULL 
  END as account_type,
  CASE 
    WHEN can_access_field(auth.uid(), 'accounts', 'account_subtype', 'read', company_id) 
    THEN account_subtype 
    ELSE NULL 
  END as account_subtype,
  CASE 
    WHEN can_access_field(auth.uid(), 'accounts', 'current_balance', 'read', company_id) 
    THEN current_balance 
    ELSE NULL 
  END as current_balance
FROM public.accounts;

-- Enable RLS on the view (inherits from base table)
ALTER VIEW public.accounts_secure SET (security_invoker = true);