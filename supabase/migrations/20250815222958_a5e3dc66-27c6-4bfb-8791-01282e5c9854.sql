-- Phase 1: Database Schema Restructuring
-- Add new granular permissions following {scope}_{resource}_{action}_{target} pattern

-- First, let's add the new granular permissions
INSERT INTO public.permissions (name, description, category, is_active) VALUES
-- User Management Permissions
('own_profile_read', 'Read own profile information', 'user_management', true),
('own_profile_update', 'Update own profile information', 'user_management', true),
('company_users_read', 'Read company user information', 'user_management', true),
('company_users_create', 'Create new users within company', 'user_management', true),
('company_users_update', 'Update company user information', 'user_management', true),
('company_users_delete', 'Delete/deactivate company users', 'user_management', true),
('subordinates_users_read', 'Read subordinate user information', 'user_management', true),
('subordinates_users_update', 'Update subordinate user information', 'user_management', true),
('subordinates_users_delete', 'Delete/deactivate subordinate users', 'user_management', true),
('global_users_read', 'Read all user information across companies', 'user_management', true),
('global_users_create', 'Create users in any company', 'user_management', true),
('global_users_update', 'Update any user information', 'user_management', true),
('global_users_delete', 'Delete/deactivate any user', 'user_management', true),

-- Production Order Permissions
('company_production_orders_read', 'Read company production orders', 'production', true),
('company_production_orders_create', 'Create company production orders', 'production', true),
('company_production_orders_update', 'Update company production orders', 'production', true),
('company_production_orders_delete', 'Delete company production orders', 'production', true),
('global_production_orders_read', 'Read all production orders', 'production', true),
('global_production_orders_create', 'Create production orders for any company', 'production', true),
('global_production_orders_update', 'Update any production orders', 'production', true),
('global_production_orders_delete', 'Delete any production orders', 'production', true),

-- Inventory Management Permissions
('company_inventory_read', 'Read company inventory', 'inventory', true),
('company_inventory_create', 'Create company inventory items', 'inventory', true),
('company_inventory_update', 'Update company inventory', 'inventory', true),
('company_inventory_delete', 'Delete company inventory items', 'inventory', true),
('global_inventory_read', 'Read all inventory across companies', 'inventory', true),
('global_inventory_create', 'Create inventory for any company', 'inventory', true),
('global_inventory_update', 'Update any inventory', 'inventory', true),
('global_inventory_delete', 'Delete any inventory', 'inventory', true),

-- Assembly Management Permissions
('company_assemblies_read', 'Read company assemblies', 'assembly', true),
('company_assemblies_create', 'Create company assemblies', 'assembly', true),
('company_assemblies_update', 'Update company assemblies', 'assembly', true),
('company_assemblies_delete', 'Delete company assemblies', 'assembly', true),
('global_assemblies_read', 'Read all assemblies', 'assembly', true),
('global_assemblies_create', 'Create assemblies for any company', 'assembly', true),
('global_assemblies_update', 'Update any assemblies', 'assembly', true),
('global_assemblies_delete', 'Delete any assemblies', 'assembly', true),

-- Customer Management Permissions
('company_customers_read', 'Read company customers', 'customer_management', true),
('company_customers_create', 'Create company customers', 'customer_management', true),
('company_customers_update', 'Update company customers', 'customer_management', true),
('company_customers_delete', 'Delete company customers', 'customer_management', true),
('global_customers_read', 'Read all customers', 'customer_management', true),
('global_customers_create', 'Create customers for any company', 'customer_management', true),
('global_customers_update', 'Update any customers', 'customer_management', true),
('global_customers_delete', 'Delete any customers', 'customer_management', true),

-- Vendor/Supplier Management Permissions
('company_vendors_read', 'Read company vendors', 'vendor_management', true),
('company_vendors_create', 'Create company vendors', 'vendor_management', true),
('company_vendors_update', 'Update company vendors', 'vendor_management', true),
('company_vendors_delete', 'Delete company vendors', 'vendor_management', true),
('global_vendors_read', 'Read all vendors', 'vendor_management', true),
('global_vendors_create', 'Create vendors for any company', 'vendor_management', true),
('global_vendors_update', 'Update any vendors', 'vendor_management', true),
('global_vendors_delete', 'Delete any vendors', 'vendor_management', true),

-- Purchase Order Permissions
('company_purchase_orders_read', 'Read company purchase orders', 'purchasing', true),
('company_purchase_orders_create', 'Create company purchase orders', 'purchasing', true),
('company_purchase_orders_update', 'Update company purchase orders', 'purchasing', true),
('company_purchase_orders_delete', 'Delete company purchase orders', 'purchasing', true),
('global_purchase_orders_read', 'Read all purchase orders', 'purchasing', true),
('global_purchase_orders_create', 'Create purchase orders for any company', 'purchasing', true),
('global_purchase_orders_update', 'Update any purchase orders', 'purchasing', true),
('global_purchase_orders_delete', 'Delete any purchase orders', 'purchasing', true),

-- Repair Order Permissions
('company_repair_orders_read', 'Read company repair orders', 'repairs', true),
('company_repair_orders_create', 'Create company repair orders', 'repairs', true),
('company_repair_orders_update', 'Update company repair orders', 'repairs', true),
('company_repair_orders_delete', 'Delete company repair orders', 'repairs', true),
('global_repair_orders_read', 'Read all repair orders', 'repairs', true),
('global_repair_orders_create', 'Create repair orders for any company', 'repairs', true),
('global_repair_orders_update', 'Update any repair orders', 'repairs', true),
('global_repair_orders_delete', 'Delete any repair orders', 'repairs', true),

-- Financial/Accounting Permissions
('company_financials_read', 'Read company financial data', 'accounting', true),
('company_financials_create', 'Create company financial records', 'accounting', true),
('company_financials_update', 'Update company financial data', 'accounting', true),
('company_financials_delete', 'Delete company financial records', 'accounting', true),
('global_financials_read', 'Read all financial data', 'accounting', true),
('global_financials_create', 'Create financial records for any company', 'accounting', true),
('global_financials_update', 'Update any financial data', 'accounting', true),
('global_financials_delete', 'Delete any financial records', 'accounting', true),

-- Settings & Configuration Permissions
('company_settings_read', 'Read company settings', 'settings', true),
('company_settings_update', 'Update company settings', 'settings', true),
('global_settings_read', 'Read all settings across companies', 'settings', true),
('global_settings_update', 'Update any company settings', 'settings', true),

-- Permission Management (Admin only)
('global_permissions_read', 'Read all permission configurations', 'permission_management', true),
('global_permissions_update', 'Update permission configurations', 'permission_management', true),
('global_roles_read', 'Read all role configurations', 'permission_management', true),
('global_roles_update', 'Update role configurations', 'permission_management', true);

-- Create enhanced permission checking function
CREATE OR REPLACE FUNCTION public.has_granular_permission(_user_id uuid, _permission_name text, _target_company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_company_id uuid;
  permission_scope text;
  base_permission text;
BEGIN
  -- Get user's company
  SELECT company_id INTO user_company_id
  FROM public.profiles 
  WHERE id = _user_id;
  
  -- Extract scope from permission name (e.g., 'global_', 'company_', 'own_')
  permission_scope := split_part(_permission_name, '_', 1);
  
  -- Check if user has the permission through role assignments
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = _user_id
      AND p.name = _permission_name
      AND rp.is_granted = true
      AND p.is_active = true
  ) THEN
    RETURN false;
  END IF;
  
  -- Apply scope-based restrictions
  CASE permission_scope
    WHEN 'global' THEN
      -- Global permissions require admin or sales_support role
      RETURN has_role(_user_id, 'admin'::app_role) OR has_role(_user_id, 'sales_support'::app_role);
    
    WHEN 'company' THEN
      -- Company permissions require same company or admin access
      RETURN _target_company_id IS NULL 
        OR user_company_id = _target_company_id 
        OR has_role(_user_id, 'admin'::app_role) 
        OR has_role(_user_id, 'sales_support'::app_role);
    
    WHEN 'own' THEN
      -- Own permissions are always allowed if user has the permission
      RETURN true;
    
    WHEN 'subordinates' THEN
      -- For now, subordinates = company level (can be enhanced with org hierarchy later)
      RETURN _target_company_id IS NULL 
        OR user_company_id = _target_company_id 
        OR has_role(_user_id, 'admin'::app_role) 
        OR has_role(_user_id, 'sales_support'::app_role);
    
    ELSE
      -- Unknown scope, deny access
      RETURN false;
  END CASE;
END;
$$;

-- Create function to check user management permissions specifically
CREATE OR REPLACE FUNCTION public.can_manage_user(_manager_user_id uuid, _target_user_id uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  manager_company_id uuid;
  target_company_id uuid;
  permission_name text;
BEGIN
  -- Get company IDs
  SELECT company_id INTO manager_company_id FROM public.profiles WHERE id = _manager_user_id;
  SELECT company_id INTO target_company_id FROM public.profiles WHERE id = _target_user_id;
  
  -- Self-management (own profile)
  IF _manager_user_id = _target_user_id THEN
    permission_name := 'own_profile_' || _action;
    RETURN has_granular_permission(_manager_user_id, permission_name);
  END IF;
  
  -- Same company management
  IF manager_company_id = target_company_id THEN
    permission_name := 'company_users_' || _action;
    IF has_granular_permission(_manager_user_id, permission_name, target_company_id) THEN
      RETURN true;
    END IF;
    
    -- Check subordinates permission (for now, same as company)
    permission_name := 'subordinates_users_' || _action;
    IF has_granular_permission(_manager_user_id, permission_name, target_company_id) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Global management (cross-company)
  permission_name := 'global_users_' || _action;
  RETURN has_granular_permission(_manager_user_id, permission_name, target_company_id);
END;
$$;

-- Update the existing has_permission function to support new granular permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if it's a new granular permission
  IF _permission_name LIKE '%\_%\_%' THEN
    RETURN has_granular_permission(_user_id, _permission_name);
  END IF;
  
  -- Fallback to old permission system for backward compatibility
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
$$;