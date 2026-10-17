-- Add RLS permissions for vendor and distributor roles

-- Vendor Admin role - supplier company admin access
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_admin'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Their own supplier data
  'own_suppliers_read', 'own_suppliers_edit',
  -- Their company users (full access)
  'company_users_read', 'company_users_create', 'company_users_edit', 'company_users_delete',
  -- Purchase orders (to see orders placed with them)
  'company_purchase_orders_read', 'company_purchase_orders_edit',
  -- Inventory they supply
  'company_inventory_items_read', 'company_inventory_items_edit'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Vendor Employee role - basic supplier access
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'vendor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Their supplier data (read only)
  'own_suppliers_read',
  -- Purchase orders (to fulfill them)
  'company_purchase_orders_read', 'company_purchase_orders_edit',
  -- Inventory they handle
  'company_inventory_items_read'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Distributor Admin role - distributor company admin access
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_admin'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Their own company data
  'own_companies_read', 'own_companies_edit',
  -- Their company users (full access)
  'company_users_read', 'company_users_create', 'company_users_edit', 'company_users_delete',
  -- Customer companies they distribute to
  'company_companies_read', 'company_companies_edit',
  -- Production orders in their network
  'company_production_orders_read', 'company_production_orders_create', 'company_production_orders_edit',
  -- Inventory they distribute
  'global_inventory_items_read',
  -- Their accounts and transactions
  'company_accounts_read', 'company_transactions_read'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Distributor Employee role - basic distributor access
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'distributor_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Their company data (read only)
  'own_companies_read',
  -- Customer companies (read only)
  'company_companies_read',
  -- Production orders (read and basic manage)
  'company_production_orders_read', 'company_production_orders_edit',
  -- Inventory view
  'global_inventory_items_read'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();