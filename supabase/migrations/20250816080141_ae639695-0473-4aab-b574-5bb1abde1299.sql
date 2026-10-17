-- Add missing permissions for Production role
-- These permissions are critical for Production to manage manufacturing workflows

-- Add view_inventory_analytics permission (to see demand trends and inventory levels)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
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

-- Add manage_purchase_orders permission (to order materials when needed)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'manage_purchase_orders'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_suppliers permission (to know where to order materials from)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
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

-- Add manage_suppliers permission (to update supplier information)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name = 'manage_suppliers'
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add view_customers permission (to see customer details for production orders)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
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

-- Add view_shipping permission (to coordinate with shipping for completed orders)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
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