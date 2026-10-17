-- Add missing permissions for Vendor Employee role
-- These permissions are for day-to-day vendor operations without admin functions

-- Add view_suppliers permission (to see their vendor profile)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
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

-- Add view_purchase_orders permission (to see orders they need to fulfill)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
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

-- Add manage_purchase_orders permission (to update order status and fulfillment)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
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

-- Add view_inventory permission (to see products they handle)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
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

-- Add view_shipping permission (to track orders they fulfill)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
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

-- Add manage_shipping permission (to create shipping labels and fulfill orders)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
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