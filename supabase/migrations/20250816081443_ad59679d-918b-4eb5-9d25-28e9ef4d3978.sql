-- Add missing permissions for Distributor Employee role
-- These permissions are for day-to-day distribution operations without admin functions

-- Add view_customers permission (to see customer information they support)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
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

-- Add view_production_orders permission (to see customer orders they help process)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
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

-- Add manage_production_orders permission (to help process customer orders)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'manage_production_orders'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_inventory permission (to see products they distribute)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
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

-- Add view_inventory_analytics permission (to help with order planning)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
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

-- Add view_invoices permission (to see customer billing status)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_invoices'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_shipping permission (to track customer shipments)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'view_shipping'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add manage_shipping permission (to handle shipping operations)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'manage_shipping'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();