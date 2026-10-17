import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2, Shield, Users, Settings, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

const INTERNAL_ROLES = [
  { key: 'admin', label: 'Admin', description: 'Full system access' },
  { key: 'sales_support', label: 'Sales Support', description: 'Customer and sales management' },
  { key: 'production', label: 'Production', description: 'Manufacturing and assembly' },
  { key: 'accounting', label: 'Accounting', description: 'Financial management and reporting' },
  { key: 'marketing', label: 'Marketing', description: 'Customer outreach and sales support' },
];

const EXTERNAL_ROLES = [
  { key: 'car_wash_admin', label: 'Car Wash Admin', description: 'Car wash company management' },
  { key: 'car_wash_employee', label: 'Car Wash Employee', description: 'Basic car wash operations' },
  { key: 'distributor_admin', label: 'Distributor Admin', description: 'Distributor management' },
  { key: 'distributor_employee', label: 'Distributor Employee', description: 'Distributor operations' },
  { key: 'vendor_admin', label: 'Vendor Admin', description: 'Vendor management' },
  { key: 'vendor_employee', label: 'Vendor Employee', description: 'Vendor operations' },
];

const ALL_ROLES = [...INTERNAL_ROLES, ...EXTERNAL_ROLES];

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  user_management: <Users className="w-4 h-4" />,
  system: <Settings className="w-4 h-4" />,
  default: <Shield className="w-4 h-4" />,
};

// Comprehensive permission scenarios with technical definitions and business context
const PERMISSION_SCENARIOS: Record<string, { 
  definition: string; 
  enable: string; 
  disable: string;
  enableInternal?: string;
  disableInternal?: string;
  enableExternal?: string;
  disableExternal?: string;
}> = {
  'manage_users': {
    definition: "Allows creating new user accounts, editing existing user profiles, deleting inactive users, and assigning/removing role permissions like 'admin', 'car_wash_employee', etc.",
    enable: "ENABLE for Sales Support: Turn this on if you want your sales team to create customer login accounts when new car wash companies sign up, edit customer contact information when they move locations, and assign the 'car_wash_admin' role to customer managers. Without this, sales can't onboard new customers or help with account issues.",
    disable: "DISABLE for Production: Turn this off if you don't want manufacturing staff creating user accounts, changing customer passwords, or accidentally assigning wrong permissions. Production should build products, not manage who can log into your system.",
    enableInternal: "ENABLE for Sales Support: Turn this on if you want sales team to create new user accounts for customers, update contact information, and assign proper roles during customer onboarding.",
    disableInternal: "DISABLE for Production: Turn this off if you don't want manufacturing staff managing user accounts, passwords, or role assignments - they should focus on building products.",
    enableExternal: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to create accounts for their employees, manage their team's access, and assign roles within their company.",
    disableExternal: "DISABLE for Car Wash Employee: Turn this off if you don't want regular customer employees creating accounts or changing user permissions - this should be restricted to administrators."
  },
  'view_users': {
    definition: "Allows viewing all user profiles, email addresses, phone numbers, roles, and which company each user belongs to across the entire system.",
    enable: "ENABLE for Accounting: Turn this on if you want accounting to see which sales rep worked with each customer for commission calculations, or to verify that someone requesting a 20% distributor discount actually has the 'distributor_admin' role in your system.",
    disable: "DISABLE for Car Wash Employee: Turn this off if you don't want regular customer employees browsing your complete user directory, seeing competitor contact information, or viewing your internal staff's personal details.",
    enableInternal: "ENABLE for Accounting: Turn this on if you want accounting to see which sales rep worked with each customer for commission calculations and verify user roles for discount eligibility.",
    disableInternal: "DISABLE for Production: Turn this off if you don't want manufacturing staff browsing customer user directories or seeing contact information that's not relevant to production.",
    enableExternal: "ENABLE for Distributor Admin: Turn this on if you want distributor administrators to see user lists within their organization for managing their team and coordinating with customers.",
    disableExternal: "DISABLE for Vendor Employee: Turn this off if you don't want vendor staff seeing your customer user information, contact details, or organizational structure."
  },
  'manage_companies': {
    definition: "Allows creating new company records, editing billing/shipping addresses, changing payment terms (Net 30, COD, etc.), setting credit limits, and enabling/disabling distributor discount eligibility.",
    enable: "ENABLE for Sales Support: Turn this on if you want sales to create new company profiles when signing up car wash chains, update shipping addresses when companies relocate, change payment terms from COD to Net 30 for established customers, and enable the 25% distributor discount for qualifying distributors.",
    disable: "DISABLE for Production: Turn this off if you don't want manufacturing staff accidentally changing where orders ship, modifying customer payment terms from Net 30 to immediate payment, or disabling discounts that affect customer pricing.",
    enableInternal: "ENABLE for Sales Support: Turn this on if you want sales to create company profiles, update addresses, configure payment terms, and manage business relationships.",
    disableInternal: "DISABLE for Production: Turn this off if you don't want manufacturing changing shipping addresses, payment terms, or business settings that could affect order delivery.",
    enableExternal: "ENABLE for Distributor Admin: Turn this on if you want distributor administrators to update their own company information, shipping addresses, and business details.",
    disableExternal: "DISABLE for Car Wash Employee: Turn this off if you don't want regular employees changing company-wide settings like billing addresses or payment terms."
  },
  'view_companies': {
    definition: "Allows viewing all company names, addresses, contact information, credit limits, payment terms, discount levels, and relationship status across your entire customer base.",
    enable: "ENABLE for Sales Support: Turn this on if you want sales to see all customer companies to identify upselling opportunities, check competitor pricing levels, and understand market relationships when prospecting new accounts.",
    disable: "DISABLE for Car Wash Employee: Turn this off if you don't want regular customer employees seeing competitor company information, your other customers' discount rates, or browsing your complete customer directory.",
    enableInternal: "ENABLE for Sales Support: Turn this on if you want sales to see all customer companies for prospecting, relationship management, and identifying business opportunities.",
    disableInternal: "DISABLE for Production: Turn this off if you don't want manufacturing staff browsing customer company information that's not relevant to production planning.",
    enableExternal: "ENABLE for Distributor Admin: Turn this on if you want distributors to see other companies in their network for partnership opportunities and market understanding.",
    disableExternal: "DISABLE for Vendor Employee: Turn this off if you don't want vendors seeing your customer company list, pricing levels, or business relationships."
  },
  'manage_inventory': {
    definition: "Allows creating new product SKUs, editing item descriptions/pricing, adjusting quantity on hand, changing reorder points, and deleting obsolete inventory items.",
    enable: "ENABLE for Production: Turn this on if you want manufacturing to adjust inventory quantities when they use parts in builds, add new items they discover during R&D, and update stock levels when they find damaged goods. Without this, they can't track what they actually have in stock.",
    disable: "DISABLE for Car Wash Employee: Turn this off if you don't want customers changing your inventory quantities, creating fake product SKUs, or seeing your actual cost prices. Customers should place orders, not manage your warehouse.",
    enableInternal: "ENABLE for Production: Turn this on if you want manufacturing to adjust quantities during builds, add new R&D items, and manage stock levels based on actual usage.",
    disableInternal: "DISABLE for Accounting: Turn this off if you want inventory changes to go through proper workflows rather than allowing accounting to modify stock levels directly.",
    enableExternal: "ENABLE for Distributor Admin: Turn this on if you want distributors to manage inventory allocated to their locations and update quantities based on their sales.",
    disableExternal: "DISABLE for Car Wash Employee: Turn this off if you don't want regular customers modifying inventory quantities, pricing, or creating new product records."
  },
  'view_inventory': {
    definition: "Allows viewing all product SKUs, quantities on hand, reorder points, unit costs, selling prices, and supplier information across your complete inventory catalog.",
    enable: "ENABLE for Sales Support: Turn this on if you want sales to check real-time stock levels when customers ask 'Do you have 50 soap dispensers available?', see product costs to calculate custom pricing, and know reorder points to set delivery expectations.",
    disable: "DISABLE for Vendor Employee: Turn this off if you don't want your raw material suppliers seeing your finished product inventory levels, profit margins, or customer demand patterns. They supply parts to you, not track your business intelligence.",
    enableInternal: "ENABLE for Sales Support: Turn this on if you want sales to check stock levels, see costs for pricing calculations, and provide accurate delivery estimates to customers.",
    disableInternal: "DISABLE for Marketing: Turn this off if marketing only handles campaigns and doesn't need detailed inventory costs, quantities, or supplier information.",
    enableExternal: "ENABLE for Distributor Employee: Turn this on if you want distributor staff to check availability when customers call asking about stock levels and delivery dates.",
    disableExternal: "DISABLE for Vendor Employee: Turn this off if you don't want suppliers seeing your finished goods inventory, profit margins, or demand patterns."
  },
  'manage_production_orders': {
    definition: "Allows creating new manufacturing orders, editing build quantities, changing production priorities, assigning orders to specific workers, updating status from 'pending' to 'completed', and canceling orders.",
    enable: "ENABLE for Production: Turn this on if you want manufacturing managers to create build orders for custom assemblies, expedite rush orders for important customers, and update order status as products move through your production line.",
    disable: "DISABLE for Car Wash Employee: Turn this off if you don't want customers creating their own manufacturing orders, changing production schedules, or seeing other customers' build priorities in your factory.",
    enableInternal: "ENABLE for Production: Turn this on if you want manufacturing managers to create build orders, set priorities, and manage the production workflow.",
    disableInternal: "DISABLE for Accounting: Turn this off if you want production decisions to stay with manufacturing rather than allowing accounting to change build schedules.",
    enableExternal: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to place custom build orders and modify their own production requirements.",
    disableExternal: "DISABLE for Distributor Employee: Turn this off if you don't want distributor staff creating production orders that could interfere with your manufacturing schedule."
  },
  'view_production_orders': {
    definition: "Allows viewing all manufacturing orders including customer names, product details, build quantities, production status, assigned workers, and estimated completion dates.",
    enable: "ENABLE for Sales Support: Turn this on if you want sales to see production schedules so they can tell customers 'Your 100 soap dispensers will be ready Friday' instead of guessing delivery dates.",
    disable: "DISABLE for Distributor Employee: Turn this off if you don't want external distributors seeing your manufacturing capacity, other customers' production priorities, or how long your builds actually take.",
    enableInternal: "ENABLE for Sales Support: Turn this on if you want sales to see production schedules for accurate customer delivery estimates and better customer service.",
    disableInternal: "DISABLE for Marketing: Turn this off if marketing doesn't need to see detailed production schedules and manufacturing timelines.",
    enableExternal: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to track their own production orders and see estimated completion dates.",
    disableExternal: "DISABLE for Vendor Employee: Turn this off if you don't want suppliers seeing your production schedules, customer orders, or manufacturing capacity."
  },
  'manage_purchase_orders': {
    definition: "Allows creating purchase orders to suppliers, editing order quantities and delivery dates, changing supplier information, approving/canceling orders, and managing vendor payment terms.",
    enable: "ENABLE for Production: Turn this on if you want manufacturing to order raw materials when they run low on components, change delivery dates when production schedules shift, and work directly with suppliers on quality issues.",
    disable: "DISABLE for Car Wash Employee: Turn this off if you don't want customers placing orders with your suppliers, seeing your component costs, or accidentally ordering materials that get charged to your accounts.",
    enableInternal: "ENABLE for Production: Turn this on if you want manufacturing to order components directly when needed and manage supplier relationships for better production flow.",
    disableInternal: "DISABLE for Sales Support: Turn this off if you want purchasing to go through proper procurement workflows rather than allowing sales to order materials.",
    enableExternal: "ENABLE for Distributor Admin: Turn this on if you want distributors to place orders for products they'll resell, managing their own purchasing workflow.",
    disableExternal: "DISABLE for Car Wash Employee: Turn this off if you don't want regular customers accessing your supplier network or placing orders that affect your procurement."
  },
  'view_purchase_orders': {
    definition: "Allows viewing all purchase orders including supplier names, component costs, order quantities, delivery dates, and payment terms across your entire procurement operation.",
    enable: "ENABLE for Accounting: Turn this on if you want accounting to verify supplier invoices match actual purchase orders, track spending against budgets, and ensure proper approvals before paying vendor bills.",
    disable: "DISABLE for Car Wash Admin: Turn this off if you don't want customers seeing what you pay suppliers for raw materials, your vendor relationships, or component costs that reveal your profit margins.",
    enableInternal: "ENABLE for Accounting: Turn this on if you want accounting to verify invoices, track procurement spending, and ensure proper approval workflows.",
    disableInternal: "DISABLE for Production: Turn this off if production should focus on using materials rather than reviewing detailed procurement costs and supplier relationships.",
    enableExternal: "ENABLE for Distributor Admin: Turn this on if you want distributors to see purchase orders they've placed and track their own procurement status.",
    disableExternal: "DISABLE for Car Wash Admin: Turn this off if you don't want customers seeing your supplier costs, vendor relationships, or procurement details."
  },
  'manage_permissions': {
    definition: "Allows assigning roles like 'admin' or 'car_wash_employee' to users, granting/revoking specific permissions like 'view_inventory' or 'manage_companies', and controlling what users can access in the system.",
    enable: "ENABLE for Sales Support: Turn this on if you want sales to assign the 'car_wash_admin' role to new customer managers, grant 'view_production_orders' permission so customers can track their builds, and configure what each customer user can see.",
    disable: "DISABLE for Production: Turn this off if you don't want manufacturing staff changing who can log in, accidentally giving customers admin access, or locking out users by removing their permissions.",
    enableInternal: "ENABLE for Sales Support: Turn this on if you want sales to configure customer access during onboarding and assign appropriate roles for new users.",
    disableInternal: "DISABLE for Production: Turn this off if you don't want manufacturing managing security permissions or user access controls.",
    enableExternal: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to manage permissions within their own company and assign roles to their employees.",
    disableExternal: "DISABLE for Distributor Employee: Turn this off if you don't want regular distributor staff changing permissions or user access levels."
  },
  'default': {
    definition: "This permission controls access to specific system functionality.",
    enable: "Enable this permission when the role requires this functionality for their core job responsibilities and the access aligns with your business security policies.",
    disable: "Disable this permission when the role doesn't need this functionality or when granting access could pose security, compliance, or operational risks."
  }
};

export function PermissionMatrix() {
  const { 
    permissions, 
    loading, 
    updateRolePermission, 
    getPermissionsByCategory, 
    getRolePermissionStatus 
  } = usePermissions();
  const [updatingPermissions, setUpdatingPermissions] = useState<Set<string>>(new Set());

  const handlePermissionToggle = async (role: string, permissionId: string, currentValue: boolean) => {
    const updateKey = `${role}-${permissionId}`;
    setUpdatingPermissions(prev => new Set([...prev, updateKey]));

    try {
      const success = await updateRolePermission(role, permissionId, !currentValue);
      if (success) {
        toast.success(`Permission ${!currentValue ? 'granted' : 'revoked'} successfully`);
      } else {
        toast.error('Failed to update permission');
      }
    } catch (error) {
      toast.error('Error updating permission');
    } finally {
      setUpdatingPermissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(updateKey);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const categorizedPermissions = getPermissionsByCategory();

  const getPermissionTooltip = (permissionName: string, roleKey: string, isGranted: boolean) => {
    const scenarios = PERMISSION_SCENARIOS[permissionName] || PERMISSION_SCENARIOS.default;
    const roleLabel = ALL_ROLES.find(r => r.key === roleKey)?.label || roleKey;
    const action = isGranted ? 'DISABLE' : 'ENABLE';
    
    // Determine if this is an internal or external role to provide contextual examples
    const isInternalRole = INTERNAL_ROLES.some(r => r.key === roleKey);
    const isExternalRole = EXTERNAL_ROLES.some(r => r.key === roleKey);
    
    // Get contextual scenario based on role type
    let currentScenario = isGranted ? scenarios.disable : scenarios.enable;
    
    // Adjust scenario based on role context if available
    if (scenarios.enableInternal && scenarios.disableInternal && isInternalRole) {
      currentScenario = isGranted ? scenarios.disableInternal : scenarios.enableInternal;
    } else if (scenarios.enableExternal && scenarios.disableExternal && isExternalRole) {
      currentScenario = isGranted ? scenarios.disableExternal : scenarios.enableExternal;
    }
    
    return (
      <div className="space-y-3 max-w-md">
        <div className="font-semibold text-primary">
          {scenarios.definition}
        </div>
        <div className="border-t pt-2">
          <div className="font-medium text-sm mb-1">
            {action} for {roleLabel}:
          </div>
          <div className="text-sm text-muted-foreground">
            {currentScenario}
          </div>
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">

      <Tabs defaultValue="internal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="internal">Internal Roles</TabsTrigger>
          <TabsTrigger value="external">External Roles</TabsTrigger>
          <TabsTrigger value="overview">Role Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Internal Role Permissions
              </CardTitle>
              <CardDescription>
                Manage all permissions for internal team members (Admin, Sales Support, Production, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Permission</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      {INTERNAL_ROLES.map(role => (
                        <th key={role.key} className="text-center p-3 font-medium min-w-[120px]">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-semibold">{role.label}</span>
                            <span className="text-xs text-muted-foreground">{role.description}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(categorizedPermissions).map(([category, categoryPermissions]) =>
                      categoryPermissions.map((permission, index) => (
                        <tr key={permission.id} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">{permission.name}</div>
                              {permission.description && (
                                <div className="text-sm text-muted-foreground">
                                  {permission.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                              {CATEGORY_ICONS[category] || CATEGORY_ICONS.default}
                              {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          </td>
                          {INTERNAL_ROLES.map(role => {
                            const isGranted = getRolePermissionStatus(role.key, permission.id);
                            const updateKey = `${role.key}-${permission.id}`;
                            const isUpdating = updatingPermissions.has(updateKey);
                            
                            return (
                              <td key={role.key} className="p-3 text-center">
                                <div className="flex items-center justify-center">
                                  {isUpdating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : role.key === 'admin' ? (
                                    <div className="flex items-center gap-2">
                                      <Switch checked={true} disabled={true} />
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <HelpCircle className="w-4 h-4 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Admins always have all permissions and cannot be modified.</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={isGranted}
                                        onCheckedChange={() => 
                                          handlePermissionToggle(role.key, permission.id, isGranted)
                                        }
                                      />
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-lg p-4">
                                          {getPermissionTooltip(permission.name, role.key, isGranted)}
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="external" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                External Role Permissions
              </CardTitle>
              <CardDescription>
                Manage all permissions for external partners (Car Wash, Distributors, Vendors, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Permission</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      {EXTERNAL_ROLES.map(role => (
                        <th key={role.key} className="text-center p-3 font-medium min-w-[120px]">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-semibold">{role.label}</span>
                            <span className="text-xs text-muted-foreground">{role.description}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(categorizedPermissions).map(([category, categoryPermissions]) =>
                      categoryPermissions.map((permission, index) => (
                        <tr key={permission.id} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <div>
                              <div className="font-medium">{permission.name}</div>
                              {permission.description && (
                                <div className="text-sm text-muted-foreground">
                                  {permission.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                              {CATEGORY_ICONS[category] || CATEGORY_ICONS.default}
                              {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          </td>
                          {EXTERNAL_ROLES.map(role => {
                            const isGranted = getRolePermissionStatus(role.key, permission.id);
                            const updateKey = `${role.key}-${permission.id}`;
                            const isUpdating = updatingPermissions.has(updateKey);
                            
                            return (
                              <td key={role.key} className="p-3 text-center">
                                <div className="flex items-center justify-center">
                                  {isUpdating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={isGranted}
                                        onCheckedChange={() => 
                                          handlePermissionToggle(role.key, permission.id, isGranted)
                                        }
                                      />
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-lg p-4">
                                          {getPermissionTooltip(permission.name, role.key, isGranted)}
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Internal Roles</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {INTERNAL_ROLES.map(role => {
                  const rolePermissionCount = permissions.filter(permission => 
                    getRolePermissionStatus(role.key, permission.id)
                  ).length;

                  return (
                    <Card key={role.key}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          {role.label}
                          <Badge variant="secondary">
                            {rolePermissionCount} permissions
                          </Badge>
                        </CardTitle>
                        <CardDescription>{role.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {Object.entries(categorizedPermissions).map(([category, categoryPermissions]) => {
                            const categoryCount = categoryPermissions.filter(permission =>
                              getRolePermissionStatus(role.key, permission.id)
                            ).length;
                            
                            if (categoryCount === 0) return null;

                            return (
                              <div key={category} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                                <span>{categoryCount}/{categoryPermissions.length}</span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">External Roles</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {EXTERNAL_ROLES.map(role => {
                  const rolePermissionCount = permissions.filter(permission => 
                    getRolePermissionStatus(role.key, permission.id)
                  ).length;

                  return (
                    <Card key={role.key}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          {role.label}
                          <Badge variant="secondary">
                            {rolePermissionCount} permissions
                          </Badge>
                        </CardTitle>
                        <CardDescription>{role.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {Object.entries(categorizedPermissions).map(([category, categoryPermissions]) => {
                            const categoryCount = categoryPermissions.filter(permission =>
                              getRolePermissionStatus(role.key, permission.id)
                            ).length;
                            
                            if (categoryCount === 0) return null;

                            return (
                              <div key={category} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                                <span>{categoryCount}/{categoryPermissions.length}</span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </TooltipProvider>
  );
}