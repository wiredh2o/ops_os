-- First, let's create the actual RLS permission records that are missing
-- These are the granular permissions that follow the {scope}_{resource}_{action} pattern

INSERT INTO public.permissions (name, description, category, is_active) VALUES
-- User management permissions
('global_users_read', 'Read users across all companies', 'rls', true),
('global_users_create', 'Create users across all companies', 'rls', true),
('global_users_edit', 'Edit users across all companies', 'rls', true),
('global_users_delete', 'Delete users across all companies', 'rls', true),
('company_users_read', 'Read users within same company', 'rls', true),
('company_users_create', 'Create users within same company', 'rls', true),
('company_users_edit', 'Edit users within same company', 'rls', true),
('company_users_delete', 'Delete users within same company', 'rls', true),
('subordinates_users_read', 'Read subordinate users', 'rls', true),
('subordinates_users_create', 'Create subordinate users', 'rls', true),
('subordinates_users_edit', 'Edit subordinate users', 'rls', true),
('subordinates_users_delete', 'Delete subordinate users', 'rls', true),
('own_users_read', 'Read own user data', 'rls', true),
('own_users_edit', 'Edit own user data', 'rls', true),

-- Inventory management permissions
('global_inventory_items_read', 'Read inventory items across all companies', 'rls', true),
('global_inventory_items_create', 'Create inventory items across all companies', 'rls', true),
('global_inventory_items_edit', 'Edit inventory items across all companies', 'rls', true),
('global_inventory_items_delete', 'Delete inventory items across all companies', 'rls', true),
('company_inventory_items_read', 'Read inventory items within same company', 'rls', true),
('company_inventory_items_create', 'Create inventory items within same company', 'rls', true),
('company_inventory_items_edit', 'Edit inventory items within same company', 'rls', true),
('company_inventory_items_delete', 'Delete inventory items within same company', 'rls', true),
('own_inventory_items_read', 'Read own inventory items', 'rls', true),
('own_inventory_items_create', 'Create own inventory items', 'rls', true),
('own_inventory_items_edit', 'Edit own inventory items', 'rls', true),
('own_inventory_items_delete', 'Delete own inventory items', 'rls', true),

-- Production order permissions
('global_production_orders_read', 'Read production orders across all companies', 'rls', true),
('global_production_orders_create', 'Create production orders across all companies', 'rls', true),
('global_production_orders_edit', 'Edit production orders across all companies', 'rls', true),
('global_production_orders_delete', 'Delete production orders across all companies', 'rls', true),
('company_production_orders_read', 'Read production orders within same company', 'rls', true),
('company_production_orders_create', 'Create production orders within same company', 'rls', true),
('company_production_orders_edit', 'Edit production orders within same company', 'rls', true),
('company_production_orders_delete', 'Delete production orders within same company', 'rls', true),
('own_production_orders_read', 'Read own production orders', 'rls', true),
('own_production_orders_create', 'Create own production orders', 'rls', true),
('own_production_orders_edit', 'Edit own production orders', 'rls', true),
('own_production_orders_delete', 'Delete own production orders', 'rls', true),

-- Purchase order permissions
('global_purchase_orders_read', 'Read purchase orders across all companies', 'rls', true),
('global_purchase_orders_create', 'Create purchase orders across all companies', 'rls', true),
('global_purchase_orders_edit', 'Edit purchase orders across all companies', 'rls', true),
('global_purchase_orders_delete', 'Delete purchase orders across all companies', 'rls', true),
('company_purchase_orders_read', 'Read purchase orders within same company', 'rls', true),
('company_purchase_orders_create', 'Create purchase orders within same company', 'rls', true),
('company_purchase_orders_edit', 'Edit purchase orders within same company', 'rls', true),
('company_purchase_orders_delete', 'Delete purchase orders within same company', 'rls', true),

-- Assembly permissions
('global_assemblies_read', 'Read assemblies across all companies', 'rls', true),
('global_assemblies_create', 'Create assemblies across all companies', 'rls', true),
('global_assemblies_edit', 'Edit assemblies across all companies', 'rls', true),
('global_assemblies_delete', 'Delete assemblies across all companies', 'rls', true),
('company_assemblies_read', 'Read assemblies within same company', 'rls', true),
('company_assemblies_create', 'Create assemblies within same company', 'rls', true),
('company_assemblies_edit', 'Edit assemblies within same company', 'rls', true),
('company_assemblies_delete', 'Delete assemblies within same company', 'rls', true),

-- Supplier permissions
('global_suppliers_read', 'Read suppliers across all companies', 'rls', true),
('global_suppliers_create', 'Create suppliers across all companies', 'rls', true),
('global_suppliers_edit', 'Edit suppliers across all companies', 'rls', true),
('global_suppliers_delete', 'Delete suppliers across all companies', 'rls', true),
('company_suppliers_read', 'Read suppliers within same company', 'rls', true),
('company_suppliers_create', 'Create suppliers within same company', 'rls', true),
('company_suppliers_edit', 'Edit suppliers within same company', 'rls', true),
('company_suppliers_delete', 'Delete suppliers within same company', 'rls', true),
('own_suppliers_read', 'Read own supplier data', 'rls', true),
('own_suppliers_edit', 'Edit own supplier data', 'rls', true),

-- Account permissions  
('global_accounts_read', 'Read accounts across all companies', 'rls', true),
('global_accounts_create', 'Create accounts across all companies', 'rls', true),
('global_accounts_edit', 'Edit accounts across all companies', 'rls', true),
('global_accounts_delete', 'Delete accounts across all companies', 'rls', true),
('company_accounts_read', 'Read accounts within same company', 'rls', true),
('company_accounts_create', 'Create accounts within same company', 'rls', true),
('company_accounts_edit', 'Edit accounts within same company', 'rls', true),
('company_accounts_delete', 'Delete accounts within same company', 'rls', true),
('own_accounts_read', 'Read own accounts', 'rls', true),
('own_accounts_edit', 'Edit own accounts', 'rls', true),

-- Transaction permissions
('global_transactions_read', 'Read transactions across all companies', 'rls', true),
('global_transactions_create', 'Create transactions across all companies', 'rls', true),
('global_transactions_edit', 'Edit transactions across all companies', 'rls', true),
('global_transactions_delete', 'Delete transactions across all companies', 'rls', true),
('company_transactions_read', 'Read transactions within same company', 'rls', true),
('company_transactions_create', 'Create transactions within same company', 'rls', true),
('company_transactions_edit', 'Edit transactions within same company', 'rls', true),
('company_transactions_delete', 'Delete transactions within same company', 'rls', true),
('own_transactions_read', 'Read own transactions', 'rls', true),
('own_transactions_edit', 'Edit own transactions', 'rls', true),

-- Company permissions
('global_companies_read', 'Read companies across all companies', 'rls', true),
('global_companies_create', 'Create companies across all companies', 'rls', true),
('global_companies_edit', 'Edit companies across all companies', 'rls', true),
('global_companies_delete', 'Delete companies across all companies', 'rls', true),
('company_companies_read', 'Read companies within same company', 'rls', true),
('company_companies_create', 'Create companies within same company', 'rls', true),
('company_companies_edit', 'Edit companies within same company', 'rls', true),
('company_companies_delete', 'Delete companies within same company', 'rls', true),
('own_companies_read', 'Read own company data', 'rls', true),
('own_companies_edit', 'Edit own company data', 'rls', true)

ON CONFLICT (name) DO NOTHING;