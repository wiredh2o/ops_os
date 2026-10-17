import React, { useState, useMemo } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { RefreshCw, Loader2, Shield, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

const INTERNAL_ROLES = [
  { key: 'admin', label: 'Admin', description: 'Full system access' },
  { key: 'sales_support', label: 'Sales Support', description: 'Sales and customer management' },
  { key: 'production', label: 'Production', description: 'Manufacturing and assembly' },
  { key: 'accounting', label: 'Accounting', description: 'Financial operations' },
];

const EXTERNAL_ROLES = [
  { key: 'car_wash_admin', label: 'Car Wash Admin', description: 'Car wash company administrator' },
  { key: 'car_wash_employee', label: 'Car Wash Employee', description: 'Car wash company staff' },
  { key: 'distributor_admin', label: 'Distributor Admin', description: 'Distributor company administrator' },
  { key: 'distributor_employee', label: 'Distributor Employee', description: 'Distributor company staff' },
  { key: 'vendor_admin', label: 'Vendor Admin', description: 'Vendor company administrator' },
  { key: 'vendor_employee', label: 'Vendor Employee', description: 'Vendor company staff' },
];

const RLS_RESOURCES = [
  { key: 'accounts', label: 'Financial Accounts', internal: true },
  { key: 'assemblies', label: 'Assemblies', internal: true },
  { key: 'companies', label: 'Companies', internal: false },
  { key: 'inventory_items', label: 'Inventory Items', internal: true },
  { key: 'production_orders', label: 'Production Orders', internal: false },
  { key: 'purchase_orders', label: 'Purchase Orders', internal: true },
  { key: 'repair_orders', label: 'Repair Orders', internal: false },
  { key: 'suppliers', label: 'Suppliers', internal: true },
  { key: 'transactions', label: 'Financial Transactions', internal: true },
  { key: 'users', label: 'User Management', internal: false },
];

const SCOPES = {
  global: { label: 'Global', icon: '🌐', description: 'Access across all companies' },
  company: { label: 'Company', icon: '🏢', description: 'Access within same company' },
  subordinates: { label: 'Subordinates', icon: '👥', description: 'Access to managed users/data' },
  own: { label: 'Own', icon: '👤', description: 'Access to own data only' },
};

const ACTIONS = ['read', 'create', 'edit', 'delete'];

// Comprehensive RLS Permission scenarios with technical definitions and business context
const RLS_SCENARIOS: Record<string, Record<string, { definition: string; enable: string; disable: string }>> = {
  inventory_items: {
    global_read: {
      definition: "Allows viewing inventory quantities, pricing, and details for ALL companies in the system including competitors and all customer companies.",
      enable: "ENABLE for Sales Support: Turn this on if you want sales to see inventory levels across all customers to answer 'Do you have 50 soap dispensers available?' regardless of which customer is asking.",
      disable: "DISABLE for Car Wash Employee: Turn this off if you don't want regular customer staff seeing competitor inventory levels, other companies' stock quantities, or global inventory that isn't relevant to their location."
    },
    company_read: {
      definition: "Allows viewing inventory items and quantities only for the user's specific company - no access to other companies' inventory data.",
      enable: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to see inventory levels for products allocated to their company to plan orders and track shipments.",
      disable: "DISABLE for Production: Turn this off if you want manufacturing to see global inventory since they build products for all customers, not just one company."
    },
    own_create: {
      definition: "Allows creating new inventory item records that will be assigned to or owned by the current user's account/company.",
      enable: "ENABLE for Production: Turn this on if you want manufacturing to add new components they discover during R&D, create inventory records for substitute parts, and add items without waiting for approval.",
      disable: "DISABLE for Sales Support: Turn this off if you want new inventory items to go through engineering approval, cost analysis, and proper categorization before being added to the system."
    },
    global_edit: {
      definition: "Allows editing ANY inventory item across ALL companies including quantities, pricing, descriptions, and all product specifications in the entire system.",
      enable: "ENABLE for Admin: Turn this on if you want system administrators to fix inventory errors across all companies, update global pricing when supplier costs change, and manage inventory that affects all customers.",
      disable: "DISABLE for Distributor Admin: Turn this off if you don't want external distributor partners modifying your internal inventory quantities, changing product specifications, or updating data across your entire system."
    }
  },
  production_orders: {
    global_read: {
      definition: "Allows viewing ALL manufacturing orders for ALL customers including build schedules, priorities, customer names, and completion dates across your entire production operation.",
      enable: "ENABLE for Sales Support: Turn this on if you want sales to see all production orders so they can tell any customer 'Your order will be ready Friday' based on the actual production queue.",
      disable: "DISABLE for Car Wash Employee: Turn this off if you don't want customer employees seeing other customers' manufacturing schedules, competitive product builds, or your total production capacity."
    },
    company_read: {
      definition: "Allows viewing manufacturing orders only for the user's specific company - can see their own orders but not other customers' production schedules.",
      enable: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to track their own company's production status to plan installations and communicate progress to their customers.",
      disable: "DISABLE for Vendor Employee: Turn this off if you don't want raw material suppliers seeing customer production schedules, delivery dates, or manufacturing timelines."
    },
    own_create: {
      definition: "Allows creating new manufacturing orders for custom builds that will be assigned to the user's own company account.",
      enable: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to place custom build orders for special assemblies like soap dispensers with their company logo.",
      disable: "DISABLE for Car Wash Employee: Turn this off if you want custom builds to go through administrator approval rather than letting regular employees create manufacturing orders directly."
    },
    company_edit: {
      definition: "Allows editing manufacturing orders that belong to the user's company including quantities, specifications, delivery dates, and priorities.",
      enable: "ENABLE for Sales Support: Turn this on if you want sales to update customer production orders when they call to change quantities from 50 to 75 soap dispensers or modify delivery dates.",
      disable: "DISABLE for Production: Turn this off if you want manufacturing to build exactly what was ordered rather than changing customer requirements that might not match what the customer paid for."
    }
  },
  users: {
    global_read: {
      definition: "Allows viewing ALL user accounts across ALL companies, including internal staff and external customers.",
      enable: "ENABLE for Admin: System administrators need complete visibility into all user accounts for support, troubleshooting, and security management. When users have login issues or need account recovery, admin must be able to locate and assist any user in the system.",
      disable: "DISABLE for Car Wash Admin: External customer administrators should not see user accounts from other companies, your internal staff directory, or competitor user lists. This protects privacy and prevents customers from gaining insights into your business structure."
    },
    company_read: {
      definition: "Allows viewing user accounts that belong to the same company as the current user.",
      enable: "ENABLE for Car Wash Admin: Customer administrators need to see all users in their company to manage permissions, reset passwords, and coordinate access. For example, when an employee leaves, the admin needs to deactivate their account and reassign their responsibilities.",
      disable: "DISABLE for Car Wash Employee: Regular employees typically don't need to see all company users or manage other people's accounts. They should focus on their own work rather than user administration tasks."
    },
    subordinates_edit: {
      definition: "Allows editing user accounts for people who report to or are managed by the current user.",
      enable: "ENABLE for Car Wash Admin: Customer administrators need to manage their company's employee accounts, update contact information, and adjust permissions as roles change. For example, when promoting an employee to supervisor, the admin needs to update their access level.",
      disable: "DISABLE for Car Wash Employee: Regular employees shouldn't manage other user accounts, even if they're in supervisory roles. User management should be centralized with administrators to maintain security and consistency."
    },
    own_edit: {
      definition: "Allows editing the user's own profile, contact information, and personal settings.",
      enable: "ENABLE for Car Wash Employee: All users should be able to update their own profile information, change passwords, and modify personal preferences. This reduces administrative burden and keeps contact information current.",
      disable: "DISABLE if using SSO: When authentication is handled by external systems (like Microsoft Active Directory), profile updates might need to be managed through the SSO provider rather than allowing direct edits in your system."
    }
  },
  companies: {
    global_read: {
      definition: "Allows viewing ALL company profiles across the entire system, including competitors and business relationships.",
      enable: "ENABLE for Sales Support: Sales team needs visibility into all customer companies to identify sales opportunities, understand market relationships, and provide informed customer service. They can also identify potential partnerships or expansion opportunities.",
      disable: "DISABLE for Production: Manufacturing team doesn't need to browse customer company information or see business relationships. They should focus on building products rather than customer relationship management."
    },
    own_edit: {
      definition: "Allows editing the company profile that the user belongs to, including business information and settings.",
      enable: "ENABLE for Car Wash Admin: Customer administrators need to update their company's shipping addresses when they move locations, change contact information when staff changes, and modify business preferences as their needs evolve.",
      disable: "DISABLE for Car Wash Employee: Regular employees shouldn't change company-wide settings like billing addresses, payment terms, or business relationships. These changes should be managed by administrators to prevent errors."
    }
  },
  accounts: {
    global_read: {
      definition: "Allows viewing financial account information for ALL companies, including balances and payment history.",
      enable: "ENABLE for Accounting: Financial staff needs comprehensive visibility into all company accounts for consolidated reporting, collections management, and financial analysis. They need to see payment patterns, outstanding balances, and account status across your entire customer base.",
      disable: "DISABLE for Sales Support: Sales team should focus on order management and customer relationships rather than detailed financial account information. They can reference basic account status without needing access to sensitive financial details."
    },
    company_read: {
      definition: "Allows viewing financial account information for the user's specific company only.",
      enable: "ENABLE for Car Wash Admin: Customer administrators may need to see their company's account status to understand payment requirements, check outstanding balances before placing large orders, and verify billing information is correct.",
      disable: "DISABLE for Car Wash Employee: Regular employees don't need access to company financial account information, payment history, or billing details. This protects sensitive financial data from unnecessary exposure."
    }
  }
};

export function RLSPermissionMatrix() {
  const { permissions, rolePermissions, loading, updateRolePermission, refresh } = usePermissions();
  const [updatingPermissions, setUpdatingPermissions] = useState<Set<string>>(new Set());

  // Force refresh on component mount to ensure latest data
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Parse RLS permissions only
  const rlsPermissions = useMemo(() => {
    const structure: Record<string, Record<string, Record<string, any>>> = {};
    
    permissions.forEach(permission => {
      // Only process RLS permissions (category = 'rls' and scope_resource_action pattern)
      if (permission.category !== 'rls') return;
      
      const match = permission.name.match(/^(global|company|subordinates|own)_(.+)_(read|create|edit|delete)$/);
      if (!match) return;
      
      const [, scope, resource, action] = match;
      const resourceInfo = RLS_RESOURCES.find(r => r.key === resource);
      if (!resourceInfo) return;
      
      if (!structure[resource]) structure[resource] = {};
      if (!structure[resource][scope]) structure[resource][scope] = {};
      if (!structure[resource][scope][action]) structure[resource][scope][action] = {};
      
      structure[resource][scope][action] = {
        id: permission.id,
        name: permission.name,
        description: permission.description,
        resourceInfo
      };
    });
    
    return structure;
  }, [permissions]);

  const handlePermissionToggle = async (role: string, permissionId: string, currentValue: boolean) => {
    const key = `${role}-${permissionId}`;
    setUpdatingPermissions(prev => new Set(prev).add(key));
    
    try {
      const success = await updateRolePermission(role, permissionId, !currentValue);
      if (success) {
        toast.success(`Permission ${!currentValue ? 'granted' : 'revoked'} successfully`);
      } else {
        toast.error('Failed to update permission');
      }
    } catch (error) {
      console.error('Error updating permission:', error);
      toast.error('Error updating permission');
    } finally {
      setUpdatingPermissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  const getRolePermissionStatus = (role: string, permissionId: string): boolean => {
    return rolePermissions.some(rp => 
      rp.role === role && 
      rp.permission_id === permissionId && 
      rp.is_granted
    );
  };

  const getRLSTooltip = (resource: string, scope: string, action: string, roleKey: string, isGranted: boolean) => {
    const resourceScenarios = RLS_SCENARIOS[resource];
    if (!resourceScenarios) {
      const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
      const scopeLabel = scope.charAt(0).toUpperCase() + scope.slice(1);
      return (
        <div className="max-w-md">
          <div className="font-semibold text-primary mb-2">
            Controls ability to {action} {resource.replace(/_/g, ' ')} at {scope} scope level.
          </div>
          <div className="text-sm text-muted-foreground">
            {isGranted 
              ? `Currently enabled: User can ${action} ${resource} at ${scope} level. Click to disable.`
              : `Currently disabled: User cannot ${action} ${resource} at ${scope} level. Click to enable.`}
          </div>
        </div>
      );
    }

    const scenarioKey = `${scope}_${action}`;
    const scenario = resourceScenarios[scenarioKey];
    if (!scenario) {
      return (
        <div className="max-w-md">
          <div className="font-semibold text-primary mb-2">
            Controls {action} access to {resource.replace(/_/g, ' ')} at {scope} scope.
          </div>
          <div className="text-sm text-muted-foreground">
            {isGranted 
              ? `Currently enabled: Can ${action} ${resource} at ${scope} level`
              : `Currently disabled: Cannot ${action} ${resource} at ${scope} level`}
          </div>
        </div>
      );
    }

    const roleLabel = [...INTERNAL_ROLES, ...EXTERNAL_ROLES].find(r => r.key === roleKey)?.label || roleKey;
    const currentScenario = isGranted ? scenario.disable : scenario.enable;
    const action_word = isGranted ? 'DISABLE' : 'ENABLE';
    
    return (
      <div className="space-y-3 max-w-md">
        <div className="font-semibold text-primary">
          {scenario.definition}
        </div>
        <div className="border-t pt-2">
          <div className="font-medium text-sm mb-1">
            {action_word} for {roleLabel}:
          </div>
          <div className="text-sm text-muted-foreground">
            {currentScenario}
          </div>
        </div>
      </div>
    );
  };

  const renderPermissionMatrix = (roles: typeof INTERNAL_ROLES, isExternalView: boolean) => {
    console.log('renderPermissionMatrix called with roles:', roles.length, 'isExternalView:', isExternalView);
    console.log('rlsPermissions keys:', Object.keys(rlsPermissions));
    const filteredResources = RLS_RESOURCES.filter(resource => 
      !isExternalView || !resource.internal
    );
    console.log('filteredResources:', filteredResources.length);

    return (
      <div className="space-y-6">
        <div className="grid gap-4">
          {filteredResources.map(resource => {
            console.log('Processing resource:', resource.key);
            const resourcePermissions = rlsPermissions[resource.key];
            console.log('resourcePermissions for', resource.key, ':', resourcePermissions);
            if (!resourcePermissions) {
              console.log('No resourcePermissions found for:', resource.key);
              return null;
            }

            return (
              <Card key={resource.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        {resource.label}
                        {resource.internal && (
                          <Badge variant="secondary" className="text-xs">Internal Only</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Record-level access control for {resource.label.toLowerCase()}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Scope / Action</th>
                          {roles.map(role => (
                            <th key={role.key} className="text-center p-2 font-medium min-w-[100px]">
                              <div>
                                <div className="font-semibold">{role.label}</div>
                                <div className="text-xs text-muted-foreground">{role.description}</div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                       <tbody>
                         {Object.entries(SCOPES).flatMap(([scopeKey, scopeConfig]) => {
                           const scopePermissions = resourcePermissions[scopeKey];
                           if (!scopePermissions) return [];

                           return ACTIONS.map(action => {
                             const actionPermission = scopePermissions[action];
                             if (!actionPermission) return null;

                             return (
                               <tr key={`${scopeKey}-${action}`} className="border-b border-border/50">
                                 <td className="p-2">
                                   <div className="flex items-center gap-2">
                                     <span>{scopeConfig.icon}</span>
                                     <div>
                                       <div className="font-medium">
                                         {scopeConfig.label} {action.charAt(0).toUpperCase() + action.slice(1)}
                                       </div>
                                       <div className="text-xs text-muted-foreground">
                                         {scopeConfig.description}
                                       </div>
                                     </div>
                                   </div>
                                 </td>
                                 {roles.map(role => {
                                   const isGranted = getRolePermissionStatus(role.key, actionPermission.id);
                                   const isUpdating = updatingPermissions.has(`${role.key}-${actionPermission.id}`);
                                   const isAdminRole = role.key === 'admin';

                                   return (
                                     <td key={role.key} className="p-2 text-center">
                                       <div className="flex items-center justify-center">
                                         {isUpdating ? (
                                           <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                         ) : isAdminRole ? (
                                           <div className="flex items-center gap-2">
                                             <Switch checked={true} disabled={true} />
                                             <Tooltip>
                                               <TooltipTrigger>
                                                 <HelpCircle className="w-4 h-4 text-muted-foreground" />
                                               </TooltipTrigger>
                                               <TooltipContent>
                                                 <p>Admins always have all RLS permissions and cannot be modified.</p>
                                               </TooltipContent>
                                             </Tooltip>
                                           </div>
                                         ) : (
                                           <div className="flex items-center gap-2">
                                             <Switch
                                               checked={isGranted}
                                               onCheckedChange={() => 
                                                 handlePermissionToggle(role.key, actionPermission.id, isGranted)
                                               }
                                             />
                                             <Tooltip>
                                               <TooltipTrigger>
                                                 <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                                               </TooltipTrigger>
                                               <TooltipContent className="max-w-lg p-4">
                                                 {getRLSTooltip(resource.key, scopeKey, action, role.key, isGranted)}
                                               </TooltipContent>
                                             </Tooltip>
                                           </div>
                                         )}
                                       </div>
                                     </td>
                                   );
                                 })}
                               </tr>
                             );
                           }).filter(Boolean);
                         })}
                       </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading RLS permissions...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

      <Tabs defaultValue="internal" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="internal">Internal Roles</TabsTrigger>
          <TabsTrigger value="external">External Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Internal Roles - Record Access Control</h3>
            <p className="text-sm text-muted-foreground">
              Configure which internal users can access records at different scopes. 
              Internal roles have access to all system resources including sensitive operational data.
            </p>
          </div>
          {renderPermissionMatrix(INTERNAL_ROLES, false)}
        </TabsContent>

        <TabsContent value="external" className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">External Roles - Record Access Control</h3>
            <p className="text-sm text-muted-foreground">
              Configure which external users (customers, vendors) can access records.
              External roles are limited to non-sensitive resources and their own company data.
            </p>
          </div>
          {renderPermissionMatrix(EXTERNAL_ROLES, true)}
        </TabsContent>
      </Tabs>
      </div>
    </TooltipProvider>
  );
}