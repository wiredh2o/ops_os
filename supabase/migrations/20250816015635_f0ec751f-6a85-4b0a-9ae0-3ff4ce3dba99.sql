-- Clean up inappropriate permissions for car_wash_admin role
-- Car wash admins should only manage their own company's operations, not internal WashGear business

-- Remove inventory management permissions (not relevant to car wash operations)
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role = 'car_wash_admin' 
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'company_inventory_read',
    'subordinates_assemblies_create',
    'subordinates_assemblies_delete', 
    'subordinates_assemblies_edit',
    'subordinates_assemblies_read',
    'subordinates_inventory_create',
    'subordinates_inventory_delete',
    'subordinates_inventory_edit', 
    'subordinates_inventory_read',
    'view_inventory'
  )
);

-- Remove purchasing permissions (car washes don't manage WashGear's purchasing)
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role = 'car_wash_admin' 
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'subordinates_purchase_orders_create',
    'subordinates_purchase_orders_delete',
    'subordinates_purchase_orders_edit',
    'subordinates_purchase_orders_read'
  )
);

-- Remove vendor management permissions (car washes don't manage WashGear's vendors)
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role = 'car_wash_admin' 
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'subordinates_vendors_create',
    'subordinates_vendors_delete',
    'subordinates_vendors_edit',
    'subordinates_vendors_read'
  )
);

-- Remove production order permissions (car washes don't manage WashGear's production)
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role = 'car_wash_admin' 
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'company_production_orders_create',
    'company_production_orders_edit',
    'company_production_orders_read',
    'manage_production_orders',
    'subordinates_production_orders_create',
    'subordinates_production_orders_edit',
    'subordinates_production_orders_read',
    'view_production_orders'
  )
);

-- Remove financial management permissions (car washes shouldn't manage WashGear financials)
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role = 'car_wash_admin' 
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'company_financials_create',
    'company_financials_read',
    'subordinates_financials_create',
    'subordinates_financials_delete',
    'subordinates_financials_edit',
    'subordinates_financials_read'
  )
);

-- Log the permission cleanup
INSERT INTO public.permission_changes (
  role, permission_name, old_value, new_value, changed_by, reason
) 
SELECT 
  'car_wash_admin'::app_role,
  p.name,
  true,
  false,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'Role scope cleanup - removed inappropriate internal WashGear permissions'
FROM public.permissions p
WHERE p.name IN (
  'company_inventory_read', 'subordinates_assemblies_create', 'subordinates_assemblies_delete', 
  'subordinates_assemblies_edit', 'subordinates_assemblies_read', 'subordinates_inventory_create',
  'subordinates_inventory_delete', 'subordinates_inventory_edit', 'subordinates_inventory_read',
  'view_inventory', 'subordinates_purchase_orders_create', 'subordinates_purchase_orders_delete',
  'subordinates_purchase_orders_edit', 'subordinates_purchase_orders_read', 'subordinates_vendors_create',
  'subordinates_vendors_delete', 'subordinates_vendors_edit', 'subordinates_vendors_read',
  'company_production_orders_create', 'company_production_orders_edit', 'company_production_orders_read',
  'manage_production_orders', 'subordinates_production_orders_create', 'subordinates_production_orders_edit',
  'subordinates_production_orders_read', 'view_production_orders', 'company_financials_create',
  'company_financials_read', 'subordinates_financials_create', 'subordinates_financials_delete',
  'subordinates_financials_edit', 'subordinates_financials_read'
);