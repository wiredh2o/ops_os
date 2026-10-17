import React from 'react';
import { usePermissions } from '@/hooks/usePermissions';

interface FieldGuardProps {
  tableName: string;
  columnName: string;
  action?: 'read' | 'edit';
  targetCompanyId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const FieldGuard: React.FC<FieldGuardProps> = ({
  tableName,
  columnName,
  action = 'read',
  targetCompanyId,
  children,
  fallback = <span className="text-muted-foreground">•••</span>
}) => {
  const { hasPermission } = usePermissions();
  const [canAccess, setCanAccess] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const checkAccess = async () => {
      // Build permission name: {scope}_{table}_{column}_{action}
      // Try different scopes in order of precedence
      const permissionPatterns = [
        `global_${tableName}_${columnName}_${action}`,
        `company_${tableName}_${columnName}_${action}`,
        `subordinates_${tableName}_${columnName}_${action}`,
        `own_${tableName}_${columnName}_${action}`
      ];

      for (const permission of permissionPatterns) {
        const hasAccess = await hasPermission(permission, targetCompanyId);
        if (hasAccess) {
          setCanAccess(true);
          return;
        }
      }
      setCanAccess(false);
    };

    checkAccess();
  }, [tableName, columnName, action, targetCompanyId, hasPermission]);

  // Show loading state while checking permissions
  if (canAccess === null) {
    return <span className="text-muted-foreground">...</span>;
  }

  // Show children if user has access, fallback otherwise
  return canAccess ? <>{children}</> : <>{fallback}</>;
};