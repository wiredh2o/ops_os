-- Fix function search path security warning by setting explicit search_path
-- Update all functions that were created in the previous migration

-- Update get_role_hierarchy_path function
CREATE OR REPLACE FUNCTION public.get_role_hierarchy_path(_child_role app_role)
RETURNS TABLE(role_path app_role[], depth INTEGER)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_role app_role := _child_role;
  path app_role[] := ARRAY[_child_role];
  current_depth INTEGER := 0;
BEGIN
  -- Traverse up the hierarchy
  WHILE current_role IS NOT NULL AND current_depth < 10 LOOP -- Prevent infinite loops
    SELECT rh.parent_role INTO current_role
    FROM public.role_hierarchy rh
    WHERE rh.child_role = current_role
    LIMIT 1;
    
    IF current_role IS NOT NULL THEN
      path := current_role || path;
      current_depth := current_depth + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT path, current_depth;
END;
$$;

-- Update can_role_manage_role function
CREATE OR REPLACE FUNCTION public.can_role_manage_role(_manager_role app_role, _target_role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  can_manage BOOLEAN := false;
BEGIN
  -- Check direct hierarchy relationship
  SELECT EXISTS(
    SELECT 1 FROM public.role_hierarchy rh
    WHERE rh.parent_role = _manager_role 
    AND rh.child_role = _target_role
    AND rh.can_manage_permissions = true
  ) INTO can_manage;
  
  -- If not direct, check if manager role is higher in hierarchy
  IF NOT can_manage THEN
    SELECT EXISTS(
      WITH RECURSIVE hierarchy_path AS (
        -- Start with target role
        SELECT child_role, parent_role, 1 as level
        FROM public.role_hierarchy
        WHERE child_role = _target_role
        
        UNION ALL
        
        -- Recursively find parents
        SELECT rh.child_role, rh.parent_role, hp.level + 1
        FROM public.role_hierarchy rh
        JOIN hierarchy_path hp ON rh.child_role = hp.parent_role
        WHERE hp.level < 5 -- Prevent infinite recursion
      )
      SELECT 1 FROM hierarchy_path
      WHERE parent_role = _manager_role
    ) INTO can_manage;
  END IF;
  
  RETURN can_manage;
END;
$$;

-- Update has_granular_permission_hierarchical function
CREATE OR REPLACE FUNCTION public.has_granular_permission_hierarchical(_user_id uuid, _permission_name text, _target_company_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_company_id uuid;
  user_roles app_role[];
  permission_scope text;
  base_permission text;
  has_permission boolean := false;
BEGIN
  -- Get user's company and roles
  SELECT company_id INTO user_company_id
  FROM public.profiles 
  WHERE id = _user_id;
  
  SELECT ARRAY_AGG(role) INTO user_roles
  FROM public.user_roles 
  WHERE user_id = _user_id;
  
  -- Extract scope from permission name
  permission_scope := split_part(_permission_name, '_', 1);
  
  -- Check each user role for the permission
  FOR i IN 1..array_length(user_roles, 1) LOOP
    -- Direct permission check
    IF EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p ON rp.permission_id = p.id
      WHERE rp.role = user_roles[i]
        AND p.name = _permission_name
        AND rp.is_granted = true
        AND p.is_active = true
    ) THEN
      has_permission := true;
      EXIT; -- Found permission, no need to continue
    END IF;
    
    -- Check inherited permissions from parent roles
    IF EXISTS (
      WITH RECURSIVE role_hierarchy_check AS (
        -- Start with current role
        SELECT user_roles[i] as current_role, 0 as level
        
        UNION ALL
        
        -- Get parent roles
        SELECT rh.parent_role, rhc.level + 1
        FROM public.role_hierarchy rh
        JOIN role_hierarchy_check rhc ON rh.child_role = rhc.current_role
        WHERE rhc.level < 5 -- Prevent infinite recursion
      )
      SELECT 1 
      FROM role_hierarchy_check rhc
      JOIN public.role_permissions rp ON rp.role = rhc.current_role
      JOIN public.permissions p ON rp.permission_id = p.id
      WHERE p.name = _permission_name
        AND rp.is_granted = true
        AND p.is_active = true
    ) THEN
      has_permission := true;
      EXIT;
    END IF;
  END LOOP;
  
  -- Apply scope-based restrictions if permission found
  IF has_permission THEN
    CASE permission_scope
      WHEN 'global' THEN
        -- Global permissions require admin or sales_support role
        RETURN 'admin' = ANY(user_roles) OR 'sales_support' = ANY(user_roles);
      
      WHEN 'company' THEN
        -- Company permissions require same company or admin access
        RETURN _target_company_id IS NULL 
          OR user_company_id = _target_company_id 
          OR 'admin' = ANY(user_roles) 
          OR 'sales_support' = ANY(user_roles);
      
      WHEN 'own' THEN
        -- Own permissions are always allowed if user has the permission
        RETURN true;
      
      WHEN 'subordinates' THEN
        -- Subordinates = company level for now
        RETURN _target_company_id IS NULL 
          OR user_company_id = _target_company_id 
          OR 'admin' = ANY(user_roles) 
          OR 'sales_support' = ANY(user_roles);
      
      ELSE
        -- Unknown scope, deny access
        RETURN false;
    END CASE;
  END IF;
  
  RETURN false;
END;
$$;

-- Update can_delegate_permission function
CREATE OR REPLACE FUNCTION public.can_delegate_permission(_delegator_user_id uuid, _delegator_role app_role, _target_role app_role, _permission_name text, _target_company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  delegator_company_id uuid;
  can_manage boolean := false;
  has_base_permission boolean := false;
BEGIN
  -- Get delegator's company
  SELECT company_id INTO delegator_company_id
  FROM public.profiles 
  WHERE id = _delegator_user_id;
  
  -- Check if delegator role can manage target role
  SELECT public.can_role_manage_role(_delegator_role, _target_role) INTO can_manage;
  
  IF NOT can_manage THEN
    RETURN false;
  END IF;
  
  -- Check if delegator has the permission they're trying to delegate
  SELECT public.has_granular_permission_hierarchical(_delegator_user_id, _permission_name, _target_company_id) 
  INTO has_base_permission;
  
  IF NOT has_base_permission THEN
    RETURN false;
  END IF;
  
  -- Company scope validation for external roles
  IF _target_role IN ('car_wash_admin', 'car_wash_employee') THEN
    -- External roles must be in same company (unless delegator is admin/sales_support)
    IF _delegator_role NOT IN ('admin', 'sales_support') THEN
      IF _target_company_id IS NULL OR delegator_company_id != _target_company_id THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

-- Update resolve_permission_conflicts function
CREATE OR REPLACE FUNCTION public.resolve_permission_conflicts(_role app_role, _permission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_decision boolean;
  has_admin_grant boolean := false;
BEGIN
  -- Check if admin has explicitly granted this permission
  SELECT is_granted INTO admin_decision
  FROM public.role_permissions
  WHERE role = _role 
    AND permission_id = _permission_id
    AND granted_by_role = 'admin'
  ORDER BY granted_at DESC
  LIMIT 1;
  
  IF admin_decision IS NOT NULL THEN
    RETURN admin_decision;
  END IF;
  
  -- If no admin decision, use the most recent grant
  SELECT is_granted INTO admin_decision
  FROM public.role_permissions
  WHERE role = _role 
    AND permission_id = _permission_id
  ORDER BY granted_at DESC
  LIMIT 1;
  
  RETURN COALESCE(admin_decision, false);
END;
$$;