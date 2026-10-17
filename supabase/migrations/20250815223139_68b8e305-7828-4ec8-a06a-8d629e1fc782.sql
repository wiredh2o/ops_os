-- Phase 1: Complete the granular permission system
-- Add missing user management permissions that don't already exist

-- Insert only the user management permissions that are missing
INSERT INTO public.permissions (name, description, category, is_active) VALUES
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
('global_users_delete', 'Delete/deactivate any user', 'user_management', true)
ON CONFLICT (name) DO NOTHING;

-- Insert missing settings permissions
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('company_settings_read', 'Read company settings', 'settings', true),
('company_settings_update', 'Update company settings', 'settings', true),
('global_settings_read', 'Read all settings across companies', 'settings', true),
('global_settings_update', 'Update any company settings', 'settings', true)
ON CONFLICT (name) DO NOTHING;

-- Insert missing vendor permissions
INSERT INTO public.permissions (name, description, category, is_active) VALUES
('company_vendors_read', 'Read company vendors', 'vendor_management', true),
('company_vendors_create', 'Create company vendors', 'vendor_management', true),
('company_vendors_update', 'Update company vendors', 'vendor_management', true),
('company_vendors_delete', 'Delete company vendors', 'vendor_management', true),
('global_vendors_read', 'Read all vendors', 'vendor_management', true),
('global_vendors_create', 'Create vendors for any company', 'vendor_management', true),
('global_vendors_update', 'Update any vendors', 'vendor_management', true),
('global_vendors_delete', 'Delete any vendors', 'vendor_management', true)
ON CONFLICT (name) DO NOTHING;

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
  IF _permission_name ~ '^(own|company|subordinates|global)_.*_(read|create|update|delete)$' THEN
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