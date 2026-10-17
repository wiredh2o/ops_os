import React, { useState, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Shield, Users, Globe, Building, User, ChevronDown, Database, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Define roles with their scopes
const INTERNAL_ROLES = [
  { key: 'admin', label: 'Admin', description: 'Full system access', scopes: ['global', 'company', 'subordinates', 'own'] },
  { key: 'sales_support', label: 'Sales Support', description: 'Multi-company support access', scopes: ['global', 'company', 'subordinates', 'own'] },
  { key: 'production', label: 'Production', description: 'Production operations', scopes: ['company', 'subordinates', 'own'] },
  { key: 'accounting', label: 'Accounting', description: 'Financial operations', scopes: ['global', 'company', 'subordinates', 'own'] },
  { key: 'marketing', label: 'Marketing', description: 'Marketing operations', scopes: ['company', 'subordinates', 'own'] },
];

const EXTERNAL_ROLES = [
  { key: 'car_wash_admin', label: 'Car Wash Admin', description: 'Car wash company administration', scopes: ['company', 'subordinates', 'own'] },
  { key: 'car_wash_employee', label: 'Car Wash Employee', description: 'Basic car wash company access', scopes: ['own'] },
  { key: 'distributor_admin', label: 'Distributor Admin', description: 'Distributor company administration', scopes: ['company', 'subordinates', 'own'] },
  { key: 'distributor_employee', label: 'Distributor Employee', description: 'Basic distributor company access', scopes: ['own'] },
  { key: 'vendor_admin', label: 'Vendor Admin', description: 'Vendor company administration', scopes: ['company', 'subordinates', 'own'] },
  { key: 'vendor_employee', label: 'Vendor Employee', description: 'Basic vendor company access', scopes: ['own'] },
];

// Define which resources are internal-only (WashGear functions)
const INTERNAL_ONLY_RESOURCES = new Set([
  'purchase_orders',
  'inventory', 
  'assemblies',
  'production_orders',
  'repair_orders',
  'financials',
  'accounts',
  'vendors'
]);

// Icon mapping for resources
const RESOURCE_ICONS = {
  'users': Users,
  'production_orders': Shield,
  'inventory': Building,
  'assemblies': Shield,
  'customers': Users,
  'vendors': Building,
  'purchase_orders': Shield,
  'repair_orders': Shield,
  'financials': Shield,
  'accounts': Database,
  'settings': Shield,
  'profile': User,
};

const ACTIONS = ['read', 'create', 'edit', 'delete'];
const SCOPES = {
  'own': { label: 'Own', icon: User, description: 'Own data only' },
  'subordinates': { label: 'Subordinates', icon: Users, description: 'Team members' },
  'company': { label: 'Company', icon: Building, description: 'Company-wide' },
  'global': { label: 'Global', icon: Globe, description: 'All companies' },
};

export function GranularPermissionMatrix() {
  const { permissions, rolePermissions, loading, updateRolePermission } = usePermissions();
  const [updatingPermissions, setUpdatingPermissions] = useState<Set<string>>(new Set());
  const [openResources, setOpenResources] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Parse permissions dynamically to build resource structure
  const resourceStructure = useMemo(() => {
    const structure: Record<string, {
      label: string;
      icon: any;
      category: string;
      columns: Record<string, {
        scopes: Record<string, string[]>;
      }>;
      general: Record<string, string[]>;
    }> = {};

    permissions.forEach(permission => {
      const parts = permission.name.split('_');
      if (parts.length < 3) return;

      const [scope, resource, ...rest] = parts;
      const action = rest[rest.length - 1];
      
      // Check if this is a column-level permission
      const isColumnPermission = rest.length > 1;
      const column = isColumnPermission ? rest.slice(0, -1).join('_') : null;

      if (!structure[resource]) {
        structure[resource] = {
          label: resource.charAt(0).toUpperCase() + resource.slice(1).replace(/_/g, ' '),
          icon: RESOURCE_ICONS[resource] || Database,
          category: permission.category,
          columns: {},
          general: {}
        };
      }

      if (column) {
        if (!structure[resource].columns[column]) {
          structure[resource].columns[column] = { scopes: {} };
        }
        if (!structure[resource].columns[column].scopes[scope]) {
          structure[resource].columns[column].scopes[scope] = [];
        }
        if (!structure[resource].columns[column].scopes[scope].includes(action)) {
          structure[resource].columns[column].scopes[scope].push(action);
        }
      } else {
        if (!structure[resource].general[scope]) {
          structure[resource].general[scope] = [];
        }
        if (!structure[resource].general[scope].includes(action)) {
          structure[resource].general[scope].push(action);
        }
      }
    });

    return structure;
  }, [permissions]);

  const handlePermissionToggle = async (role: string, permissionId: string, currentValue: boolean) => {
    const updateKey = `${role}-${permissionId}`;
    setUpdatingPermissions(prev => new Set([...prev, updateKey]));

    try {
      const success = await updateRolePermission(role, permissionId, !currentValue);
      if (success) {
        toast({
          title: "Permission Updated",
          description: `Successfully ${!currentValue ? 'granted' : 'revoked'} permission.`,
        });
      } else {
        toast({
          title: "Update Failed",
          description: "Failed to update permission. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while updating permission.",
        variant: "destructive",
      });
    } finally {
      setUpdatingPermissions(prev => {
        const next = new Set(prev);
        next.delete(updateKey);
        return next;
      });
    }
  };

  const getRolePermissionStatus = (role: string, permissionId: string): boolean => {
    const rolePermission = rolePermissions.find(
      rp => rp.role === role && rp.permission_id === permissionId
    );
    return rolePermission?.is_granted || false;
  };

  const getPermissionId = (resource: string, scope: string, action: string, column?: string): string | null => {
    const permissionName = column 
      ? `${scope}_${resource}_${column}_${action}` 
      : `${scope}_${resource}_${action}`;
    const permission = permissions.find(p => p.name === permissionName);
    return permission?.id || null;
  };

  const toggleResourceOpen = (resourceKey: string) => {
    setOpenResources(prev => {
      const next = new Set(prev);
      if (next.has(resourceKey)) {
        next.delete(resourceKey);
      } else {
        next.add(resourceKey);
      }
      return next;
    });
  };

  const renderPermissionRow = (roles: typeof INTERNAL_ROLES, resource: string, scope: string, action: string, column?: string, indent = false) => {
    const permissionId = getPermissionId(resource, scope, action, column);
    if (!permissionId) return null;

    return (
      <tr key={`${resource}-${scope}-${action}${column ? `-${column}` : ''}`} className="border-b">
        <td className="p-2">
          <div className={`flex items-center gap-2 ${indent ? 'ml-6' : ''}`}>
            {column && <Lock className="h-3 w-3 text-muted-foreground" />}
            <Badge variant={column ? "secondary" : "outline"} className="capitalize">
              {column ? `${column} ${action}` : action}
            </Badge>
          </div>
        </td>
        {roles.map(role => {
          const isRoleAllowedScope = role.scopes.includes(scope);
          const currentValue = getRolePermissionStatus(role.key, permissionId);
          const updateKey = `${role.key}-${permissionId}`;
          const isUpdating = updatingPermissions.has(updateKey);
          const isDisabled = role.key === 'admin' || !isRoleAllowedScope;

          return (
            <td key={role.key} className="p-2 text-center">
              {isRoleAllowedScope ? (
                <Switch
                  checked={currentValue}
                  onCheckedChange={() => handlePermissionToggle(role.key, permissionId, currentValue)}
                  disabled={isDisabled || isUpdating}
                  className="mx-auto"
                />
              ) : (
                <span className="text-muted-foreground text-sm">N/A</span>
              )}
              {isUpdating && (
                <Loader2 className="h-3 w-3 animate-spin mx-auto mt-1" />
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  const renderPermissionMatrix = (roles: typeof INTERNAL_ROLES, isExternal = false) => (
    <div className="space-y-4">
      {Object.entries(resourceStructure)
        .filter(([resourceKey]) => {
          // Filter out internal-only resources for external roles
          if (isExternal && INTERNAL_ONLY_RESOURCES.has(resourceKey)) {
            console.log(`Filtering out internal resource: ${resourceKey} for external roles`);
            return false;
          }
          return true;
        })
        .map(([resourceKey, resourceInfo]) => {
        const hasColumns = Object.keys(resourceInfo.columns).length > 0;
        const hasGeneral = Object.keys(resourceInfo.general).length > 0;
        const isOpen = openResources.has(resourceKey);

        if (!hasColumns && !hasGeneral) return null;

        return (
          <Collapsible key={resourceKey} open={isOpen} onOpenChange={() => toggleResourceOpen(resourceKey)}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <resourceInfo.icon className="h-5 w-5" />
                      {resourceInfo.label}
                      {hasColumns && (
                        <Badge variant="secondary" className="text-xs">
                          {Object.keys(resourceInfo.columns).length} columns
                        </Badge>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </CardTitle>
                  <CardDescription>
                    Manage {resourceInfo.label.toLowerCase()} permissions by scope and action
                  </CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Permission</th>
                          {roles.map(role => (
                            <th key={role.key} className="text-center p-2 min-w-[100px]">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-medium">{role.label}</span>
                                <span className="text-xs text-muted-foreground">{role.description}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(SCOPES).map(([scopeKey, scopeInfo]) => {
                          const hasAnyRoleAccess = roles.some(role => role.scopes.includes(scopeKey));
                          if (!hasAnyRoleAccess) return null;

                          const hasGeneralActions = resourceInfo.general[scopeKey]?.length > 0;
                          const hasColumnActions = Object.values(resourceInfo.columns).some(
                            column => column.scopes[scopeKey]?.length > 0
                          );

                          if (!hasGeneralActions && !hasColumnActions) return null;

                          return (
                            <React.Fragment key={scopeKey}>
                              <tr className="border-b bg-muted/20">
                                <td colSpan={roles.length + 1} className="p-2">
                                  <div className="flex items-center gap-2 font-medium">
                                    <scopeInfo.icon className="h-4 w-4" />
                                    {scopeInfo.label} - {scopeInfo.description}
                                  </div>
                                </td>
                              </tr>
                              
                              {/* General permissions */}
                              {resourceInfo.general[scopeKey]?.map(action => 
                                renderPermissionRow(roles, resourceKey, scopeKey, action)
                              )}
                              
                              {/* Column-level permissions */}
                              {Object.entries(resourceInfo.columns).map(([columnKey, columnInfo]) => 
                                columnInfo.scopes[scopeKey]?.map(action => 
                                  renderPermissionRow(roles, resourceKey, scopeKey, action, columnKey, true)
                                )
                              )}
                            </React.Fragment>
                          );
        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Granular Permission Management</h2>
          <p className="text-muted-foreground">
            Manage detailed CRUD permissions by scope: Own → Subordinates → Company → Global
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <Loader2 className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="internal" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="internal">Internal Roles</TabsTrigger>
          <TabsTrigger value="external">External Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Internal Role Permissions</CardTitle>
              <CardDescription>
                Configure permissions for internal team members. Admin permissions are always enabled.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderPermissionMatrix(INTERNAL_ROLES, false)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="external" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>External Role Permissions</CardTitle>
              <CardDescription>
                Configure permissions for external users and partners.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderPermissionMatrix(EXTERNAL_ROLES, true)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}