import { supabase } from "@/integrations/supabase/client";
export { calculateJurisdictionTax, parseTaxLines } from './tax-engine';
export type { TaxLine, TaxModel } from './tax-engine';
import type { TaxModel } from './tax-engine';

export async function getTaxModel(state?: string, zip?: string): Promise<TaxModel> {
  let jurisdictions = supabase.from('tax_jurisdictions').select('*');
  let zips = supabase.from('tax_zip_codes').select('*');
  let assignments = supabase.from('tax_zip_jurisdictions').select('*');
  if (state) { jurisdictions = jurisdictions.eq('state', state.toUpperCase()); zips = zips.eq('state', state.toUpperCase()); assignments = assignments.eq('state', state.toUpperCase()); }
  if (zip) { zips = zips.eq('zip', zip.slice(0,5)); assignments = assignments.eq('zip', zip.slice(0,5)); }
  const results = await Promise.all([jurisdictions, zips, assignments]);
  for (const result of results) if (result.error) throw result.error;
  return { jurisdictions: results[0].data || [], zips: results[1].data || [], assignments: results[2].data || [] };
}

export interface TaxCalculation {
  taxRate: number;
  taxAmount: number;
  totalWithTax: number;
}

/**
 * Get the current system sales tax rate
 */
export async function getCurrentTaxRate(): Promise<number> {
  // Legacy estimates have no destination. Never apply a global rate to them.
  return 0;
}

/**
 * Calculate tax for an item based on customer and item taxability
 */
export function calculateItemTax({
  itemPrice,
  quantity = 1,
  customerIsTaxable = true,
  itemIsTaxable = true,
  shipToIsTaxable = false,
  isDistributor = false,
  itemType,
  taxRate
}: {
  itemPrice: number;
  quantity?: number;
  customerIsTaxable?: boolean;
  itemIsTaxable?: boolean;
  shipToIsTaxable?: boolean;
  isDistributor?: boolean;
  itemType?: string;
  taxRate: number;
}): TaxCalculation {
  const subtotal = itemPrice * quantity;
  
  // Only apply tax if both customer and item are taxable
  const shouldApplyTax = customerIsTaxable && shipToIsTaxable && itemIsTaxable && !isDistributor && itemType !== 'labor';
  const taxAmount = shouldApplyTax ? (subtotal * taxRate) / 100 : 0;
  
  return {
    taxRate: shouldApplyTax ? taxRate : 0,
    taxAmount,
    totalWithTax: subtotal + taxAmount
  };
}

/**
 * Calculate total tax for multiple line items
 */
export function calculateOrderTotalTax(lineItems: Array<{
  taxAmount: number;
}>): number {
  return lineItems.reduce((total, item) => total + (item.taxAmount || 0), 0);
}