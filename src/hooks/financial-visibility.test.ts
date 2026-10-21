import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { canViewFinancial, HIDDEN_FINANCIAL_FLAGS, type FinancialKind } from './financial-visibility';
import { getVisibleStaffTabs } from './staff-tab-access';

describe('marketing financial visibility', () => {
  for (const kind of ['revenue', 'margin', 'supplier_price'] as const) {
    it(`${kind} is hidden by default even when marketing has View access`, () => {
      strictEqual(getVisibleStaffTabs(['marketing'], ['view_inventory']).includes('inventory'), true);
      strictEqual(canViewFinancial(['marketing'], HIDDEN_FINANCIAL_FLAGS, kind), false);
      strictEqual(canViewFinancial(['marketing'], null, kind), false);
    });
    it(`only the corresponding per-user flag enables ${kind}`, () => {
      const flags = { ...HIDDEN_FINANCIAL_FLAGS, [`marketing_view_${kind}`]: true };
      strictEqual(canViewFinancial(['marketing'], flags, kind), true);
      for (const other of ['revenue', 'margin', 'supplier_price'] as FinancialKind[]) {
        if (other !== kind) strictEqual(canViewFinancial(['marketing'], flags, other), false);
      }
    });
    it(`another assigned role does not bypass marketing ${kind} restrictions`, () => {
      strictEqual(canViewFinancial(['marketing', 'sales_support'], HIDDEN_FINANCIAL_FLAGS, kind), false);
    });
    it(`admin retains ${kind} access`, () => {
      strictEqual(canViewFinancial(['marketing', 'admin'], HIDDEN_FINANCIAL_FLAGS, kind), true);
    });
  }
  it('preserves existing non-marketing financial access', () => {
    strictEqual(canViewFinancial(['accounting'], null, 'revenue'), true);
  });
});