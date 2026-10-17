-- Now add the role permissions for all the roles we've worked on
-- These should work now that the functional permissions exist

-- Re-add all Sales Support permissions (some may already exist from previous attempts)
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'sales_support'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_customers', 'manage_customers', 'view_production_orders', 'manage_production_orders', 'view_inventory', 'view_suppliers', 'view_invoices')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Production permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_customers', 'view_production_orders', 'manage_production_orders', 'view_inventory', 'manage_inventory', 'view_purchase_orders', 'manage_purchase_orders', 'view_suppliers', 'manage_suppliers')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Accounting permissions  
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_customers', 'view_production_orders', 'view_purchase_orders', 'view_suppliers', 'view_inventory')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Car Wash Admin permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_admin'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_customers', 'manage_customers', 'view_production_orders', 'manage_production_orders', 'view_inventory', 'view_invoices')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Car Wash Employee permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_customers', 'view_production_orders', 'manage_production_orders', 'view_inventory', 'view_invoices')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Vendor Admin permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_admin'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_suppliers', 'manage_suppliers', 'view_purchase_orders', 'manage_purchase_orders', 'view_inventory', 'manage_inventory')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Vendor Employee permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_suppliers', 'view_purchase_orders', 'manage_purchase_orders', 'view_inventory')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Distributor Admin permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_admin'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_customers', 'manage_customers', 'view_production_orders', 'manage_production_orders', 'view_inventory', 'view_invoices', 'manage_invoices')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Add Distributor Employee permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.name IN ('view_customers', 'view_production_orders', 'manage_production_orders', 'view_inventory', 'view_invoices')
  AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();