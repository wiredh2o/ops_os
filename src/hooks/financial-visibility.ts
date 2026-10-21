export type FinancialKind = 'revenue' | 'margin' | 'supplier_price';
export interface MarketingFinancialFlags {
  marketing_view_revenue: boolean;
  marketing_view_margin: boolean;
  marketing_view_supplier_price: boolean;
}
export const HIDDEN_FINANCIAL_FLAGS: MarketingFinancialFlags = {
  marketing_view_revenue: false,
  marketing_view_margin: false,
  marketing_view_supplier_price: false,
};
export function canViewFinancial(roles: readonly string[], flags: MarketingFinancialFlags | null, kind: FinancialKind): boolean {
  if (roles.includes('admin')) return true;
  if (!roles.includes('marketing')) return true;
  return flags?.[`marketing_view_${kind}`] === true;
}