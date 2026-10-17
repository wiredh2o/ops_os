-- Add accounting and marketing roles to the app_role enum
ALTER TYPE app_role ADD VALUE 'accounting';
ALTER TYPE app_role ADD VALUE 'marketing';

-- Add default permissions for the new roles
-- Accounting role permissions (financial management focused)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  CASE 
    WHEN p.name IN (
      'view_accounting',
      'manage_accounts', 
      'view_transactions',
      'create_transactions',
      'reconcile_accounts',
      'view_reports'
    ) THEN true
    ELSE false
  END,
  (SELECT id FROM auth.users LIMIT 1),
  NOW()
FROM public.permissions p
ON CONFLICT (role, permission_id) DO NOTHING;

-- Marketing role permissions (customer and sales focused)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'marketing'::app_role,
  p.id,
  CASE 
    WHEN p.name IN (
      'view_customers',
      'manage_customers',
      'view_price_levels',
      'manage_price_levels',
      'view_sales_reports',
      'manage_companies'
    ) THEN true
    ELSE false
  END,
  (SELECT id FROM auth.users LIMIT 1),
  NOW()
FROM public.permissions p
ON CONFLICT (role, permission_id) DO NOTHING;