-- Comprehensive External Role Permission Cleanup
-- Remove inappropriate internal WashGear operation access from all external roles

-- Phase 1: Remove Financial Management Access from ALL External Roles
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role IN ('car_wash_admin', 'car_wash_employee', 'vendor_employee', 'vendor_admin', 'distributor_admin', 'distributor_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%financials%' 
  OR name LIKE '%accounting%'
  OR name LIKE '%transaction%'
  OR name LIKE '%reconciliation%'
);

-- Phase 2: Remove Internal Production Order Management from ALL External Roles
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role IN ('car_wash_admin', 'car_wash_employee', 'vendor_employee', 'vendor_admin', 'distributor_admin', 'distributor_employee')
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

-- Phase 3: Remove Internal Inventory/Assembly Management from ALL External Roles
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role IN ('car_wash_admin', 'car_wash_employee', 'vendor_employee', 'vendor_admin', 'distributor_admin', 'distributor_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'view_inventory',
    'manage_inventory',
    'company_inventory_create',
    'company_inventory_edit', 
    'company_inventory_delete',
    'subordinates_inventory_create',
    'subordinates_inventory_edit',
    'subordinates_inventory_delete',
    'global_inventory_create',
    'global_inventory_edit',
    'global_inventory_delete',
    'company_assemblies_create',
    'company_assemblies_edit',
    'company_assemblies_delete', 
    'subordinates_assemblies_create',
    'subordinates_assemblies_edit',
    'subordinates_assemblies_delete',
    'global_assemblies_create',
    'global_assemblies_edit',
    'global_assemblies_delete'
  )
);

-- Phase 4: Remove Internal Purchase Order Management from ALL External Roles
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role IN ('car_wash_admin', 'car_wash_employee', 'vendor_employee', 'vendor_admin', 'distributor_admin', 'distributor_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'company_purchase_orders_create',
    'company_purchase_orders_edit',
    'company_purchase_orders_delete',
    'subordinates_purchase_orders_create', 
    'subordinates_purchase_orders_edit',
    'subordinates_purchase_orders_delete',
    'global_purchase_orders_create',
    'global_purchase_orders_edit',
    'global_purchase_orders_delete'
  )
);

-- Phase 5: Remove Vendor Management from ALL External Roles
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role IN ('car_wash_admin', 'car_wash_employee', 'vendor_employee', 'vendor_admin', 'distributor_admin', 'distributor_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%vendors%'
);

-- Phase 6: Vendor Role Specific Cleanup - Remove all except basic profile and relevant PO read access
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role IN ('vendor_employee', 'vendor_admin')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name NOT IN (
    'own_profile_read',
    'own_profile_edit',
    'company_purchase_orders_read'  -- Only read access to POs placed with them
  )
);

-- Phase 7: Distributor Role Specific Cleanup - Remove internal operations, keep catalog access
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role IN ('distributor_admin', 'distributor_employee')
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name NOT IN (
    'own_profile_read',
    'own_profile_edit',
    'company_inventory_read',     -- Read-only catalog access
    'company_assemblies_read',    -- Read-only assembly catalog access  
    'own_customers_read',         -- Their own customer management
    'own_customers_edit',
    'own_customers_create'
  )
);

-- Phase 8: Car Wash Employee Specific Cleanup - Remove creation permissions
UPDATE public.role_permissions 
SET is_granted = false 
WHERE role = 'car_wash_employee'
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name LIKE '%_create' 
  OR name LIKE '%_edit'
  OR name LIKE '%_delete'
  OR name LIKE 'manage_%'
);

-- Phase 9: Grant appropriate read-only permissions to car wash employees
UPDATE public.role_permissions 
SET is_granted = true 
WHERE role = 'car_wash_employee'
AND permission_id IN (
  SELECT id FROM public.permissions 
  WHERE name IN (
    'own_profile_read',
    'own_profile_edit',
    'company_production_orders_read'  -- Can view orders for their company only
  )
);

-- Log the cleanup completion
INSERT INTO public.permission_changes (
  role, permission_name, old_value, new_value, changed_by, reason
) VALUES (
  'admin', 'external_roles_cleanup', true, false, 
  COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'),
  'Comprehensive cleanup of external role permissions - removed inappropriate internal WashGear operation access'
);