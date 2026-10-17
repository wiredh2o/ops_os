/**
 * Fulfillment Routing Utilities
 * Handles smart routing logic for manual-serial items
 * Checks inventory availability and creates drop-ship POs when needed
 */

import { supabase } from '@/integrations/supabase/client';
import { calculateDropShipFreight, getVendorShippingAddress, getDropShipFreightLaborItem, CustomerAddress } from './drop-ship-freight-utils';

export interface SerializedInventoryItem {
  id: string;
  serial_number: string;
  status: 'available' | 'allocated' | 'sold';
  inventory_item_id?: string;
  assembly_id?: string;
}

export interface FulfillmentRouting {
  itemId: string;
  method: 'facility' | 'drop_ship';
  availableSerials?: SerializedInventoryItem[];
  selectedSerial?: string;
  needsDropShip?: boolean;
  dropShipVendorId?: string;
  estimatedFreight?: number;
  serialPending?: boolean;
}

/**
 * Check available serialized inventory for an item
 */
export async function getAvailableSerials(
  itemId: string,
  itemType: 'inventory' | 'assembly'
): Promise<SerializedInventoryItem[]> {
  try {
    const query = supabase
      .from('serialized_inventory')
      .select('id, serial_number, status, inventory_item_id, assembly_id')
      .eq('status', 'available');
    
    if (itemType === 'inventory') {
      query.eq('inventory_item_id', itemId);
    } else {
      query.eq('assembly_id', itemId);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching serialized inventory:', error);
      return [];
    }

    return (data || []) as SerializedInventoryItem[];
  } catch (err) {
    console.error('Error in getAvailableSerials:', err);
    return [];
  }
}

/**
 * Get the external supplier for an item (for drop-ship)
 */
export async function getItemExternalSupplier(
  itemId: string,
  itemType: 'inventory' | 'assembly'
): Promise<{ id: string; name: string } | null> {
  try {
    const table = itemType === 'inventory' ? 'inventory_items' : 'assemblies';
    const { data, error } = await supabase
      .from(table)
      .select(`
        external_supplier_id,
        external_supplier:suppliers(id, name)
      `)
      .eq('id', itemId)
      .single();

    if (error || !data?.external_supplier_id) {
      return null;
    }

    const supplier = data.external_supplier as any;
    return supplier ? { id: supplier.id, name: supplier.name } : null;
  } catch (err) {
    console.error('Error fetching external supplier:', err);
    return null;
  }
}

/**
 * Create a drop-ship Purchase Order for the item
 */
export async function createDropShipPurchaseOrder(params: {
  vendorId: string;
  customerOrderId: string;
  customerOrderItemId: string;
  itemId: string;
  itemType: 'inventory' | 'assembly';
  itemSku: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  customerAddress: CustomerAddress;
  customerName: string;
  userId: string;
}): Promise<{ success: boolean; poId?: string; poNumber?: string; error?: string }> {
  try {
    // Generate PO number
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    const { count } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .like('purchase_order_number', `DS-${dateStr}-%`);
    
    const sequence = ((count || 0) + 1).toString().padStart(3, '0');
    const poNumber = `DS-${dateStr}-${sequence}`;

    // Snapshot the customer address
    const addressSnapshot = {
      name: params.customerName,
      city: params.customerAddress.city,
      state: params.customerAddress.state,
      zip: params.customerAddress.zip,
      country: params.customerAddress.country || 'US',
    };

    // Create the purchase order
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        purchase_order_number: poNumber,
        supplier_id: params.vendorId,
        status: 'draft',
        order_date: today.toISOString().slice(0, 10),
        total_amount: params.quantity * params.unitCost,
        is_drop_ship: true,
        drop_ship_address_snapshot: addressSnapshot,
        drop_ship_customer_order_id: params.customerOrderId,
        notes: `Drop-ship for ${params.customerName}`,
        created_by: params.userId,
      })
      .select('id, purchase_order_number')
      .single();

    if (poError) {
      console.error('Error creating drop-ship PO:', poError);
      return { success: false, error: poError.message };
    }

    // Create the PO line item
    const poItemType = params.itemType === 'inventory' ? 'inventory_item' : 'assembly';
    const { error: lineError } = await supabase
      .from('purchase_order_items')
      .insert({
        purchase_order_id: po.id,
        inventory_item_id: params.itemType === 'inventory' ? params.itemId : null,
        assembly_id: params.itemType === 'assembly' ? params.itemId : null,
        item_type: poItemType,
        quantity: params.quantity,
        unit_cost: params.unitCost,
        total_cost: params.quantity * params.unitCost,
        source_customer_order_item_id: params.customerOrderItemId,
      });

    if (lineError) {
      console.error('Error creating PO line item:', lineError);
      // Clean up the PO
      await supabase.from('purchase_orders').delete().eq('id', po.id);
      return { success: false, error: lineError.message };
    }

    // Update the customer order item with the drop-ship PO reference
    await supabase
      .from('customer_order_items')
      .update({
        fulfillment_method: 'drop_ship',
        drop_ship_purchase_order_id: po.id,
        serial_pending: true, // Serial will come from vendor
      })
      .eq('id', params.customerOrderItemId);

    return { success: true, poId: po.id, poNumber: po.purchase_order_number };
  } catch (err: any) {
    console.error('Error in createDropShipPurchaseOrder:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Calculate freight for drop-ship and get the labor item
 */
export async function calculateAndGetFreightCharge(
  vendorId: string,
  customerAddress: CustomerAddress,
  packageWeight: number = 1
): Promise<{ freightAmount: number; laborItemId: string | null; error?: string }> {
  // Get vendor address
  const vendorAddress = await getVendorShippingAddress(vendorId);
  
  if (!vendorAddress) {
    return {
      freightAmount: 0,
      laborItemId: null,
      error: 'Vendor missing shipping address - cannot calculate freight',
    };
  }

  // Calculate freight
  const freightResult = await calculateDropShipFreight(vendorAddress, customerAddress, packageWeight);
  
  if (!freightResult.success || !freightResult.cheapestGroundRate) {
    return {
      freightAmount: 0,
      laborItemId: null,
      error: freightResult.error || 'Failed to calculate freight',
    };
  }

  // Get or create the freight labor item
  const laborItem = await getDropShipFreightLaborItem();
  
  return {
    freightAmount: freightResult.cheapestGroundRate.total_charge,
    laborItemId: laborItem?.id || null,
  };
}

/**
 * Determine fulfillment method for an item with manual serial tracking
 */
export async function determineFulfillmentMethod(
  itemId: string,
  itemType: 'inventory' | 'assembly',
  quantityNeeded: number,
  requestedSerial?: string | null
): Promise<{
  method: 'facility' | 'drop_ship';
  availableSerials: SerializedInventoryItem[];
  matchingSerial?: SerializedInventoryItem;
  needsDropShip: boolean;
}> {
  // Get available serialized inventory
  const availableSerials = await getAvailableSerials(itemId, itemType);
  
  // If customer requested a specific serial, check if we have it
  if (requestedSerial) {
    const matchingSerial = availableSerials.find(
      s => s.serial_number.toLowerCase() === requestedSerial.toLowerCase()
    );
    
    if (matchingSerial) {
      return {
        method: 'facility',
        availableSerials,
        matchingSerial,
        needsDropShip: false,
      };
    }
    
    // Requested serial not in stock - must drop-ship
    return {
      method: 'drop_ship',
      availableSerials,
      needsDropShip: true,
    };
  }
  
  // No specific serial requested - check if we have enough stock
  if (availableSerials.length >= quantityNeeded) {
    return {
      method: 'facility',
      availableSerials,
      needsDropShip: false,
    };
  }
  
  // Not enough stock - need to drop-ship
  return {
    method: 'drop_ship',
    availableSerials,
    needsDropShip: true,
  };
}
