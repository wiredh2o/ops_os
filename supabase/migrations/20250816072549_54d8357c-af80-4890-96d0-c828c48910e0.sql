-- Create comprehensive RLS permissions for the permission matrix
-- Pattern: {scope}_{resource}_{action}

-- Insert RLS permissions for accounts
INSERT INTO public.permissions (name, description, category) VALUES
-- Global scope (admin/sales_support only)
('global_accounts_read', 'View all accounts across all companies globally', 'rls'),
('global_accounts_create', 'Create accounts for any company globally', 'rls'),
('global_accounts_edit', 'Edit all accounts across all companies globally', 'rls'),
('global_accounts_delete', 'Delete accounts from any company globally', 'rls'),

-- Company scope (same company access)
('company_accounts_read', 'View accounts within user''s company', 'rls'),
('company_accounts_create', 'Create accounts within user''s company', 'rls'),
('company_accounts_edit', 'Edit accounts within user''s company', 'rls'),
('company_accounts_delete', 'Delete accounts within user''s company', 'rls'),

-- Own scope (personal access only)
('own_accounts_read', 'View accounts created by the user', 'rls'),
('own_accounts_create', 'Create accounts as the user', 'rls'),
('own_accounts_edit', 'Edit accounts created by the user', 'rls'),
('own_accounts_delete', 'Delete accounts created by the user', 'rls'),

-- Production Orders RLS permissions
('global_production_orders_read', 'View all production orders across all companies', 'rls'),
('global_production_orders_create', 'Create production orders for any company', 'rls'),
('global_production_orders_edit', 'Edit all production orders across all companies', 'rls'),
('global_production_orders_delete', 'Delete production orders from any company', 'rls'),

('company_production_orders_read', 'View production orders within user''s company', 'rls'),
('company_production_orders_create', 'Create production orders within user''s company', 'rls'),
('company_production_orders_edit', 'Edit production orders within user''s company', 'rls'),
('company_production_orders_delete', 'Delete production orders within user''s company', 'rls'),

('own_production_orders_read', 'View production orders created by the user', 'rls'),
('own_production_orders_create', 'Create production orders as the user', 'rls'),
('own_production_orders_edit', 'Edit production orders created by the user', 'rls'),
('own_production_orders_delete', 'Delete production orders created by the user', 'rls'),

-- Inventory Items RLS permissions
('global_inventory_items_read', 'View all inventory items across all companies', 'rls'),
('global_inventory_items_create', 'Create inventory items globally', 'rls'),
('global_inventory_items_edit', 'Edit all inventory items globally', 'rls'),
('global_inventory_items_delete', 'Delete inventory items globally', 'rls'),

('company_inventory_items_read', 'View inventory items within user''s company context', 'rls'),
('company_inventory_items_create', 'Create inventory items within user''s company context', 'rls'),
('company_inventory_items_edit', 'Edit inventory items within user''s company context', 'rls'),
('company_inventory_items_delete', 'Delete inventory items within user''s company context', 'rls'),

('own_inventory_items_read', 'View inventory items created by the user', 'rls'),
('own_inventory_items_create', 'Create inventory items as the user', 'rls'),
('own_inventory_items_edit', 'Edit inventory items created by the user', 'rls'),
('own_inventory_items_delete', 'Delete inventory items created by the user', 'rls'),

-- Assemblies RLS permissions
('global_assemblies_read', 'View all assemblies across all companies', 'rls'),
('global_assemblies_create', 'Create assemblies globally', 'rls'),
('global_assemblies_edit', 'Edit all assemblies globally', 'rls'),
('global_assemblies_delete', 'Delete assemblies globally', 'rls'),

('company_assemblies_read', 'View assemblies within user''s company context', 'rls'),
('company_assemblies_create', 'Create assemblies within user''s company context', 'rls'),
('company_assemblies_edit', 'Edit assemblies within user''s company context', 'rls'),
('company_assemblies_delete', 'Delete assemblies within user''s company context', 'rls'),

('own_assemblies_read', 'View assemblies created by the user', 'rls'),
('own_assemblies_create', 'Create assemblies as the user', 'rls'),
('own_assemblies_edit', 'Edit assemblies created by the user', 'rls'),
('own_assemblies_delete', 'Delete assemblies created by the user', 'rls'),

-- Companies RLS permissions
('global_companies_read', 'View all companies globally', 'rls'),
('global_companies_create', 'Create companies globally', 'rls'),
('global_companies_edit', 'Edit all companies globally', 'rls'),
('global_companies_delete', 'Delete companies globally', 'rls'),

('company_companies_read', 'View company information within user''s company', 'rls'),
('company_companies_edit', 'Edit user''s own company information', 'rls'),

('own_companies_read', 'View companies created by the user', 'rls'),
('own_companies_create', 'Create companies as the user', 'rls'),
('own_companies_edit', 'Edit companies created by the user', 'rls'),

-- Users RLS permissions
('global_users_read', 'View all users across all companies', 'rls'),
('global_users_create', 'Create users for any company', 'rls'),
('global_users_edit', 'Edit all users across all companies', 'rls'),
('global_users_delete', 'Delete users from any company', 'rls'),

('company_users_read', 'View users within user''s company', 'rls'),
('company_users_create', 'Create users within user''s company', 'rls'),
('company_users_edit', 'Edit users within user''s company', 'rls'),
('company_users_delete', 'Delete users within user''s company', 'rls'),

('subordinates_users_read', 'View subordinate users', 'rls'),
('subordinates_users_edit', 'Edit subordinate users', 'rls'),
('subordinates_users_delete', 'Delete subordinate users', 'rls'),

('own_profile_read', 'View own user profile', 'rls'),
('own_profile_edit', 'Edit own user profile', 'rls'),

-- Purchase Orders RLS permissions
('global_purchase_orders_read', 'View all purchase orders across all companies', 'rls'),
('global_purchase_orders_create', 'Create purchase orders for any company', 'rls'),
('global_purchase_orders_edit', 'Edit all purchase orders across all companies', 'rls'),
('global_purchase_orders_delete', 'Delete purchase orders from any company', 'rls'),

('company_purchase_orders_read', 'View purchase orders within user''s company', 'rls'),
('company_purchase_orders_create', 'Create purchase orders within user''s company', 'rls'),
('company_purchase_orders_edit', 'Edit purchase orders within user''s company', 'rls'),
('company_purchase_orders_delete', 'Delete purchase orders within user''s company', 'rls'),

('own_purchase_orders_read', 'View purchase orders created by the user', 'rls'),
('own_purchase_orders_create', 'Create purchase orders as the user', 'rls'),
('own_purchase_orders_edit', 'Edit purchase orders created by the user', 'rls'),
('own_purchase_orders_delete', 'Delete purchase orders created by the user', 'rls'),

-- Suppliers RLS permissions
('global_suppliers_read', 'View all suppliers globally', 'rls'),
('global_suppliers_create', 'Create suppliers globally', 'rls'),
('global_suppliers_edit', 'Edit all suppliers globally', 'rls'),
('global_suppliers_delete', 'Delete suppliers globally', 'rls'),

('company_suppliers_read', 'View suppliers accessible to user''s company', 'rls'),
('company_suppliers_create', 'Create suppliers for user''s company', 'rls'),
('company_suppliers_edit', 'Edit suppliers accessible to user''s company', 'rls'),
('company_suppliers_delete', 'Delete suppliers accessible to user''s company', 'rls'),

('own_suppliers_read', 'View suppliers created by the user', 'rls'),
('own_suppliers_create', 'Create suppliers as the user', 'rls'),
('own_suppliers_edit', 'Edit suppliers created by the user', 'rls'),
('own_suppliers_delete', 'Delete suppliers created by the user', 'rls'),

-- Repair Orders RLS permissions
('global_repair_orders_read', 'View all repair orders across all companies', 'rls'),
('global_repair_orders_create', 'Create repair orders for any company', 'rls'),
('global_repair_orders_edit', 'Edit all repair orders across all companies', 'rls'),
('global_repair_orders_delete', 'Delete repair orders from any company', 'rls'),

('company_repair_orders_read', 'View repair orders within user''s company', 'rls'),
('company_repair_orders_create', 'Create repair orders within user''s company', 'rls'),
('company_repair_orders_edit', 'Edit repair orders within user''s company', 'rls'),
('company_repair_orders_delete', 'Delete repair orders within user''s company', 'rls'),

('own_repair_orders_read', 'View repair orders created by the user', 'rls'),
('own_repair_orders_create', 'Create repair orders as the user', 'rls'),
('own_repair_orders_edit', 'Edit repair orders created by the user', 'rls'),
('own_repair_orders_delete', 'Delete repair orders created by the user', 'rls'),

-- Transactions RLS permissions  
('global_transactions_read', 'View all transactions across all companies', 'rls'),
('global_transactions_create', 'Create transactions for any company', 'rls'),
('global_transactions_edit', 'Edit all transactions across all companies', 'rls'),
('global_transactions_delete', 'Delete transactions from any company', 'rls'),

('company_transactions_read', 'View transactions within user''s company', 'rls'),
('company_transactions_create', 'Create transactions within user''s company', 'rls'),
('company_transactions_edit', 'Edit transactions within user''s company', 'rls'),
('company_transactions_delete', 'Delete transactions within user''s company', 'rls'),

('own_transactions_read', 'View transactions created by the user', 'rls'),
('own_transactions_create', 'Create transactions as the user', 'rls'),
('own_transactions_edit', 'Edit transactions created by the user', 'rls'),
('own_transactions_delete', 'Delete transactions created by the user', 'rls')

ON CONFLICT (name) DO NOTHING;

-- Set up initial role permission assignments
-- Admin gets global access to everything
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'admin'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'rls' AND p.name LIKE 'global_%'
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Sales Support gets global read access and company-level management
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'sales_support'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'rls' AND (
  p.name LIKE 'global_%_read' OR 
  p.name LIKE 'company_%' OR
  p.name LIKE 'own_%'
)
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Production gets company and own level access for relevant resources
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'production'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'rls' AND (
  p.name LIKE 'company_production_orders_%' OR
  p.name LIKE 'company_inventory_items_%' OR
  p.name LIKE 'company_assemblies_%' OR
  p.name LIKE 'company_purchase_orders_%' OR
  p.name LIKE 'company_suppliers_%' OR
  p.name LIKE 'company_repair_orders_%' OR
  p.name LIKE 'own_%'
)
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Accounting gets company-level access to financial resources
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'accounting'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'rls' AND (
  p.name LIKE 'company_accounts_%' OR
  p.name LIKE 'company_transactions_%' OR
  p.name LIKE 'company_purchase_orders_read' OR
  p.name LIKE 'company_production_orders_read' OR
  p.name LIKE 'own_%'
)
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Car Wash Admin gets company-level access to their data
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'car_wash_admin'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'rls' AND (
  p.name LIKE 'company_%' OR
  p.name LIKE 'own_%'
)
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Distributor Employee gets limited company access
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'distributor_employee'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'rls' AND (
  p.name LIKE 'company_production_orders_read' OR
  p.name LIKE 'company_inventory_items_read' OR
  p.name LIKE 'company_assemblies_read' OR
  p.name LIKE 'own_%'
)
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Vendor Employee gets very limited access
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'vendor_employee'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'rls' AND (
  p.name LIKE 'own_profile_%' OR
  p.name LIKE 'company_repair_orders_read'
)
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;