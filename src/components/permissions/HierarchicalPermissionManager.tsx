import React, { useState, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  ShoppingCart, 
  DollarSign, 
  Settings, 
  Building2, 
  UserCog, 
  Shield,
  ChevronRight,
  ChevronDown,
  Search,
  Loader2
} from 'lucide-react';

// Role hierarchy definitions with descriptions and capabilities
const INTERNAL_ROLES = [
  {
    key: 'admin',
    label: 'Admin',
    description: 'Full system access and user management',
    scopes: ['global', 'company', 'subordinates', 'own']
  },
  {
    key: 'sales_support',
    label: 'Sales Support',
    description: 'Customer management and sales operations',
    scopes: ['company', 'subordinates', 'own']
  },
  {
    key: 'accounting',
    label: 'Accounting',
    description: 'Financial management and reporting',
    scopes: ['company', 'subordinates', 'own']
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Marketing campaigns and customer outreach',
    scopes: ['company', 'subordinates', 'own']
  },
  {
    key: 'production',
    label: 'Production',
    description: 'Manufacturing and inventory management',
    scopes: ['company', 'own']
  }
];

const EXTERNAL_ROLES = [
  {
    key: 'car_wash_admin',
    label: 'Car Wash Admin',
    description: 'Company administrator for car wash operations',
    scopes: ['company', 'subordinates', 'own']
  },
  {
    key: 'car_wash_employee',
    label: 'Car Wash Employee',
    description: 'Employee access to assigned tasks',
    scopes: ['own']
  }
];

// Resource categories for better organization
const RESOURCE_CATEGORIES = {
  users: { label: 'User Management', icon: Users },
  customers: { label: 'Customer Management', icon: Building2 },
  orders: { label: 'Order Management', icon: ShoppingCart },
  inventory: { label: 'Inventory Management', icon: Settings },
  accounting: { label: 'Financial Management', icon: DollarSign },
  production: { label: 'Production Management', icon: Settings }
};

const RESOURCES = {
  users: ['users', 'profiles'],
  customers: ['customers', 'companies'],
  orders: ['production_orders', 'purchase_orders'],
  inventory: ['inventory_items', 'assemblies'],
  accounting: ['accounts', 'transactions'],
  production: ['production_orders', 'repair_orders']
};

const ACTIONS = [
  { key: 'read', label: 'View', description: 'View and read data' },
  { key: 'create', label: 'Create', description: 'Create new records' },
  { key: 'edit', label: 'Edit', description: 'Modify existing records' },
  { key: 'delete', label: 'Delete', description: 'Remove records' }
];

const SCOPES = [
  { key: 'own', label: 'Own', description: 'Only your own data' },
  { key: 'subordinates', label: 'Subordinates', description: 'Your subordinates data' },
  { key: 'company', label: 'Company', description: 'All company data' },
  { key: 'global', label: 'Global', description: 'All data across companies' }
];

interface TreeNodeProps {
  id: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  badge?: string;
  onToggle: () => void;
  onSelect: () => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  id,
  label,
  description,
  icon: Icon,
  level,
  isExpanded,
  isSelected,
  hasChildren,
  badge,
  onToggle,
  onSelect
}) => {
  return (
    <div 
      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
        ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'}
      `}
      style={{ paddingLeft: `${level * 16 + 8}px` }}
    >
      {hasChildren && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      )}
      
      <div 
        className="flex items-center gap-2 flex-1 min-w-0"
        onClick={onSelect}
      >
        {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{label}</span>
            {badge && (
              <Badge variant="secondary" className="text-xs">
                {badge}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export const HierarchicalPermissionManager: React.FC = () => {
  const { permissions, rolePermissions, loading, updateRolePermission } = usePermissions();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['internal', 'external']));
  const [selectedNode, setSelectedNode] = useState<string>('admin');
  const [updatingPermissions, setUpdatingPermissions] = useState<Set<string>>(new Set());

  // Process permissions into hierarchical structure
  const granularPermissions = useMemo(() => {
    const granular: Record<string, Record<string, Record<string, any[]>>> = {};
    
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
            granular[resource][scope] = {};
          }
          if (!granular[resource][scope][action]) {
            granular[resource][scope][action] = [];
          }
          granular[resource][scope][action].push(permission);
        }
      }
    });
    
    return granular;
  }, [permissions]);

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const selectNode = (nodeId: string) => {
    setSelectedNode(nodeId);
  };

  const handlePermissionToggle = async (role: string, permissionId: string, currentValue: boolean) => {
    const permissionKey = `${role}-${permissionId}`;
    setUpdatingPermissions(prev => new Set([...prev, permissionKey]));
    
    try {
      const success = await updateRolePermission(role, permissionId, !currentValue);
      if (success) {
        toast({
          title: "Permission Updated",
          description: `Permission ${!currentValue ? 'granted' : 'revoked'} successfully.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update permission. You may not have sufficient privileges.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update permission.",
        variant: "destructive",
      });
    } finally {
      setUpdatingPermissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(permissionKey);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const selectedRole = [...INTERNAL_ROLES, ...EXTERNAL_ROLES].find(role => role.key === selectedNode);

  return (
    <div className="flex gap-6 h-[800px]">
      {/* Left Panel - Role Hierarchy */}
      <div className="w-1/3 border-r border-border pr-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Role Hierarchy</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search roles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-1 max-h-[700px] overflow-y-auto">
            {/* Internal Roles */}
            <TreeNode
              id="internal"
              label="Internal Roles"
              icon={UserCog}
              level={0}
              isExpanded={expandedNodes.has('internal')}
              isSelected={false}
              hasChildren={true}
              onToggle={() => toggleNode('internal')}
              onSelect={() => {}}
            />
            
            {expandedNodes.has('internal') && INTERNAL_ROLES
              .filter(role => searchTerm === '' || role.label.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((role) => (
                <TreeNode
                  key={role.key}
                  id={role.key}
                  label={role.label}
                  description={role.description}
                  icon={Shield}
                  level={1}
                  isExpanded={false}
                  isSelected={selectedNode === role.key}
                  hasChildren={false}
                  badge={role.scopes.length.toString()}
                  onToggle={() => {}}
                  onSelect={() => selectNode(role.key)}
                />
              ))}

            {/* External Roles */}
            <TreeNode
              id="external"
              label="External Roles"
              icon={Building2}
              level={0}
              isExpanded={expandedNodes.has('external')}
              isSelected={false}
              hasChildren={true}
              onToggle={() => toggleNode('external')}
              onSelect={() => {}}
            />
            
            {expandedNodes.has('external') && EXTERNAL_ROLES
              .filter(role => searchTerm === '' || role.label.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((role) => (
                <TreeNode
                  key={role.key}
                  id={role.key}
                  label={role.label}
                  description={role.description}
                  icon={Users}
                  level={1}
                  isExpanded={false}
                  isSelected={selectedNode === role.key}
                  hasChildren={false}
                  badge={role.scopes.length.toString()}
                  onToggle={() => {}}
                  onSelect={() => selectNode(role.key)}
                />
              ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Permission Details */}
      <div className="flex-1">
        {selectedRole ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {selectedRole.label} Permissions
                </CardTitle>
                <CardDescription>
                  {selectedRole.description}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Permission Matrix by Resource and Scope */}
            <div className="space-y-6">
              {Object.entries(RESOURCE_CATEGORIES).map(([categoryKey, category]) => {
                const categoryResources = RESOURCES[categoryKey as keyof typeof RESOURCES] || [];
                const hasRelevantPermissions = categoryResources.some(resource => 
                  granularPermissions[resource]
                );

                if (!hasRelevantPermissions) return null;

                return (
                  <Card key={categoryKey}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <category.icon className="h-4 w-4" />
                        {category.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {categoryResources.map(resource => {
                        const resourcePermissions = granularPermissions[resource];
                        if (!resourcePermissions) return null;

                        return (
                          <div key={resource} className="mb-6 last:mb-0">
                            <h4 className="font-medium mb-3 capitalize">
                              {resource.replace(/_/g, ' ')}
                            </h4>
                            
                            <div className="grid grid-cols-4 gap-4">
                              {ACTIONS.map(action => (
                                <div key={action.key} className="space-y-2">
                                  <h5 className="text-sm font-medium text-muted-foreground">
                                    {action.label}
                                  </h5>
                                  
                                  {selectedRole.scopes.map(scope => {
                                    const permission = resourcePermissions[scope]?.[action.key]?.[0];
                                    if (!permission) return null;

                                    const isGranted = rolePermissions.find(
                                      rp => rp.role === selectedRole.key && 
                                           rp.permission_id === permission.id
                                    )?.is_granted || false;

                                    const permissionKey = `${selectedRole.key}-${permission.id}`;
                                    const isUpdating = updatingPermissions.has(permissionKey);

                                    return (
                                      <div key={scope} className="flex items-center justify-between p-2 border rounded-lg">
                                        <div className="flex-1">
                                          <div className="text-xs font-medium capitalize">
                                            {scope}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {SCOPES.find(s => s.key === scope)?.description}
                                          </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                          {isUpdating && (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          )}
                                          <Switch
                                            checked={isGranted}
                                            disabled={isUpdating}
                                            onCheckedChange={() => 
                                              handlePermissionToggle(selectedRole.key, permission.id, isGranted)
                                            }
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center p-8">
              <div className="text-center">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Role</h3>
                <p className="text-muted-foreground">
                  Choose a role from the hierarchy to view and manage its permissions.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};