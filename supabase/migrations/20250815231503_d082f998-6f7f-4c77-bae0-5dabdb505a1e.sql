-- Grant own_profile_read and own_profile_edit permissions to distributor_employee and vendor_employee roles

-- First, get the permission IDs for own_profile_read and own_profile_edit
DO $$
DECLARE
    profile_read_permission_id UUID;
    profile_edit_permission_id UUID;
BEGIN
    -- Get permission IDs
    SELECT id INTO profile_read_permission_id FROM public.permissions WHERE name = 'own_profile_read';
    SELECT id INTO profile_edit_permission_id FROM public.permissions WHERE name = 'own_profile_edit';
    
    -- Grant own_profile_read to distributor_employee
    INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
    VALUES ('distributor_employee', profile_read_permission_id, true, auth.uid(), now())
    ON CONFLICT (role, permission_id) DO UPDATE SET 
        is_granted = true, 
        granted_by = auth.uid(), 
        granted_at = now();
    
    -- Grant own_profile_edit to distributor_employee
    INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
    VALUES ('distributor_employee', profile_edit_permission_id, true, auth.uid(), now())
    ON CONFLICT (role, permission_id) DO UPDATE SET 
        is_granted = true, 
        granted_by = auth.uid(), 
        granted_at = now();
    
    -- Grant own_profile_read to vendor_employee
    INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
    VALUES ('vendor_employee', profile_read_permission_id, true, auth.uid(), now())
    ON CONFLICT (role, permission_id) DO UPDATE SET 
        is_granted = true, 
        granted_by = auth.uid(), 
        granted_at = now();
    
    -- Grant own_profile_edit to vendor_employee
    INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
    VALUES ('vendor_employee', profile_edit_permission_id, true, auth.uid(), now())
    ON CONFLICT (role, permission_id) DO UPDATE SET 
        is_granted = true, 
        granted_by = auth.uid(), 
        granted_at = now();
END $$;