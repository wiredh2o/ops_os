-- Grant missing inventory permissions to admin role

-- First, get the permission IDs for the missing permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'admin'::app_role,
  p.id,
  true,
  '00000000-0000-0000-0000-000000000000'::uuid, -- system granted
  now()
FROM public.permissions p
WHERE p.name IN ('adjust_inventory', 'reserve_inventory', 'transfer_inventory')
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp 
  WHERE rp.role = 'admin'::app_role 
  AND rp.permission_id = p.id
);