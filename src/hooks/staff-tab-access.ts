export const STAFF_TABS = [
  { id: 'orders', label: 'Customer Orders', permission: 'view_production_orders' },
  { id: 'inventory', label: 'Inventory & Assemblies', permission: 'view_inventory' },
  { id: 'waste-analytics', label: 'Waste Analytics', permission: 'view_inventory_analytics' },
  { id: 'purchasing', label: 'Purchase Orders', permission: 'view_purchase_orders' },
  { id: 'receiving', label: 'Receiving', permission: 'view_repair_orders' },
  { id: 'repair-lookup', label: 'Repair Lookup', permission: 'view_repair_orders' },
  { id: 'customers', label: 'Customer Management', permission: 'view_customers' },
  { id: 'vendors', label: 'Vendor Management', permission: 'view_suppliers' },
  { id: 'accounting', label: 'Accounting', permission: 'view_accounting' },
  { id: 'users', label: 'User Management', permission: null },
] as const;

export type StaffTab = typeof STAFF_TABS[number]['id'];
const ROLE_TABS: Record<string, readonly StaffTab[]> = {
  production: ['orders', 'inventory'],
  repair: ['receiving', 'repair-lookup'],
  shipping_receiving: ['receiving', 'orders'],
  accounting: ['accounting'],
  sales: ['customers', 'orders', 'vendors'],
  // Ops_OS stores the sales role as sales_support.
  sales_support: ['customers', 'orders', 'vendors'],
};

export function getVisibleStaffTabs(roles: readonly string[], marketingPermissions: readonly string[] = []): StaffTab[] {
  if (roles.includes('admin')) return STAFF_TABS.map(tab => tab.id);
  const allowed = new Set(roles.flatMap(role => ROLE_TABS[role] || []));
  if (roles.includes('marketing')) {
    STAFF_TABS.forEach(tab => {
      if (tab.permission && marketingPermissions.includes(tab.permission)) allowed.add(tab.id);
    });
  }
  return STAFF_TABS.filter(tab => allowed.has(tab.id)).map(tab => tab.id);
}