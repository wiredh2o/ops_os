-- Add missing permissions for Car Wash Employee role
-- These permissions are for day-to-day operations without admin functions

-- Add view_customers permission (to see their company's profile)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
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

-- Add view_production_orders permission (to see their company's orders)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
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

-- Add manage_production_orders permission (to place orders for supplies)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
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

-- Add view_inventory permission (to see product availability)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
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

-- Add view_inventory_analytics permission (to see usage trends for ordering)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
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

-- Add view_shipping permission (to track their orders)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
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

-- Add view_invoices permission (to see their company's billing)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
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