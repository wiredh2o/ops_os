-- Grant ALL permissions to admin role

-- Grant all existing permissions to admin role
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by, granted_at)
SELECT 
  'admin'::app_role,
  p.id,
  true,
  NULL, -- system granted
  now()
FROM public.permissions p
WHERE p.is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp 
  WHERE rp.role = 'admin'::app_role 
  AND rp.permission_id = p.id
)
ON CONFLICT (role, permission_id) 
DO UPDATE SET 
  is_granted = true,
  granted_at = now();