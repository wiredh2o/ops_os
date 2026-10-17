-- Add missing permissions for Accounting role
-- These permissions are critical for Accounting to manage financial operations

-- Add view_customers permission (to access customer billing information)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_customers'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add manage_invoices permission (to create and manage customer invoices)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'manage_invoices'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add process_payments permission (to record customer payments)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'process_payments'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_purchase_orders permission (to track expenses and accounts payable)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_purchase_orders'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_production_orders permission (to understand production costs and revenue)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_production_orders'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_suppliers permission (for expense categorization and vendor management)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_suppliers'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_inventory permission (for cost accounting and asset tracking)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_inventory'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_inventory_analytics permission (for cost analysis and financial reporting)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_inventory_analytics'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();