import { ReactNode, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PermissionGuardProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
  targetCompanyId?: string;
}

export function PermissionGuard({ permission, children, fallback = null, targetCompanyId }: PermissionGuardProps) {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkPermission() {
      if (!user) {
        setHasPermission(false);
        return;
      }

      try {
        // Check if it's a granular permission (contains underscores in pattern scope_resource_action)
        const isGranularPermission = permission.match(/^(own|company|subordinates|global)_.*_(read|create|edit|delete)$/);
        
        if (isGranularPermission) {
          const { data, error } = await supabase.rpc('has_granular_permission', {
            _user_id: user.id,
            _permission_name: permission,
            _target_company_id: targetCompanyId || null
          });

          if (error) throw error;
          setHasPermission(data || false);
        } else {
          // Use legacy permission checking
          const { data, error } = await supabase.rpc('has_permission', {
            _user_id: user.id,
            _permission_name: permission
          });

          if (error) throw error;
          setHasPermission(data || false);
        }
      } catch (error) {
        console.error('Error checking permission:', error);
        setHasPermission(false);
      }
    }

    checkPermission();
  }, [user, permission, targetCompanyId]);

  if (hasPermission === null) {
    // Loading state - you could show a skeleton here
    return null;
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Hook version for use in components
export function usePermissionCheck(permission: string, targetCompanyId?: string): boolean | null {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkPermission() {
      if (!user) {
        setHasPermission(false);
        return;
      }

      try {
        // Check if it's a granular permission
        const isGranularPermission = permission.match(/^(own|company|subordinates|global)_.*_(read|create|edit|delete)$/);
        
        if (isGranularPermission) {
          const { data, error } = await supabase.rpc('has_granular_permission', {
            _user_id: user.id,
            _permission_name: permission,
            _target_company_id: targetCompanyId || null
          });

          if (error) throw error;
          setHasPermission(data || false);
        } else {
          // Use legacy permission checking
          const { data, error } = await supabase.rpc('has_permission', {
            _user_id: user.id,
            _permission_name: permission
          });

          if (error) throw error;
          setHasPermission(data || false);
        }
      } catch (error) {
        console.error('Error checking permission:', error);
        setHasPermission(false);
      }
    }

    checkPermission();
  }, [user, permission, targetCompanyId]);

  return hasPermission;
}