import { describe, expect, test } from 'bun:test';
import { getVisibleStaffTabs } from './staff-tab-access';

describe('staff tab role rules', () => {
  test('admin sees all ten tabs', () => {
    expect(getVisibleStaffTabs(['admin'])).toEqual(['orders', 'inventory', 'waste-analytics', 'purchasing', 'receiving', 'repair-lookup', 'customers', 'vendors', 'accounting', 'users']);
  });
  test('production sees only orders and inventory', () => {
    expect(getVisibleStaffTabs(['production'])).toEqual(['orders', 'inventory']);
  });
  test('repair sees receiving and repair lookup', () => {
    expect(getVisibleStaffTabs(['repair'])).toEqual(['receiving', 'repair-lookup']);
  });
  test('shipping_receiving sees orders and receiving', () => {
    expect(getVisibleStaffTabs(['shipping_receiving'])).toEqual(['orders', 'receiving']);
  });
  test('accounting sees only accounting', () => {
    expect(getVisibleStaffTabs(['accounting'])).toEqual(['accounting']);
  });
  test('sales sees orders customers and vendors', () => {
    expect(getVisibleStaffTabs(['sales'])).toEqual(['orders', 'customers', 'vendors']);
    expect(getVisibleStaffTabs(['sales_support'])).toEqual(['orders', 'customers', 'vendors']);
  });
  test('multiple roles combine access without duplicates', () => {
    expect(getVisibleStaffTabs(['production', 'shipping_receiving', 'accounting'])).toEqual(['orders', 'inventory', 'receiving', 'accounting']);
  });
  test('marketing sees only explicitly granted View tabs', () => {
    expect(getVisibleStaffTabs(['marketing'], ['view_customers', 'view_inventory'])).toEqual(['inventory', 'customers']);
    expect(getVisibleStaffTabs(['marketing'])).toEqual([]);
  });
  test('unassigned and unknown roles get no staff access', () => {
    expect(getVisibleStaffTabs([])).toEqual([]);
    expect(getVisibleStaffTabs(['vendor_employee'], ['view_accounting'])).toEqual([]);
  });
  test('marketing View permissions augment other assigned roles', () => {
    expect(getVisibleStaffTabs(['production', 'marketing'], ['view_customers'])).toEqual(['orders', 'inventory', 'customers']);
  });
});