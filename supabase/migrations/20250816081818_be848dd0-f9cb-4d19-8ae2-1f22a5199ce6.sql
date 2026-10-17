-- Create the missing functional permissions that roles need
-- These are the functional permissions that don't exist yet but are needed for role workflows

-- Customer management permissions
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('view_customers', 'View customer/company information and profiles', 'customer', true),
('manage_customers', 'Create and edit customer/company information and settings', 'customer', true)
ON CONFLICT (name) DO NOTHING;

-- Production order permissions  
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('view_production_orders', 'View production and customer orders', 'production', true),
('manage_production_orders', 'Create and edit production and customer orders', 'production', true)
ON CONFLICT (name) DO NOTHING;

-- Inventory permissions
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('view_inventory', 'View inventory items and stock levels', 'inventory', true),
('manage_inventory', 'Create and edit inventory items and stock levels', 'inventory', true)
ON CONFLICT (name) DO NOTHING;

-- Purchase order permissions
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('view_purchase_orders', 'View purchase orders and supplier orders', 'purchasing', true),
('manage_purchase_orders', 'Create and edit purchase orders to suppliers', 'purchasing', true)
ON CONFLICT (name) DO NOTHING;

-- Supplier/vendor permissions
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('view_suppliers', 'View supplier/vendor information and profiles', 'purchasing', true),
('manage_suppliers', 'Create and edit supplier/vendor information', 'purchasing', true)
ON CONFLICT (name) DO NOTHING;

-- Invoice permissions (additional ones not already existing)
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('view_invoices', 'View customer invoices and billing information', 'accounting', true)
ON CONFLICT (name) DO NOTHING;