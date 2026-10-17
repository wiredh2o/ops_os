-- Phase 2: Set up default permissions for existing roles
-- This creates a baseline set of permissions for each role

-- Helper function to grant permissions in bulk
CREATE OR REPLACE FUNCTION grant_role_permissions(_role app_role, _permission_names text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _permission_name text;
  _permission_id uuid;
BEGIN
  FOREACH _permission_name IN ARRAY _permission_names
  LOOP
    -- Get permission ID
    SELECT id INTO _permission_id FROM public.permissions WHERE name = _permission_name;
    
    IF _permission_id IS NOT NULL THEN
      -- Insert or update role permission
      INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by)
      VALUES (_role, _permission_id, true, auth.uid())
      ON CONFLICT (role, permission_id) 
      DO UPDATE SET is_granted = true, granted_by = auth.uid(), granted_at = now();
    END IF;
  END LOOP;
END;
$$;

-- Grant admin permissions (global scope for everything)
SELECT grant_role_permissions('admin'::app_role, ARRAY[
  'global_users_read', 'global_users_create', 'global_users_update', 'global_users_delete',
  'global_production_orders_read', 'global_production_orders_create', 'global_production_orders_update', 'global_production_orders_delete',
  'global_inventory_read', 'global_inventory_create', 'global_inventory_update', 'global_inventory_delete',
  'global_assemblies_read', 'global_assemblies_create', 'global_assemblies_update', 'global_assemblies_delete',
  'global_customers_read', 'global_customers_create', 'global_customers_update', 'global_customers_delete',
  'global_vendors_read', 'global_vendors_create', 'global_vendors_update', 'global_vendors_delete',
  'global_purchase_orders_read', 'global_purchase_orders_create', 'global_purchase_orders_update', 'global_purchase_orders_delete',
  'global_repair_orders_read', 'global_repair_orders_create', 'global_repair_orders_update', 'global_repair_orders_delete',
  'global_financials_read', 'global_financials_create', 'global_financials_update', 'global_financials_delete',
  'global_settings_read', 'global_settings_update',
  'global_permissions_read', 'global_permissions_update', 'global_roles_read', 'global_roles_update'
]);

-- Grant sales_support permissions (global scope for most things)
SELECT grant_role_permissions('sales_support'::app_role, ARRAY[
  'global_users_read', 'global_users_create', 'global_users_update',
  'global_production_orders_read', 'global_production_orders_create', 'global_production_orders_update',
  'global_inventory_read', 'global_assemblies_read',
  'global_customers_read', 'global_customers_create', 'global_customers_update',
  'global_vendors_read', 'global_purchase_orders_read',
  'global_repair_orders_read', 'global_financials_read',
  'global_settings_read', 'global_permissions_read', 'global_roles_read'
]);

-- Grant production role permissions (company scope)
SELECT grant_role_permissions('production'::app_role, ARRAY[
  'own_profile_read', 'own_profile_update',
  'company_users_read',
  'company_production_orders_read', 'company_production_orders_create', 'company_production_orders_update',
  'company_inventory_read', 'company_inventory_create', 'company_inventory_update',
  'company_assemblies_read', 'company_assemblies_create', 'company_assemblies_update',
  'company_purchase_orders_read', 'company_purchase_orders_create', 'company_purchase_orders_update',
  'company_repair_orders_read', 'company_repair_orders_create', 'company_repair_orders_update',
  'company_settings_read'
]);

-- Grant accounting role permissions (company scope)
SELECT grant_role_permissions('accounting'::app_role, ARRAY[
  'own_profile_read', 'own_profile_update',
  'company_users_read',
  'company_production_orders_read',
  'company_inventory_read',
  'company_customers_read', 'company_customers_create', 'company_customers_update',
  'company_vendors_read', 'company_vendors_create', 'company_vendors_update',
  'company_purchase_orders_read', 'company_purchase_orders_create', 'company_purchase_orders_update',
  'company_financials_read', 'company_financials_create', 'company_financials_update',
  'company_settings_read'
]);

-- Grant car_wash_admin permissions (company scope)
SELECT grant_role_permissions('car_wash_admin'::app_role, ARRAY[
  'own_profile_read', 'own_profile_update',
  'company_users_read', 'company_users_create', 'company_users_update',
  'subordinates_users_read', 'subordinates_users_update',
  'company_production_orders_read', 'company_production_orders_create', 'company_production_orders_update',
  'company_inventory_read',
  'company_customers_read', 'company_customers_create', 'company_customers_update',
  'company_repair_orders_read', 'company_repair_orders_create', 'company_repair_orders_update',
  'company_settings_read', 'company_settings_update'
]);

-- Grant car_wash_employee permissions (own scope only)
SELECT grant_role_permissions('car_wash_employee'::app_role, ARRAY[
  'own_profile_read', 'own_profile_update'
]);

-- Grant partner permissions (own scope only)
SELECT grant_role_permissions('partner'::app_role, ARRAY[
  'own_profile_read', 'own_profile_update'
]);

-- Clean up the helper function
DROP FUNCTION grant_role_permissions;