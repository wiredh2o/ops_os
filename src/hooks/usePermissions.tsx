import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQuery } from '@tanstack/react-query';
import { getVisibleStaffTabs, STAFF_TABS } from './staff-tab-access';

// Separate from the management hook: the staff shell needs only this user's roles
// and the existing server-side View checks, not every role's editable permissions.
export function useStaffTabPermissions() {
  const { user, roles, rolesLoading, rolesError } = useAuth();
  const marketingQuery = useQuery({
    queryKey: ['staff-marketing-view-permissions', user?.id, roles],
    enabled: Boolean(user && roles.includes('marketing') && !roles.includes('admin')),
    queryFn: async () => {
      if (!user) return [];
      const names = [...new Set(STAFF_TABS.map(tab => tab.permission).filter((name): name is Exclude<typeof name, null> => name !== null))];
      const results = await Promise.all(names.map(async name => {
        const { data, error } = await supabase.rpc('has_permission', {
          _user_id: user.id, _permission_name: name,
        });
        if (error) throw error;
        return data ? name : null;
      }));
      return results.filter((name): name is Exclude<typeof name, null> => name !== null);
    },
    staleTime: 60_000,
  });
  const needsMarketing = roles.includes('marketing') && !roles.includes('admin');
  return {
    visibleTabs: getVisibleStaffTabs(roles, marketingQuery.data || []),
    loading: rolesLoading || (needsMarketing && marketingQuery.isPending),
    error: rolesError || (needsMarketing ? marketingQuery.error : null),
  };
}

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
}

export interface RolePermission {
  id: string;
  role: string;
  permission_id: string;
  is_granted: boolean;
  permission: Permission;
}

export function usePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPermissions();
      fetchRolePermissions();
    }
  }, [user]);

  const fetchPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  const fetchRolePermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select(`
          *,
          permission:permissions(*)
        `)
        .order('role', { ascending: true });

      if (error) throw error;
      setRolePermissions(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      setLoading(false);
    }
  };

  const updateRolePermission = async (role: string, permissionId: string, isGranted: boolean, targetCompanyId?: string) => {
    try {
      console.log('🔧 updateRolePermission started:', { role, permissionId, isGranted, targetCompanyId });
      
      // Get current user's roles to determine what they can grant
      const { data: currentUserRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user?.id);

      if (!currentUserRoles || currentUserRoles.length === 0) {
        throw new Error('User has no roles assigned');
      }

      console.log('👤 Current user roles:', currentUserRoles);

      // Get permission name first (separate from RPC call for better error handling)
      const { data: permissionData, error: permissionError } = await supabase
        .from('permissions')
        .select('name')
        .eq('id', permissionId)
        .single();

      if (permissionError || !permissionData) {
        console.error('❌ Permission lookup failed:', permissionError);
        throw new Error(`Permission with ID ${permissionId} not found`);
      }

      console.log('🔐 Permission found:', permissionData.name);

      // Admin override - admins can manage any permission
      const isAdmin = currentUserRoles.some(role => role.role === 'admin');
      console.log('👑 Is admin?', isAdmin);

      if (!isAdmin) {
        // Check if user can delegate this permission using the new hierarchical function
        const canDelegate = await supabase.rpc('can_delegate_permission', {
          _delegator_user_id: user?.id,
          _delegator_role: currentUserRoles[0].role as any,
          _target_role: role as any,
          _permission_name: permissionData.name,
          _target_company_id: targetCompanyId || null
        });

        console.log('🛡️ Delegation check result:', canDelegate);

        if (canDelegate.error || !canDelegate.data) {
          console.error('❌ Permission delegation denied:', canDelegate.error);
          throw new Error('You do not have permission to grant/revoke this permission');
        }
      } else {
        console.log('✅ Admin override - delegation check bypassed');
      }

      const { error } = await supabase
        .from('role_permissions')
        .upsert({
          role: role as any,
          permission_id: permissionId,
          is_granted: isGranted,
          granted_by: user?.id,
          granted_by_role: currentUserRoles[0].role,
          granted_by_user_id: user?.id,
          granted_at: new Date().toISOString(),
          company_scope: targetCompanyId || null,
          delegation_level: 1, // Track delegation depth
        }, {
          onConflict: 'role,permission_id'
        });

      if (error) throw error;
      
      // Refresh data
      await fetchRolePermissions();
      return true;
    } catch (error) {
      console.error('Error updating role permission:', error);
      return false;
    }
  };

  const hasPermission = async (permissionName: string, targetCompanyId?: string): Promise<boolean> => {
    if (!user) return false;
    
    // Handle legacy permission name mappings
    let actualPermissionName = permissionName;
    if (permissionName === 'own_profile_read') actualPermissionName = 'own_users_read';
    if (permissionName === 'own_profile_edit') actualPermissionName = 'own_users_edit';
    
    // Use the new hierarchical permission checking function
    try {
      const { data, error } = await supabase.rpc('has_granular_permission_hierarchical', {
        _user_id: user.id,
        _permission_name: actualPermissionName,
        _target_company_id: targetCompanyId || null
      });

      if (error) {
        console.error('Error checking permission:', error);
        return false;
      }

      return data || false;
    } catch (error) {
      console.error('Error checking permission:', error);
      
      // Fallback to legacy permission check
      const rolePermission = rolePermissions.find(
        rp => rp.permission.name === actualPermissionName && rp.is_granted
      );
      return !!rolePermission;
    }
  };

  const getPermissionsByCategory = () => {
    const categories: Record<string, Permission[]> = {};
    permissions.forEach(permission => {
      if (!categories[permission.category]) {
        categories[permission.category] = [];
      }
      categories[permission.category].push(permission);
    });
    return categories;
  };

  const getGranularPermissions = () => {
    // Group granular permissions by resource and scope
    const granular: Record<string, Record<string, Permission[]>> = {};
    
    permissions.forEach(permission => {
      const parts = permission.name.split('_');
      if (parts.length >= 3) {
        const scope = parts[0]; // own, company, subordinates, global
        const resource = parts.slice(1, -1).join('_'); // users, production_orders, etc.
        const action = parts[parts.length - 1]; // read, create, edit, delete
        
        if (['own', 'company', 'subordinates', 'global'].includes(scope)) {
          if (!granular[resource]) {
            granular[resource] = {};
          }
          if (!granular[resource][scope]) {
            granular[resource][scope] = [];
          }
          granular[resource][scope].push(permission);
        }
      }
    });
    
    return granular;
  };

  const getRolePermissionStatus = (role: string, permissionId: string): boolean => {
    const rolePermission = rolePermissions.find(
      rp => rp.role === role && rp.permission_id === permissionId
    );
    return rolePermission?.is_granted || false;
  };

  const canManageRole = async (targetRole: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const { data: currentUserRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (!currentUserRoles || currentUserRoles.length === 0) return false;

      // Check if any of the user's roles can manage the target role
      for (const userRole of currentUserRoles) {
        const { data, error } = await supabase.rpc('can_role_manage_role', {
          _manager_role: userRole.role as any, // Type assertion for enum
          _target_role: targetRole as any // Type assertion for enum
        });

        if (!error && data) return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking role management permission:', error);
      return false;
    }
  };

  return {
    permissions,
    rolePermissions,
    loading,
    updateRolePermission,
    hasPermission,
    getPermissionsByCategory,
    getGranularPermissions,
    getRolePermissionStatus,
    canManageRole,
    refresh: () => {
      fetchPermissions();
      fetchRolePermissions();
    }
  };
}