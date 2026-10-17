import { supabase } from "@/integrations/supabase/client";

export interface TaxCalculation {
  taxRate: number;
  taxAmount: number;
  totalWithTax: number;
}

/**
 * Get the current system sales tax rate
 */
export async function getCurrentTaxRate(): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "sales_tax_percentage")
    .eq("is_active", true)
    .maybeSingle();

  return parseFloat(data?.setting_value || "0");
}

/**
 * Calculate tax for an item based on customer and item taxability
 */
export function calculateItemTax({
  itemPrice,
  quantity = 1,
  customerIsTaxable = true,
  itemIsTaxable = true,
  taxRate
}: {
  itemPrice: number;
  quantity?: number;
  customerIsTaxable?: boolean;
  itemIsTaxable?: boolean;
  taxRate: number;
}): TaxCalculation {
  const subtotal = itemPrice * quantity;
  
  // Only apply tax if both customer and item are taxable
  const shouldApplyTax = customerIsTaxable && itemIsTaxable;
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