-- Completely remove inappropriate permissions from car wash roles
-- This will make them disappear from the permission matrix UI entirely

-- Remove all inventory-related permissions from car wash roles
DELETE FROM public.role_permissions 
WHERE role IN ('car_wash_admin', 'car_wash_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%inventory%' 
  AND name NOT LIKE 'own_inventory%'  -- Keep own inventory permissions for employees
);

-- Remove all purchase order permissions from car wash roles
DELETE FROM public.role_permissions 
WHERE role IN ('car_wash_admin', 'car_wash_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%purchase_orders%'
);

-- Remove all vendor management permissions from car wash roles
DELETE FROM public.role_permissions 
WHERE role IN ('car_wash_admin', 'car_wash_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%vendors%'
);

-- Remove all assembly management permissions from car wash roles
DELETE FROM public.role_permissions 
WHERE role IN ('car_wash_admin', 'car_wash_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%assemblies%'
);

-- Remove all financial/accounting permissions from car wash roles
DELETE FROM public.role_permissions 
WHERE role IN ('car_wash_admin', 'car_wash_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%financials%' 
  OR name LIKE '%accounting%'
  OR name LIKE '%transaction%'
  OR name LIKE '%reconciliation%'
);

-- Remove internal production order management from car wash roles
DELETE FROM public.role_permissions 
WHERE role IN ('car_wash_admin', 'car_wash_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'manage_production_orders',
    'view_production_orders',
    'company_production_orders_create',
    'company_production_orders_edit',
    'company_production_orders_delete',
    'subordinates_production_orders_create',
    'subordinates_production_orders_edit',
    'subordinates_production_orders_delete',
    'global_production_orders_create',
    'global_production_orders_edit',
    'global_production_orders_delete'
  )
);