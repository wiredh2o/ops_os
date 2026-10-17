-- Create global role permission configuration system

-- Create permissions table for feature/action registry
CREATE TABLE public.permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create role_permissions table for configurable access control
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role app_role NOT NULL,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  is_granted BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role, permission_id)
);

-- Enable RLS on new tables
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for permissions table
CREATE POLICY "Permissions viewable by authenticated users" 
  ON public.permissions FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Permissions manageable by admins" 
  ON public.permissions FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for role_permissions table  
CREATE POLICY "Role permissions viewable by authenticated users"
  ON public.role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Role permissions manageable by admins"
  ON public.role_permissions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create dynamic permission checking function
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_name TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = _user_id
      AND p.name = _permission_name
      AND rp.is_granted = true
      AND p.is_active = true
  )
$$;

-- Insert default permissions
INSERT INTO public.permissions (name, description, category) VALUES
-- User Management
('manage_users', 'Create, edit, and manage user accounts', 'user_management'),
('view_users', 'View user accounts and profiles', 'user_management'),
('manage_user_roles', 'Assign and modify user roles', 'user_management'),
('invite_users', 'Send invitations to new users', 'user_management'),

-- Inventory Management
('view_inventory', 'View inventory items and stock levels', 'inventory'),
('manage_inventory', 'Create, edit, and delete inventory items', 'inventory'),
('manage_inventory_categories', 'Manage inventory categories and classifications', 'inventory'),
('view_inventory_analytics', 'Access inventory demand analytics and reports', 'inventory'),
('import_inventory', 'Import inventory data from CSV files', 'inventory'),

-- Production & Orders
('view_production_orders', 'View production and customer orders', 'production'),
('manage_production_orders', 'Create, edit, and manage production orders', 'production'),
('view_repair_orders', 'View repair orders and status', 'production'),
('manage_repair_orders', 'Create, edit, and manage repair orders', 'production'),

-- Purchasing & Suppliers
('view_purchase_orders', 'View purchase orders', 'purchasing'),
('manage_purchase_orders', 'Create, edit, and manage purchase orders', 'purchasing'),
('view_suppliers', 'View supplier information', 'purchasing'),
('manage_suppliers', 'Create, edit, and manage suppliers', 'purchasing'),

-- Assembly Management
('view_assemblies', 'View assembly items and bills of materials', 'assembly'),
('manage_assemblies', 'Create, edit, and manage assemblies', 'assembly'),
('manage_assembly_components', 'Manage assembly components and BOMs', 'assembly'),

-- Financial & Accounting
('view_accounting', 'Access accounting dashboard and reports', 'accounting'),
('manage_accounts', 'Create and manage chart of accounts', 'accounting'),
('manage_transactions', 'Create and manage financial transactions', 'accounting'),
('reconcile_accounts', 'Perform account reconciliations', 'accounting'),

-- Customer Management
('view_customers', 'View customer information', 'customer'),
('manage_customers', 'Create, edit, and manage customers', 'customer'),
('manage_price_levels', 'Create and manage customer price levels', 'customer'),

-- System Configuration
('manage_system_settings', 'Configure system-wide settings', 'system'),
('manage_permissions', 'Configure role permissions globally', 'system'),
('view_system_logs', 'Access system logs and audit trails', 'system');

-- Set up default role permissions (maintaining current functionality)
-- Admin gets all permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by)
SELECT 'admin'::app_role, p.id, true, NULL
FROM public.permissions p;

-- Sales Support gets limited permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by)
SELECT 'sales_support'::app_role, p.id, true, NULL
FROM public.permissions p
WHERE p.name IN (
  'view_users', 'invite_users',
  'view_inventory', 'view_production_orders', 'view_repair_orders',
  'view_purchase_orders', 'view_suppliers', 'view_assemblies',
  'view_customers', 'manage_customers', 'manage_price_levels'
);

-- Car Wash Admin gets company-specific permissions  
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by)
SELECT 'car_wash_admin'::app_role, p.id, true, NULL
FROM public.permissions p
WHERE p.name IN (
  'view_users', 'manage_users', 'invite_users',
  'view_inventory', 'manage_inventory', 'view_production_orders', 'manage_production_orders',
  'view_repair_orders', 'manage_repair_orders', 'view_customers', 'manage_customers'
);

-- Production User gets production-focused permissions
INSERT INTO public.role_permissions (role, permission_id, is_granted, granted_by)  
SELECT 'production_user'::app_role, p.id, true, NULL
FROM public.permissions p
WHERE p.name IN (
  'view_inventory', 'view_production_orders', 'manage_production_orders',
  'view_repair_orders', 'manage_repair_orders', 'view_assemblies', 'manage_assemblies',
  'view_purchase_orders'
);

-- Create permission audit log table
CREATE TABLE public.permission_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role app_role NOT NULL,
  permission_name TEXT NOT NULL,
  old_value BOOLEAN,
  new_value BOOLEAN NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT
);

ALTER TABLE public.permission_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permission changes viewable by admins"
  ON public.permission_changes FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger to log permission changes
CREATE OR REPLACE FUNCTION public.log_permission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  permission_name_val TEXT;
BEGIN
  -- Get permission name
  SELECT name INTO permission_name_val
  FROM public.permissions 
  WHERE id = COALESCE(NEW.permission_id, OLD.permission_id);
  
  IF TG_OP = 'UPDATE' AND OLD.is_granted != NEW.is_granted THEN
    INSERT INTO public.permission_changes (
      role, permission_name, old_value, new_value, changed_by
    ) VALUES (
      NEW.role, permission_name_val, OLD.is_granted, NEW.is_granted, auth.uid()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER permission_change_audit
  AFTER UPDATE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_permission_change();