import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FieldPermission {
  id: string;
  name: string;
  description: string;
  category: string;
  is_active: boolean;
}

interface RoleFieldPermission {
  id: string;
  role: string;
  permission_id: string;
  is_granted: boolean;
  permission: FieldPermission;
}

export function useFieldPermissions() {
  const [fieldPermissions, setFieldPermissions] = useState<FieldPermission[]>([]);
  const [roleFieldPermissions, setRoleFieldPermissions] = useState<RoleFieldPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFieldPermissions = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching field permissions...');
      
      // Fetch ALL permissions first - simpler approach
      const { data: allPermissions, error: permError } = await supabase
        .from('permissions')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (permError) {
        console.error('❌ Error fetching permissions:', permError);
        return;
      }

      console.log('📊 Total permissions fetched:', allPermissions?.length || 0);
      console.log('📝 First 5 permissions:', allPermissions?.slice(0, 5).map(p => p.name));

      // Filter to only field-level permissions using regex
      const fieldLevelPerms = (allPermissions || []).filter(p => {
        const isFieldLevel = /^(company|global|own)_[^_]+_[^_]+_read$/.test(p.name);
        if (isFieldLevel) {
          console.log('✅ Found field permission:', p.name);
        }
        return isFieldLevel;
      });

      console.log('🎯 Field-level permissions found:', fieldLevelPerms.length);
      console.log('🏷️ Field permission names:', fieldLevelPerms.map(p => p.name));

      if (fieldLevelPerms.length === 0) {
        console.log('⚠️ No field permissions found matching pattern');
        setFieldPermissions([]);
        setRoleFieldPermissions([]);
        return;
      }

      // Fetch role permissions for these field-level permissions
      const { data: rolePermissions, error: roleError } = await supabase
        .from('role_permissions')
        .select(`
          *,
          permission:permissions(*)
        `)
        .in('permission_id', fieldLevelPerms.map(p => p.id))
        .order('role');

      if (roleError) {
        console.error('❌ Error fetching role field permissions:', roleError);
        return;
      }

      console.log('👥 Role permissions fetched:', rolePermissions?.length || 0);

      setFieldPermissions(fieldLevelPerms);
      setRoleFieldPermissions(rolePermissions || []);
    } catch (error) {
      console.error('💥 Error in fetchFieldPermissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateRoleFieldPermission = async (role: string, permissionId: string, isGranted: boolean) => {
    try {
      const { error } = await supabase
        .from('role_permissions')
        .upsert({
          role: role as any,
          permission_id: permissionId,
          is_granted: isGranted,
          granted_by: (await supabase.auth.getUser()).data.user?.id,
          granted_by_role: 'admin' as any,
          granted_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          granted_at: new Date().toISOString(),
          delegation_level: 1
        }, {
          onConflict: 'role,permission_id'
        });

      if (error) {
        console.error('Error updating role field permission:', error);
        return false;
      }

      // Refresh data
      await fetchFieldPermissions();
      return true;
    } catch (error) {
      console.error('Error in updateRoleFieldPermission:', error);
      return false;
    }
  };

  const getRolePermissionStatus = (role: string, permissionId: string): boolean => {
    return roleFieldPermissions.some(rp => 
      rp.role === role && 
      rp.permission_id === permissionId && 
      rp.is_granted
    );
  };

  useEffect(() => {
    fetchFieldPermissions();
  }, []);

  return {
    fieldPermissions,
    roleFieldPermissions,
    loading,
    updateRoleFieldPermission,
    getRolePermissionStatus,
    refresh: fetchFieldPermissions
  };
}