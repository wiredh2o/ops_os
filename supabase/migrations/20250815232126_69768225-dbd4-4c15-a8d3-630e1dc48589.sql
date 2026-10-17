-- Standardize user permission naming and add missing subordinates permission

-- First, update existing permission names
UPDATE public.permissions 
SET name = 'own_users_read' 
WHERE name = 'own_profile_read';

UPDATE public.permissions 
SET name = 'own_users_edit' 
WHERE name = 'own_profile_edit';

-- Add the missing subordinates_users_create permission
INSERT INTO public.permissions (name, description, category, is_active)
VALUES (
    'subordinates_users_create',
    'Create users for subordinates within the organizational hierarchy',
    'user_management',
    true
) ON CONFLICT (name) DO NOTHING;

-- Verify all user management permissions exist
INSERT INTO public.permissions (name, description, category, is_active) VALUES
    ('own_users_read', 'Read own user profile information', 'user_management', true),
    ('own_users_edit', 'Edit own user profile information', 'user_management', true),
    ('subordinates_users_read', 'Read user information for subordinates', 'user_management', true),
    ('subordinates_users_edit', 'Edit user information for subordinates', 'user_management', true),
    ('subordinates_users_delete', 'Delete user accounts for subordinates', 'user_management', true),
    ('company_users_read', 'Read user information within company', 'user_management', true),
    ('company_users_create', 'Create new users within company', 'user_management', true),
    ('company_users_edit', 'Edit user information within company', 'user_management', true),
    ('company_users_delete', 'Delete user accounts within company', 'user_management', true),
    ('global_users_read', 'Read user information across all companies', 'user_management', true),
    ('global_users_create', 'Create new users across all companies', 'user_management', true),
    ('global_users_edit', 'Edit user information across all companies', 'user_management', true),
    ('global_users_delete', 'Delete user accounts across all companies', 'user_management', true)
ON CONFLICT (name) DO NOTHING;