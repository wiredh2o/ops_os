-- Update can_delegate_permission function to allow admin override
CREATE OR REPLACE FUNCTION public.can_delegate_permission(
  _delegator_user_id uuid,
  _delegator_role app_role,
  _target_role app_role,
  _permission_name text,
  _target_company_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  delegator_company_id uuid;
  target_company_id uuid;
BEGIN
  -- Admin override - admins can delegate any permission
  IF _delegator_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Get delegator's company
  SELECT company_id INTO delegator_company_id
  FROM public.profiles 
  WHERE id = _delegator_user_id;
  
  -- Check if delegator has the permission they're trying to grant
  IF NOT has_granular_permission_hierarchical(_delegator_user_id, _permission_name, _target_company_id) THEN
    RETURN false;
  END IF;
  
  -- Check role hierarchy - can the delegator role manage the target role?
  IF NOT can_role_manage_role(_delegator_role, _target_role) THEN
    RETURN false;
  END IF;
  
  -- Company scope validation
  IF _target_company_id IS NOT NULL THEN
    -- If targeting a specific company, delegator must have access to that company
    IF NOT has_company_access(_target_company_id) THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$function$;