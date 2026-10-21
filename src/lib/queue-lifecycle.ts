export interface ShippingHandoff {
  status?: string | null;
  picked_up_at?: string | null;
  payment_status?: string | null;
}

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

// Label creation, readiness, and payment are not evidence of physical handoff.
export function isShippingArchived(order: ShippingHandoff): boolean {
  return Boolean(order.picked_up_at) || ['shipped', 'in_transit', 'delivered', 'picked_up'].includes(normalize(order.status));
}

export interface PackageResolutionItem {
  status?: unknown;
  completion_outcome?: unknown;
}

export function isRepairItemResolved(item: PackageResolutionItem): boolean {
  return ['shipped', 'in_transit', 'delivered', 'picked_up', 'scrapped'].includes(normalize(item.status)) ||
    ['unrepairable_scrapped', 'customer_declined_scrapped'].includes(normalize(item.completion_outcome));
}

export function isRepairPackageArchived(pkg: { item_count?: unknown }, items: readonly PackageResolutionItem[]): boolean {
  const expectedCount = Number(pkg.item_count) || 0;
  // Empty packages and missing/unlogged items require attention, not archival.
  return items.length > 0 && items.length >= expectedCount && items.every(isRepairItemResolved);
}

export function matchesArchiveFilter(customerId: string | null | undefined, selectedCustomer: string, query: string, fields: readonly unknown[]): boolean {
  if (selectedCustomer !== 'all' && customerId !== selectedCustomer) return false;
  const term = query.trim().toLowerCase();
  return !term || fields.some(field => String(field ?? '').toLowerCase().includes(term));
}