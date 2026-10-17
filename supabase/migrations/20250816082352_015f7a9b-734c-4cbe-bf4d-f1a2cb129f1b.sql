-- Add missing RLS permissions for roles that have none
-- These are the granular data access permissions that should show in the RLS Permission Matrix

-- Production role - needs to see/manage production workflow data
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'production'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Production orders (full access)
  'company_production_orders_read', 'company_production_orders_create', 'company_production_orders_edit', 'company_production_orders_delete',
  'global_production_orders_read',
  -- Inventory (full access for production)
  'company_inventory_items_read', 'company_inventory_items_create', 'company_inventory_items_edit', 'company_inventory_items_delete',
  'global_inventory_items_read',
  -- Purchase orders (for ordering materials)
  'company_purchase_orders_read', 'company_purchase_orders_create', 'company_purchase_orders_edit',
  -- Suppliers (for working with vendors)
  'company_suppliers_read', 'company_suppliers_edit',
  -- Users (basic read access)
  'company_users_read',
  -- Assemblies (full access)
  'company_assemblies_read', 'company_assemblies_create', 'company_assemblies_edit', 'company_assemblies_delete'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Accounting role - needs to see financial and operational data
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'accounting'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Accounts (full access)
  'company_accounts_read', 'company_accounts_create', 'company_accounts_edit', 'company_accounts_delete',
  'global_accounts_read',
  -- Transactions (full access)
  'company_transactions_read', 'company_transactions_create', 'company_transactions_edit', 'company_transactions_delete',
  'global_transactions_read',
  -- Production orders (read for revenue tracking)
  'company_production_orders_read', 'global_production_orders_read',
  -- Purchase orders (read for expense tracking)
  'company_purchase_orders_read', 'global_purchase_orders_read',
  -- Customers/companies (read for billing)
  'company_companies_read', 'global_companies_read',
  -- Users (basic read)
  'company_users_read',
  -- Inventory (read for cost accounting)
  'company_inventory_items_read', 'global_inventory_items_read'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Car Wash Admin role - customer company admin access
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_admin'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Their own company data (full access)
  'own_companies_read', 'own_companies_edit',
  -- Their company users (full access)
  'company_users_read', 'company_users_create', 'company_users_edit', 'company_users_delete',
  -- Their company production orders
  'company_production_orders_read', 'company_production_orders_create', 'company_production_orders_edit',
  -- Inventory view (to see what's available)
  'global_inventory_items_read',
  -- Their own accounts and transactions
  'own_accounts_read', 'own_transactions_read'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();

-- Car Wash Employee role - basic customer access
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'car_wash_employee'::app_role,
  p.id,
  true,
  auth.uid(),
  now()
FROM public.permissions p
WHERE p.category = 'rls' 
AND p.name IN (
  -- Their company data (read only)
  'own_companies_read',
  -- Their company users (read only)
  'company_users_read',
  -- Their company production orders (read and basic create)
  'company_production_orders_read', 'company_production_orders_create',
  -- Inventory view (to see what's available)
  'global_inventory_items_read'
)
AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET
  is_granted = true,
  granted_by = auth.uid(),
  granted_at = now();