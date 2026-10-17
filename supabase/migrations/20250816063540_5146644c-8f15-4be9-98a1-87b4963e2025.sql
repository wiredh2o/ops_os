-- Phase 1: Remove redundant basic permissions that overlap with RLS/Field Security
-- Keep only essential feature-level and workflow permissions

-- First, let's remove redundant permissions by name patterns
DELETE FROM public.role_permissions 
WHERE permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name ~ '^(global|company|subordinates|own)_.*_(read|create|edit|delete|update)$'
  AND category NOT IN ('ui_features', 'workflows', 'system_admin')
);

-- Remove the redundant permission definitions
DELETE FROM public.permissions 
WHERE name ~ '^(global|company|subordinates|own)_.*_(read|create|edit|delete|update)$'
AND category NOT IN ('ui_features', 'workflows', 'system_admin');

-- Remove specific redundant permissions that are covered by RLS
DELETE FROM public.role_permissions 
WHERE permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'view_inventory', 'manage_inventory', 'view_assemblies', 'manage_assemblies',
    'view_production_orders', 'manage_production_orders', 'view_purchase_orders', 'manage_purchase_orders',
    'view_suppliers', 'manage_suppliers', 'view_companies', 'manage_companies',
    'view_customers', 'manage_customers', 'view_accounts', 'manage_accounts',
    'view_transactions', 'manage_transactions', 'view_users', 'manage_users',
    'view_repair_orders', 'manage_repair_orders', 'view_inbound_packages', 'manage_inbound_packages',
    'view_demand_analytics', 'manage_demand_analytics', 'view_inventory_reports', 'manage_inventory_reports',
    'view_production_reports', 'manage_production_reports', 'view_financial_reports', 'manage_financial_reports',
    'view_shipping_reports', 'manage_shipping_reports', 'view_receiving_reports', 'manage_receiving_reports',
    'view_customer_reports', 'manage_customer_reports', 'view_vendor_reports', 'manage_vendor_reports'
  )
);

DELETE FROM public.permissions 
WHERE name IN (
  'view_inventory', 'manage_inventory', 'view_assemblies', 'manage_assemblies',
  'view_production_orders', 'manage_production_orders', 'view_purchase_orders', 'manage_purchase_orders',
  'view_suppliers', 'manage_suppliers', 'view_companies', 'manage_companies',
  'view_customers', 'manage_customers', 'view_accounts', 'manage_accounts',
  'view_transactions', 'manage_transactions', 'view_users', 'manage_users',
  'view_repair_orders', 'manage_repair_orders', 'view_inbound_packages', 'manage_inbound_packages',
  'view_demand_analytics', 'manage_demand_analytics', 'view_inventory_reports', 'manage_inventory_reports',
  'view_production_reports', 'manage_production_reports', 'view_financial_reports', 'manage_financial_reports',
  'view_shipping_reports', 'manage_shipping_reports', 'view_receiving_reports', 'manage_receiving_reports',
  'view_customer_reports', 'manage_customer_reports', 'view_vendor_reports', 'manage_vendor_reports'
);

-- Add essential field-level permissions for high-priority sensitive data
INSERT INTO public.permissions (name, description, category, is_active) VALUES
-- Accounts sensitive fields
('global_accounts_account_number_read', 'Read account numbers globally', 'field_access', true),
('company_accounts_account_number_read', 'Read account numbers within company', 'field_access', true),
('own_accounts_account_number_read', 'Read own account numbers', 'field_access', true),
('global_accounts_current_balance_read', 'Read account balances globally', 'field_access', true),
('company_accounts_current_balance_read', 'Read account balances within company', 'field_access', true),
('own_accounts_current_balance_read', 'Read own account balances', 'field_access', true),

-- Financial transactions sensitive fields
('global_transactions_total_amount_read', 'Read transaction amounts globally', 'field_access', true),
('company_transactions_total_amount_read', 'Read transaction amounts within company', 'field_access', true),
('own_transactions_total_amount_read', 'Read own transaction amounts', 'field_access', true),

-- Customer sensitive fields
('global_companies_email_read', 'Read customer emails globally', 'field_access', true),
('company_companies_email_read', 'Read customer emails within company', 'field_access', true),
('global_companies_phone_read', 'Read customer phone numbers globally', 'field_access', true),
('company_companies_phone_read', 'Read customer phone numbers within company', 'field_access', true),
('global_companies_address_read', 'Read customer addresses globally', 'field_access', true),
('company_companies_address_read', 'Read customer addresses within company', 'field_access', true),
('global_companies_sales_tax_license_url_read', 'Read sales tax licenses globally', 'field_access', true),
('company_companies_sales_tax_license_url_read', 'Read sales tax licenses within company', 'field_access', true),

-- Inventory cost/pricing sensitive fields
('global_inventory_items_unit_price_read', 'Read inventory unit prices globally', 'field_access', true),
('company_inventory_items_unit_price_read', 'Read inventory unit prices within company', 'field_access', true),
('global_assemblies_selling_price_read', 'Read assembly selling prices globally', 'field_access', true),
('company_assemblies_selling_price_read', 'Read assembly selling prices within company', 'field_access', true),

-- Production order financial fields
('global_production_orders_total_amount_read', 'Read production order amounts globally', 'field_access', true),
('company_production_orders_total_amount_read', 'Read production order amounts within company', 'field_access', true),
('own_production_orders_total_amount_read', 'Read own production order amounts', 'field_access', true),

-- User profile sensitive fields
('global_profiles_email_read', 'Read user emails globally', 'field_access', true),
('company_profiles_email_read', 'Read user emails within company', 'field_access', true),
('own_profiles_email_read', 'Read own email', 'field_access', true);

-- Grant field-level permissions to appropriate roles
-- Admin gets global access to all fields
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'admin'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'field_access' AND p.name LIKE 'global_%';

-- Sales Support gets global read access to most fields except sensitive financial data
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'sales_support'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'field_access' 
AND p.name LIKE 'global_%' 
AND p.name NOT LIKE '%account_number%' 
AND p.name NOT LIKE '%current_balance%'
AND p.name NOT LIKE '%total_amount%';

-- Car Wash Admin gets company-level access to their data
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'car_wash_admin'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'field_access' AND p.name LIKE 'company_%';

-- Production gets company-level access to production-related fields
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'production'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'field_access' 
AND (p.name LIKE 'company_inventory_items_%' 
     OR p.name LIKE 'company_assemblies_%' 
     OR p.name LIKE 'company_production_orders_%');

-- Accounting gets company-level access to financial fields
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'accounting'::app_role, p.id, true
FROM public.permissions p 
WHERE p.category = 'field_access' 
AND (p.name LIKE 'company_accounts_%' 
     OR p.name LIKE 'company_transactions_%');

-- Update permission checking logic to prioritize granular permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_name text, _target_company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if it's a granular permission (RLS or field-level)
  IF _permission_name ~ '^(own|company|subordinates|global)_.*_(read|create|edit|delete)$' THEN
    RETURN has_granular_permission(_user_id, _permission_name, _target_company_id);
  END IF;
  
  -- Also check for legacy "update" pattern during transition
  IF _permission_name ~ '^(own|company|subordinates|global)_.*_update$' THEN
    -- Convert update to edit and check
    RETURN has_granular_permission(_user_id, REPLACE(_permission_name, '_update', '_edit'), _target_company_id);
  END IF;
  
  -- Fallback to basic permission system for remaining functional permissions
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = _user_id
      AND p.name = _permission_name
      AND rp.is_granted = true
      AND p.is_active = true
  );
END;
$function$;