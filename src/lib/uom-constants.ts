// Unit of Measure Constants and Utilities

// Purchase UOM options - how items are bought
export const PURCHASE_UOM_OPTIONS = [
  { value: 'each', label: 'Each' },
  { value: 'box', label: 'Box' },
  { value: 'case', label: 'Case' },
  { value: 'tray', label: 'Tray' },
  { value: 'tube', label: 'Tube' },
  { value: 'reel', label: 'Reel' },
  { value: 'large_reel', label: 'Large Reel' },
] as const;

// Sales Quantity options - predefined quantities for selling
export const SALES_QUANTITY_OPTIONS = [
  { value: 1, label: '1' },
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 20, label: '20' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 75, label: '75' },
  { value: 100, label: '100' },
  { value: 250, label: '250' },
  { value: 500, label: '500' },
  { value: 1000, label: '1,000' },
  { value: 5000, label: '5,000' },
  { value: 10000, label: '10,000' },
  { value: 20000, label: '20,000' },
  { value: 25000, label: '25,000' },
  { value: 50000, label: '50,000' },
] as const;

// Sales Lot options - predefined lot sizes for selling
export const SALES_LOT_OPTIONS = [
  { value: 1, label: '1pc Lot' },
  { value: 10, label: '10pc Lot' },
  { value: 15, label: '15pc Lot' },
  { value: 20, label: '20pc Lot' },
  { value: 25, label: '25pc Lot' },
  { value: 50, label: '50pc Lot' },
  { value: 75, label: '75pc Lot' },
  { value: 100, label: '100pc Lot' },
  { value: 250, label: '250pc Lot' },
  { value: 500, label: '500pc Lot' },
  { value: 1000, label: '1,000pc Lot' },
  { value: 5000, label: '5,000pc Lot' },
  { value: 10000, label: '10,000pc Lot' },
  { value: 20000, label: '20,000pc Lot' },
  { value: 25000, label: '25,000pc Lot' },
  { value: 50000, label: '50,000pc Lot' },
] as const;

// Stocking UOM options - base unit for inventory
export const STOCKING_UOM_OPTIONS = [
  { value: 'each', label: 'Each' },
  { value: 'piece', label: 'Piece' },
  { value: 'unit', label: 'Unit' },
] as const;

export type PurchaseUOM = typeof PURCHASE_UOM_OPTIONS[number]['value'];
export type SalesQuantity = typeof SALES_QUANTITY_OPTIONS[number]['value'];
export type StockingUOM = typeof STOCKING_UOM_OPTIONS[number]['value'];

// Get display label for a UOM value
export const getUomLabel = (value: string, type: 'purchase' | 'sales' | 'stocking'): string => {
  if (type === 'purchase') {
    const option = PURCHASE_UOM_OPTIONS.find(o => o.value === value);
    return option?.label || value;
  } else if (type === 'sales') {
    // Sales is now quantity-only, just return the value as-is
    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      return numValue.toLocaleString();
    }
    return value;
  } else {
    const option = STOCKING_UOM_OPTIONS.find(o => o.value === value);
    return option?.label || value;
  }
};

// Calculate stocking quantity from purchase quantity
export const calculateStockingQuantity = (
  purchaseQuantity: number,
  purchaseUomQuantity: number | null
): number => {
  if (!purchaseUomQuantity || purchaseUomQuantity <= 0) {
    return purchaseQuantity;
  }
  return purchaseQuantity * purchaseUomQuantity;
};

// Calculate purchase quantity from stocking quantity
export const calculatePurchaseQuantity = (
  stockingQuantity: number,
  purchaseUomQuantity: number | null
): number => {
  if (!purchaseUomQuantity || purchaseUomQuantity <= 0) {
    return stockingQuantity;
  }
  return Math.ceil(stockingQuantity / purchaseUomQuantity);
};

// Calculate unit cost from purchase unit cost
export const calculateStockingUnitCost = (
  purchaseUnitCost: number,
  purchaseUomQuantity: number | null
): number => {
  if (!purchaseUomQuantity || purchaseUomQuantity <= 0) {
    return purchaseUnitCost;
  }
  return purchaseUnitCost / purchaseUomQuantity;
};

// Calculate sales quantity from stocking quantity
export const calculateSalesQuantity = (
  stockingQuantity: number,
  salesUomQuantity: number | null
): number => {
  if (!salesUomQuantity || salesUomQuantity <= 0) {
    return stockingQuantity;
  }
  return Math.floor(stockingQuantity / salesUomQuantity);
};

// Calculate stocking quantity from sales quantity
export const calculateStockingFromSales = (
  salesQuantity: number,
  salesUomQuantity: number | null
): number => {
  if (!salesUomQuantity || salesUomQuantity <= 0) {
    return salesQuantity;
  }
  return salesQuantity * salesUomQuantity;
};

// Calculate unit price from sales unit price
export const calculateStockingUnitPrice = (
  salesUnitPrice: number,
  salesUomQuantity: number | null
): number => {
  if (!salesUomQuantity || salesUomQuantity <= 0) {
    return salesUnitPrice;
  }
  return salesUnitPrice / salesUomQuantity;
};

// Format quantity display with UOM
export const formatQuantityWithUom = (
  quantity: number,
  uom: string,
  type: 'purchase' | 'sales' | 'stocking'
): string => {
  const label = getUomLabel(uom, type);
  const plural = quantity !== 1 && label.toLowerCase() !== 'each' ? 's' : '';
  return `${quantity} ${label}${plural}`;
};

// Interface for inventory item with UOM fields
export interface InventoryItemWithUOM {
  stocking_uom: string;
  has_purchase_conversion: boolean;
  purchase_uom?: string | null;
  purchase_uom_quantity?: number | null;
  purchase_unit_cost?: number | null;
  has_sales_conversion: boolean;
  sales_uom?: string | null;
  sales_uom_quantity?: number | null;
  sales_unit_price?: number | null;
  unit_price: number;
  unit_cost?: number | null;
}
