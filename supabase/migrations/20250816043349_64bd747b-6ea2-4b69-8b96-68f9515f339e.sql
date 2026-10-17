-- Create column-level field access function
CREATE OR REPLACE FUNCTION public.can_access_field(
  _user_id uuid, 
  _table_name text, 
  _column_name text, 
  _action text DEFAULT 'read',
  _target_company_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  permission_name text;
  user_company_id uuid;
BEGIN
  -- Get user's company
  SELECT company_id INTO user_company_id
  FROM public.profiles 
  WHERE id = _user_id;
  
  -- Build permission name: {scope}_{table}_{column}_{action}
  -- Try different scopes in order of precedence
  
  -- Global scope (admin/sales_support)
  permission_name := 'global_' || _table_name || '_' || _column_name || '_' || _action;
  IF has_granular_permission(_user_id, permission_name, _target_company_id) THEN
    RETURN true;
  END IF;
  
  -- Company scope (same company access)
  IF _target_company_id IS NULL OR user_company_id = _target_company_id THEN
    permission_name := 'company_' || _table_name || '_' || _column_name || '_' || _action;
    IF has_granular_permission(_user_id, permission_name, _target_company_id) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Subordinates scope (organizational hierarchy)
  IF _target_company_id IS NULL OR user_company_id = _target_company_id THEN
    permission_name := 'subordinates_' || _table_name || '_' || _column_name || '_' || _action;
    IF has_granular_permission(_user_id, permission_name, _target_company_id) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Own scope (created by user)
  permission_name := 'own_' || _table_name || '_' || _column_name || '_' || _action;
  IF has_granular_permission(_user_id, permission_name, _target_company_id) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$function$;

-- Add column-level permissions for accounts table
INSERT INTO public.permissions (name, description, category, is_active) VALUES
-- Balance permissions
('company_accounts_current_balance_read', 'View account balances within company', 'accounting', true),
('global_accounts_current_balance_read', 'View all account balances globally', 'accounting', true),
('own_accounts_current_balance_read', 'View balances of accounts created by user', 'accounting', true),

-- Account number permissions
('company_accounts_account_number_read', 'View account numbers within company', 'accounting', true),
('global_accounts_account_number_read', 'View all account numbers globally', 'accounting', true),
('own_accounts_account_number_read', 'View account numbers of accounts created by user', 'accounting', true),

-- Account type permissions
('company_accounts_account_type_read', 'View account types within company', 'accounting', true),
('global_accounts_account_type_read', 'View all account types globally', 'accounting', true),
('own_accounts_account_type_read', 'View account types of accounts created by user', 'accounting', true),

-- Account subtype permissions
('company_accounts_account_subtype_read', 'View account subtypes within company', 'accounting', true),
('global_accounts_account_subtype_read', 'View all account subtypes globally', 'accounting', true),
('own_accounts_account_subtype_read', 'View account subtypes of accounts created by user', 'accounting', true)
ON CONFLICT (name) DO NOTHING;

-- Grant permissions to roles
-- Admin and sales_support get global access to all account fields
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'admin'::app_role, p.id, true
FROM public.permissions p 
WHERE p.name LIKE 'global_accounts_%_read'
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'sales_support'::app_role, p.id, true
FROM public.permissions p 
WHERE p.name LIKE 'global_accounts_%_read'
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Car wash admin gets company-level access to all fields
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'car_wash_admin'::app_role, p.id, true
FROM public.permissions p 
WHERE p.name LIKE 'company_accounts_%_read'
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Car wash employee gets limited access - only account types, no sensitive data
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'car_wash_employee'::app_role, p.id, true
FROM public.permissions p 
WHERE p.name IN ('company_accounts_account_type_read', 'company_accounts_account_subtype_read')
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;

-- Accounting role gets company-level access to all fields
INSERT INTO public.role_permissions (role, permission_id, is_granted) 
SELECT 'accounting'::app_role, p.id, true
FROM public.permissions p 
WHERE p.name LIKE 'company_accounts_%_read'
ON CONFLICT (role, permission_id) DO UPDATE SET is_granted = true;