import React, { useState, useMemo } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { RefreshCw, Loader2, Eye, Lock, DollarSign, CreditCard, Users, HelpCircle } from 'lucide-react';
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

export function FieldSecurityMatrix() {
  const { permissions, rolePermissions, loading, updateRolePermission, refresh } = usePermissions();
  const [updatingPermissions, setUpdatingPermissions] = useState<Set<string>>(new Set());

  // Group field permissions by category and field
  const fieldPermissions = useMemo(() => {
    console.log('🔍 Total permissions available:', permissions.length);
    
    // Filter for field-level permissions that match our pattern
    const fieldLevelPerms = permissions.filter(permission => {
      const isFieldLevel = /^(company|global|own)_\w+_\w+_read$/.test(permission.name);
      if (isFieldLevel && permission.name.includes('accounts')) {
        console.log('✅ Found account field permission:', permission.name);
      }
      return isFieldLevel && permission.name.includes('accounts');
    });

    console.log('🎯 Account field permissions found:', fieldLevelPerms.length);
    console.log('📋 Account permissions:', fieldLevelPerms.map(p => p.name));
    
    // Group permissions by category and field
    const grouped: Record<string, Record<string, any[]>> = {};
    
    fieldLevelPerms.forEach(permission => {
      const parts = permission.name.split('_');
      const scope = parts[0];
      const category = parts[1]; // e.g., 'accounts'
      const field = parts.slice(2, -1).join('_');
      
      if (!grouped[category]) grouped[category] = {};
      if (!grouped[category][field]) grouped[category][field] = [];
      
      grouped[category][field].push({
        ...permission,
        scope,
        field
      });
    });
    
    return grouped;
  }, [permissions]);

  const getRolePermissionStatus = (role: string, permissionId: string): boolean => {
    return rolePermissions.some(rp => 
      rp.role === role && 
      rp.permission_id === permissionId && 
      rp.is_granted
    );
  };

  const handlePermissionToggle = async (role: string, permissionId: string, currentValue: boolean) => {
    const key = `${role}-${permissionId}`;
    setUpdatingPermissions(prev => new Set(prev).add(key));
    
    try {
      const success = await updateRolePermission(role, permissionId, !currentValue);
      if (success) {
        toast.success(`Field permission ${!currentValue ? 'granted' : 'revoked'} successfully`);
      } else {
        toast.error('Failed to update field permission');
      }
    } catch (error) {
      console.error('Error updating field permission:', error);
      toast.error('Error updating field permission');
    } finally {
      setUpdatingPermissions(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
  };

  // Define field categories with icons and metadata
  const FIELD_CATEGORIES = {
    accounts: {
      label: 'Financial Accounts',
      icon: DollarSign,
      description: 'Account management and financial data'
    }
  };

  const FIELD_ICONS = {
    account_number: CreditCard,
    current_balance: DollarSign,
    account_name: Users,
    default: Eye
  };

  const SCOPE_CONFIG = {
    global: { label: 'Global', icon: '🌐', description: 'Access across all companies' },
    company: { label: 'Company', icon: '🏢', description: 'Access within same company' },
    own: { label: 'Own', icon: '👤', description: 'Access to own data only' }
  };

  // Comprehensive field-level permission scenarios
  const FIELD_SCENARIOS: Record<string, Record<string, { definition: string; enable: string; disable: string }>> = {
    account_number: {
      global: {
        definition: "Allows viewing account numbers (like ACT-12345) for ALL companies in the system including competitors and all your customers.",
        enable: "ENABLE for Accounting: Turn this on if you want accounting to see all customer account numbers for payment processing, financial reporting, and audit trails.",
        disable: "DISABLE for Sales Support: Turn this off if you don't want sales seeing sensitive financial account numbers that could be accidentally disclosed to competitors or other customers."
      },
      company: {
        definition: "Allows viewing account numbers only for the user's specific company - they can see their own company account number but not other companies'.",
        enable: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to see their company's account number when making payments or calling your support team.",
        disable: "DISABLE for Car Wash Employee: Turn this off if you don't want regular employees accessing company financial account numbers that could be accidentally shared."
      },
      own: {
        definition: "Allows viewing account numbers only for records that belong to or are owned by the current user's personal account.",
        enable: "ENABLE for users managing personal accounts: Turn this on if users have personal accounts or manage specific account relationships and need to see account numbers for payments.",
        disable: "DISABLE if using external billing: Turn this off when your ERP or billing system handles account numbers separately and users reference accounts through external systems."
      }
    },
    current_balance: {
      global: {
        definition: "Allows viewing current account balances (like $-2,450.00 or $15,680.32) for ALL companies in the system showing what each customer owes or has on account.",
        enable: "ENABLE for Accounting: Turn this on if you want accounting to see all customer balances for collections, credit decisions, and financial reporting.",
        disable: "DISABLE for Production: Turn this off if you don't want manufacturing seeing customer payment history or outstanding balances that don't affect production decisions."
      },
      company: {
        definition: "Allows viewing the current account balance only for the user's specific company - they can see what their company owes but not other companies' balances.",
        enable: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to see their company's current balance before placing large orders or to verify billing accuracy.",
        disable: "DISABLE for Car Wash Employee: Turn this off if you don't want regular employees seeing sensitive company financial information that should be restricted to administrators."
      },
      own: {
        definition: "Allows viewing account balances only for records owned by the current user - they can see their personal account balance but not company or other user balances.",
        enable: "ENABLE for users with personal accounts: Turn this on when individuals have personal accounts and need to see their balance to manage spending decisions.",
        disable: "DISABLE for roles without financial responsibility: Turn this off when users don't make purchasing decisions and balance information isn't relevant to their job functions."
      }
    },
    account_name: {
      global: {
        definition: "Allows viewing account names (like 'Mike's Express Car Wash' or 'Downtown Auto Detailing LLC') for ALL companies across the entire system.",
        enable: "ENABLE for Sales Support: Turn this on if you want sales to see all customer account names to help customers during support calls and identify accounts during order processing.",
        disable: "DISABLE for Vendor Employee: Turn this off if you don't want external vendors seeing your customer account names, which protects customer privacy and prevents vendors from using your customer list for their own sales."
      },
      company: {
        definition: "Allows viewing account names only for the user's specific company - they can see their own company name but not other companies' account names.",
        enable: "ENABLE for Car Wash Admin: Turn this on if you want customer administrators to see their company's account name to verify billing correspondence and confirm account setup.",
        disable: "DISABLE if using display names: Turn this off when your system uses separate display names for customer-facing purposes and the formal account name isn't needed."
      },
      own: {
        definition: "Allows viewing account names only for records owned by the current user - they can see their own account name but not company or other user account names.",
        enable: "ENABLE for all roles: Turn this on since users typically need to see their own account name for profile management and account verification.",
        disable: "DISABLE only for SSO: Turn this off only when account names are managed by external identity systems like corporate SSO and users reference accounts through those systems."
      }
    }
  };

  const getFieldTooltip = (fieldKey: string, scope: string, roleKey: string, isGranted: boolean) => {
    const fieldScenarios = FIELD_SCENARIOS[fieldKey];
    if (!fieldScenarios) {
      return (
        <div className="max-w-md">
          <div className="font-semibold text-primary mb-2">
            Controls visibility of {fieldKey.replace(/_/g, ' ')} field at {scope} scope level.
          </div>
          <div className="text-sm text-muted-foreground">
            {isGranted 
              ? `Currently enabled: User can view ${fieldKey} at ${scope} level. Click to disable.`
              : `Currently disabled: User cannot view ${fieldKey} at ${scope} level. Click to enable.`}
          </div>
        </div>
      );
    }

    const scopeScenarios = fieldScenarios[scope];
    if (!scopeScenarios) {
      return (
        <div className="max-w-md">
          <div className="font-semibold text-primary mb-2">
            Controls {fieldKey.replace(/_/g, ' ')} field visibility at {scope} scope.
          </div>
          <div className="text-sm text-muted-foreground">
            {isGranted 
              ? `Currently enabled: Can view ${fieldKey} at ${scope} level`
              : `Currently disabled: Cannot view ${fieldKey} at ${scope} level`}
          </div>
        </div>
      );
    }

    const roleLabel = [...INTERNAL_ROLES, ...EXTERNAL_ROLES].find(r => r.key === roleKey)?.label || roleKey;
    const currentScenario = isGranted ? scopeScenarios.disable : scopeScenarios.enable;
    const action = isGranted ? 'DISABLE' : 'ENABLE';
    
    return (
      <div className="space-y-3 max-w-md">
        <div className="font-semibold text-primary">
          {scopeScenarios.definition}
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

  const renderFieldMatrix = (roles: typeof INTERNAL_ROLES) => {
    if (Object.keys(fieldPermissions).length === 0) {
      return (
        <div className="text-center p-4 text-muted-foreground">
          No account field permissions found.
          <div className="text-xs mt-2">
            Total permissions loaded: {permissions.length}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {Object.entries(fieldPermissions).map(([categoryKey, categoryFields]) => {
          const categoryConfig = FIELD_CATEGORIES[categoryKey as keyof typeof FIELD_CATEGORIES];
          if (!categoryConfig) return null;

          const CategoryIcon = categoryConfig.icon;

          return (
            <Card key={categoryKey}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CategoryIcon className="h-4 w-4" />
                      {categoryConfig.label}
                    </CardTitle>
                    <CardDescription>
                      {categoryConfig.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Field / Scope</th>
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
                      {Object.entries(categoryFields)
                        .flatMap(([fieldKey, fieldPermissions]) => {
                          const FieldIcon = FIELD_ICONS[fieldKey as keyof typeof FIELD_ICONS] || FIELD_ICONS.default;
                          const isSensitive = ['account_number', 'current_balance'].includes(fieldKey);
                          
                          return fieldPermissions.map(permission => ({
                            fieldKey,
                            FieldIcon,
                            isSensitive,
                            permission
                          }));
                        })
                        .sort((a, b) => {
                          // First sort by scope: global, company, own
                          const scopeOrder = ['global', 'company', 'own'];
                          const scopeCompare = scopeOrder.indexOf(a.permission.scope) - scopeOrder.indexOf(b.permission.scope);
                          if (scopeCompare !== 0) return scopeCompare;
                          
                          // Then sort by field name
                          return a.fieldKey.localeCompare(b.fieldKey);
                        })
                        .map(({ fieldKey, FieldIcon, isSensitive, permission }) => {
                          const scopeConfig = SCOPE_CONFIG[permission.scope as keyof typeof SCOPE_CONFIG];
                          
                          return (
                            <tr key={permission.id} className="border-b border-border/50">
                              <td className="p-2">
                                <div className="flex items-center gap-2">
                                  <span>{scopeConfig?.icon}</span>
                                  <FieldIcon className="h-4 w-4" />
                                  <div>
                                    <div className="font-medium flex items-center gap-2">
                                      {fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                      {isSensitive && (
                                        <Badge variant="destructive" className="text-xs">Sensitive</Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {scopeConfig?.label} - {scopeConfig?.description}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {roles.map(role => {
                                const isGranted = getRolePermissionStatus(role.key, permission.id);
                                const isUpdating = updatingPermissions.has(`${role.key}-${permission.id}`);
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
                                              <p>Admins always have access to all fields and cannot be modified.</p>
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
                                            {getFieldTooltip(fieldKey, permission.scope, role.key, isGranted)}
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
                         })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading field permissions...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Field Security Matrix</h2>
            <p className="text-muted-foreground">
              Control field visibility ({permissions.length} total permissions, {Object.values(fieldPermissions).flat().flat().length} field permissions). Hover over switches for real-world scenarios.
            </p>
          </div>
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
            <h3 className="font-semibold mb-2">Internal Roles - Field Security</h3>
            <p className="text-sm text-muted-foreground">
              Configure which account fields internal users can view within accessible records.
            </p>
          </div>
          {renderFieldMatrix(INTERNAL_ROLES)}
        </TabsContent>

        <TabsContent value="external" className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">External Roles - Field Security</h3>
            <p className="text-sm text-muted-foreground">
              Configure which account fields external users can view.
            </p>
          </div>
          {renderFieldMatrix(EXTERNAL_ROLES)}
        </TabsContent>
      </Tabs>
      </div>
    </TooltipProvider>
  );
}