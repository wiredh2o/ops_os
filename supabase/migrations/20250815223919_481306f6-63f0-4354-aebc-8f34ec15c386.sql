-- Update all permission names from "update" to "edit"
UPDATE public.permissions 
SET name = REPLACE(name, '_update', '_edit')
WHERE name LIKE '%_update';

-- Update the permission checking function to handle both patterns during transition
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if it's a new granular permission
  IF _permission_name ~ '^(own|company|subordinates|global)_.*_(read|create|edit|delete)$' THEN
    RETURN has_granular_permission(_user_id, _permission_name);
  END IF;
  
  -- Also check for legacy "update" pattern during transition
  IF _permission_name ~ '^(own|company|subordinates|global)_.*_update$' THEN
    -- Convert update to edit and check
    RETURN has_granular_permission(_user_id, REPLACE(_permission_name, '_update', '_edit'));
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

-- Update the can_manage_user function to use "edit"
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
  actual_action text;
BEGIN
  -- Convert "update" to "edit" for consistency
  actual_action := CASE WHEN _action = 'update' THEN 'edit' ELSE _action END;
  
  -- Get company IDs
  SELECT company_id INTO manager_company_id FROM public.profiles WHERE id = _manager_user_id;
  SELECT company_id INTO target_company_id FROM public.profiles WHERE id = _target_user_id;
  
  -- Self-management (own profile)
  IF _manager_user_id = _target_user_id THEN
    permission_name := 'own_profile_' || actual_action;
    RETURN has_granular_permission(_manager_user_id, permission_name);
  END IF;
  
  -- Same company management
  IF manager_company_id = target_company_id THEN
    permission_name := 'company_users_' || actual_action;
    IF has_granular_permission(_manager_user_id, permission_name, target_company_id) THEN
      RETURN true;
    END IF;
    
    -- Check subordinates permission (for now, same as company)
    permission_name := 'subordinates_users_' || actual_action;
    IF has_granular_permission(_manager_user_id, permission_name, target_company_id) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Global management (cross-company)
  permission_name := 'global_users_' || actual_action;
  RETURN has_granular_permission(_manager_user_id, permission_name, target_company_id);
END;
$$;