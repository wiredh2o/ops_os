-- Add missing "own" and "subordinates" scope permissions for complete resource coverage

-- Production Orders (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_production_orders_read', 'Read own production orders', 'production', true),
    ('own_production_orders_create', 'Create own production orders', 'production', true),
    ('own_production_orders_edit', 'Edit own production orders', 'production', true),
    ('own_production_orders_delete', 'Delete own production orders', 'production', true)
ON CONFLICT (name) DO NOTHING;

-- Production Orders (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_production_orders_read', 'Read production orders for subordinates', 'production', true),
    ('subordinates_production_orders_create', 'Create production orders for subordinates', 'production', true),
    ('subordinates_production_orders_edit', 'Edit production orders for subordinates', 'production', true),
    ('subordinates_production_orders_delete', 'Delete production orders for subordinates', 'production', true)
ON CONFLICT (name) DO NOTHING;

-- Inventory (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_inventory_read', 'Read own assigned inventory items', 'inventory', true),
    ('own_inventory_edit', 'Edit own assigned inventory items', 'inventory', true)
ON CONFLICT (name) DO NOTHING;

-- Inventory (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_inventory_read', 'Read inventory items for subordinates', 'inventory', true),
    ('subordinates_inventory_create', 'Create inventory items for subordinates', 'inventory', true),
    ('subordinates_inventory_edit', 'Edit inventory items for subordinates', 'inventory', true),
    ('subordinates_inventory_delete', 'Delete inventory items for subordinates', 'inventory', true)
ON CONFLICT (name) DO NOTHING;

-- Assemblies (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_assemblies_read', 'Read own assigned assemblies', 'inventory', true),
    ('own_assemblies_edit', 'Edit own assigned assemblies', 'inventory', true)
ON CONFLICT (name) DO NOTHING;

-- Assemblies (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_assemblies_read', 'Read assemblies for subordinates', 'inventory', true),
    ('subordinates_assemblies_create', 'Create assemblies for subordinates', 'inventory', true),
    ('subordinates_assemblies_edit', 'Edit assemblies for subordinates', 'inventory', true),
    ('subordinates_assemblies_delete', 'Delete assemblies for subordinates', 'inventory', true)
ON CONFLICT (name) DO NOTHING;

-- Customers (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_customers_read', 'Read own assigned customers', 'customer_management', true),
    ('own_customers_edit', 'Edit own assigned customers', 'customer_management', true)
ON CONFLICT (name) DO NOTHING;

-- Customers (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_customers_read', 'Read customers for subordinates', 'customer_management', true),
    ('subordinates_customers_create', 'Create customers for subordinates', 'customer_management', true),
    ('subordinates_customers_edit', 'Edit customers for subordinates', 'customer_management', true),
    ('subordinates_customers_delete', 'Delete customers for subordinates', 'customer_management', true)
ON CONFLICT (name) DO NOTHING;

-- Vendors (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_vendors_read', 'Read own assigned vendors', 'vendor_management', true),
    ('own_vendors_edit', 'Edit own assigned vendors', 'vendor_management', true)
ON CONFLICT (name) DO NOTHING;

-- Vendors (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_vendors_read', 'Read vendors for subordinates', 'vendor_management', true),
    ('subordinates_vendors_create', 'Create vendors for subordinates', 'vendor_management', true),
    ('subordinates_vendors_edit', 'Edit vendors for subordinates', 'vendor_management', true),
    ('subordinates_vendors_delete', 'Delete vendors for subordinates', 'vendor_management', true)
ON CONFLICT (name) DO NOTHING;

-- Purchase Orders (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_purchase_orders_read', 'Read own purchase orders', 'purchasing', true),
    ('own_purchase_orders_create', 'Create own purchase orders', 'purchasing', true),
    ('own_purchase_orders_edit', 'Edit own purchase orders', 'purchasing', true),
    ('own_purchase_orders_delete', 'Delete own purchase orders', 'purchasing', true)
ON CONFLICT (name) DO NOTHING;

-- Purchase Orders (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_purchase_orders_read', 'Read purchase orders for subordinates', 'purchasing', true),
    ('subordinates_purchase_orders_create', 'Create purchase orders for subordinates', 'purchasing', true),
    ('subordinates_purchase_orders_edit', 'Edit purchase orders for subordinates', 'purchasing', true),
    ('subordinates_purchase_orders_delete', 'Delete purchase orders for subordinates', 'purchasing', true)
ON CONFLICT (name) DO NOTHING;

-- Repair Orders (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_repair_orders_read', 'Read own repair orders', 'repairs', true),
    ('own_repair_orders_create', 'Create own repair orders', 'repairs', true),
    ('own_repair_orders_edit', 'Edit own repair orders', 'repairs', true),
    ('own_repair_orders_delete', 'Delete own repair orders', 'repairs', true)
ON CONFLICT (name) DO NOTHING;

-- Repair Orders (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_repair_orders_read', 'Read repair orders for subordinates', 'repairs', true),
    ('subordinates_repair_orders_create', 'Create repair orders for subordinates', 'repairs', true),
    ('subordinates_repair_orders_edit', 'Edit repair orders for subordinates', 'repairs', true),
    ('subordinates_repair_orders_delete', 'Delete repair orders for subordinates', 'repairs', true)
ON CONFLICT (name) DO NOTHING;

-- Financials (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_financials_read', 'Read own financial data', 'accounting', true)
ON CONFLICT (name) DO NOTHING;

-- Financials (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_financials_read', 'Read financial data for subordinates', 'accounting', true),
    ('subordinates_financials_create', 'Create financial entries for subordinates', 'accounting', true),
    ('subordinates_financials_edit', 'Edit financial entries for subordinates', 'accounting', true),
    ('subordinates_financials_delete', 'Delete financial entries for subordinates', 'accounting', true)
ON CONFLICT (name) DO NOTHING;

-- Settings (own scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_settings_read', 'Read own settings and preferences', 'system', true),
    ('own_settings_edit', 'Edit own settings and preferences', 'system', true)
ON CONFLICT (name) DO NOTHING;

-- Settings (subordinates scope)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('subordinates_settings_read', 'Read settings for subordinates', 'system', true),
    ('subordinates_settings_edit', 'Edit settings for subordinates', 'system', true)
ON CONFLICT (name) DO NOTHING;

-- Now assign appropriate permissions to employee roles
-- Car Wash Employee permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by) 
SELECT 
    'car_wash_employee'::app_role, 
    p.id, 
    true, 
    NULL
FROM public.permissions p 
WHERE p.name IN (
    'own_production_orders_read',
    'own_production_orders_create', 
    'own_production_orders_edit',
    'own_repair_orders_read',
    'own_repair_orders_create',
    'own_repair_orders_edit',
    'own_customers_read',
    'own_customers_edit',
    'own_inventory_read',
    'own_settings_read',
    'own_settings_edit'
) AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Distributor Employee permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by) 
SELECT 
    'distributor_employee'::app_role, 
    p.id, 
    true, 
    NULL
FROM public.permissions p 
WHERE p.name IN (
    'own_production_orders_read',
    'own_production_orders_create',
    'own_production_orders_edit',
    'own_customers_read',
    'own_customers_edit',
    'own_inventory_read',
    'own_purchase_orders_read',
    'own_purchase_orders_create',
    'own_purchase_orders_edit',
    'own_settings_read',
    'own_settings_edit'
) AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Vendor Employee permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by) 
SELECT 
    'vendor_employee'::app_role, 
    p.id, 
    true, 
    NULL
FROM public.permissions p 
WHERE p.name IN (
    'own_production_orders_read',
    'own_production_orders_create',
    'own_production_orders_edit',
    'own_inventory_read',
    'own_purchase_orders_read',
    'own_purchase_orders_create',
    'own_purchase_orders_edit',
    'own_settings_read',
    'own_settings_edit'
) AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Admin roles get subordinates permissions
-- Car Wash Admin subordinates permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by) 
SELECT 
    'car_wash_admin'::app_role, 
    p.id, 
    true, 
    NULL
FROM public.permissions p 
WHERE p.name LIKE 'subordinates_%' AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Distributor Admin subordinates permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by) 
SELECT 
    'distributor_admin'::app_role, 
    p.id, 
    true, 
    NULL
FROM public.permissions p 
WHERE p.name LIKE 'subordinates_%' AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Vendor Admin subordinates permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by) 
SELECT 
    'vendor_admin'::app_role, 
    p.id, 
    true, 
    NULL
FROM public.permissions p 
WHERE p.name LIKE 'subordinates_%' AND p.is_active = true
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;