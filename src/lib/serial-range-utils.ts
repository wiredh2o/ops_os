import { supabase } from "@/integrations/supabase/client";

/**
 * Fleet/Gift Card Range Tracking Utilities
 * 
 * These functions support tracking sequential card ranges at both
 * the purchase (PO) and sales (customer order) levels.
 */

export interface RangeValidationResult {
  valid: boolean;
  actualQty: number;
  expectedQty: number;
  message: string;
}

export interface OverlapCheckResult {
  hasOverlap: boolean;
  conflictingRanges: Array<{
    rangeStart: number;
    rangeEnd: number;
    sourcePoNumber?: string;
    orderId?: string;
    orderNumber?: string;
  }>;
  message: string;
}

export interface AvailableRange {
  id: string;
  rangeStart: number;
  rangeEnd: number;
  availableStart: number;
  availableEnd: number;
  availableQty: number;
  sourcePoNumber?: string;
  status: 'available' | 'partial' | 'sold';
}

/**
 * Calculate the quantity of items in an inclusive range
 * Range 335000-339999 = 5000 cards (339999 - 335000 + 1)
 */
export function calculateRangeQuantity(start: number | null, end: number | null): number {
  if (start === null || end === null) return 0;
  if (end < start) return 0;
  if (start < 0 || end < 0) return 0;
  return end - start + 1;
}

/**
 * Validate that a range matches the expected quantity
 */
export function validateRangeMatch(
  start: number | null,
  end: number | null,
  expectedQty: number
): RangeValidationResult {
  if (start === null || end === null) {
    return {
      valid: false,
      actualQty: 0,
      expectedQty,
      message: "Both start and end numbers are required"
    };
  }

  if (end < start) {
    return {
      valid: false,
      actualQty: 0,
      expectedQty,
      message: "End number must be greater than or equal to start number"
    };
  }

  const actualQty = calculateRangeQuantity(start, end);

  if (actualQty === expectedQty) {
    return {
      valid: true,
      actualQty,
      expectedQty,
      message: `Range contains ${actualQty.toLocaleString()} cards (matches quantity)`
    };
  }

  return {
    valid: false,
    actualQty,
    expectedQty,
    message: `Range contains ${actualQty.toLocaleString()} cards (expected ${expectedQty.toLocaleString()})`
  };
}

/**
 * Format a range for display
 */
export function formatRange(start: number, end: number): string {
  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

/**
 * Check if a new purchase range overlaps with existing inventory ranges
 * Used when creating a PO to prevent ordering duplicate card numbers
 */
export async function checkPurchaseRangeOverlap(
  itemId: string,
  itemType: 'inventory' | 'assembly',
  rangeStart: number,
  rangeEnd: number,
  excludePoItemId?: string
): Promise<OverlapCheckResult> {
  const column = itemType === 'inventory' ? 'inventory_item_id' : 'assembly_id';
  
  let query = supabase
    .from('card_range_inventory')
    .select(`
      id,
      range_start,
      range_end,
      source_po_id,
      purchase_orders!source_po_id(po_number)
    `)
    .eq(column, itemId)
    .lte('range_start', rangeEnd)
    .gte('range_end', rangeStart);

  if (excludePoItemId) {
    query = query.neq('source_po_item_id', excludePoItemId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error checking purchase range overlap:', error);
    return {
      hasOverlap: false,
      conflictingRanges: [],
      message: "Error checking for overlaps"
    };
  }

  if (!data || data.length === 0) {
    return {
      hasOverlap: false,
      conflictingRanges: [],
      message: "No overlapping ranges found"
    };
  }

  const conflicts = data.map(row => ({
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    sourcePoNumber: (row.purchase_orders as any)?.po_number || undefined
  }));

  const conflictDesc = conflicts.map(c => 
    `${c.rangeStart.toLocaleString()}-${c.rangeEnd.toLocaleString()}${c.sourcePoNumber ? ` (${c.sourcePoNumber})` : ''}`
  ).join(', ');

  return {
    hasOverlap: true,
    conflictingRanges: conflicts,
    message: `Overlap detected with existing inventory: ${conflictDesc}`
  };
}

/**
 * Get available ranges for an item that can be sold
 * Returns ranges with their available portions after accounting for allocations
 */
export async function getAvailableRanges(
  itemId: string,
  itemType: 'inventory' | 'assembly'
): Promise<AvailableRange[]> {
  const column = itemType === 'inventory' ? 'inventory_item_id' : 'assembly_id';
  
  // Get all inventory ranges that aren't fully sold
  const { data: inventoryRanges, error: invError } = await supabase
    .from('card_range_inventory')
    .select(`
      id,
      range_start,
      range_end,
      status,
      source_po_id,
      purchase_orders!source_po_id(po_number)
    `)
    .eq(column, itemId)
    .in('status', ['available', 'partial'])
    .order('range_start');

  if (invError || !inventoryRanges) {
    console.error('Error fetching available ranges:', invError);
    return [];
  }

  // Get all allocations for these ranges
  const rangeIds = inventoryRanges.map(r => r.id);
  const { data: allocations, error: allocError } = await supabase
    .from('card_range_allocations')
    .select('card_range_inventory_id, allocation_start, allocation_end')
    .in('card_range_inventory_id', rangeIds)
    .order('allocation_start');

  if (allocError) {
    console.error('Error fetching allocations:', allocError);
  }

  const allocationsByRange = new Map<string, Array<{start: number, end: number}>>();
  (allocations || []).forEach(a => {
    const existing = allocationsByRange.get(a.card_range_inventory_id) || [];
    existing.push({ start: a.allocation_start, end: a.allocation_end });
    allocationsByRange.set(a.card_range_inventory_id, existing);
  });

  // Calculate available portions for each range
  const result: AvailableRange[] = [];

  for (const range of inventoryRanges) {
    const rangeAllocations = allocationsByRange.get(range.id) || [];
    
    if (rangeAllocations.length === 0) {
      // Entire range is available
      result.push({
        id: range.id,
        rangeStart: range.range_start,
        rangeEnd: range.range_end,
        availableStart: range.range_start,
        availableEnd: range.range_end,
        availableQty: calculateRangeQuantity(range.range_start, range.range_end),
        sourcePoNumber: (range.purchase_orders as any)?.po_number,
        status: range.status as 'available' | 'partial' | 'sold'
      });
    } else {
      // Find gaps in allocations
      const sortedAllocs = [...rangeAllocations].sort((a, b) => a.start - b.start);
      let currentStart = range.range_start;

      for (const alloc of sortedAllocs) {
        if (currentStart < alloc.start) {
          // Gap before this allocation
          result.push({
            id: range.id,
            rangeStart: range.range_start,
            rangeEnd: range.range_end,
            availableStart: currentStart,
            availableEnd: alloc.start - 1,
            availableQty: calculateRangeQuantity(currentStart, alloc.start - 1),
            sourcePoNumber: (range.purchase_orders as any)?.po_number,
            status: 'partial'
          });
        }
        currentStart = Math.max(currentStart, alloc.end + 1);
      }

      // Check for gap after last allocation
      if (currentStart <= range.range_end) {
        result.push({
          id: range.id,
          rangeStart: range.range_start,
          rangeEnd: range.range_end,
          availableStart: currentStart,
          availableEnd: range.range_end,
          availableQty: calculateRangeQuantity(currentStart, range.range_end),
          sourcePoNumber: (range.purchase_orders as any)?.po_number,
          status: 'partial'
        });
      }
    }
  }

  return result;
}

/**
 * Validate that a sale range is available in inventory
 * Checks that the range exists and hasn't been sold
 */
export async function validateSaleRange(
  itemId: string,
  itemType: 'inventory' | 'assembly',
  rangeStart: number,
  rangeEnd: number
): Promise<OverlapCheckResult> {
  const availableRanges = await getAvailableRanges(itemId, itemType);

  // Check if the requested range fits within any available range
  const fittingRange = availableRanges.find(
    ar => ar.availableStart <= rangeStart && ar.availableEnd >= rangeEnd
  );

  if (fittingRange) {
    return {
      hasOverlap: false,
      conflictingRanges: [],
      message: `Range valid: ${calculateRangeQuantity(rangeStart, rangeEnd).toLocaleString()} cards from available stock`
    };
  }

  // Check if range is partially available (overlaps but doesn't fit)
  const partialOverlaps = availableRanges.filter(
    ar => ar.availableStart <= rangeEnd && ar.availableEnd >= rangeStart
  );

  if (partialOverlaps.length > 0) {
    // The range partially overlaps available inventory - some cards already sold
    return {
      hasOverlap: true,
      conflictingRanges: [],
      message: `Range ${rangeStart.toLocaleString()}-${rangeEnd.toLocaleString()} extends beyond available inventory. Check available ranges.`
    };
  }

  // Range doesn't exist in inventory at all
  return {
    hasOverlap: true,
    conflictingRanges: [],
    message: `Range ${rangeStart.toLocaleString()}-${rangeEnd.toLocaleString()} not found in available inventory`
  };
}

/**
 * Check if a sale range overlaps with existing allocations (already sold)
 */
export async function checkSaleRangeOverlap(
  itemId: string,
  itemType: 'inventory' | 'assembly',
  rangeStart: number,
  rangeEnd: number,
  excludeOrderItemId?: string
): Promise<OverlapCheckResult> {
  const column = itemType === 'inventory' ? 'inventory_item_id' : 'assembly_id';
  
  // Get inventory range IDs for this item
  const { data: inventoryRanges } = await supabase
    .from('card_range_inventory')
    .select('id')
    .eq(column, itemId);

  if (!inventoryRanges || inventoryRanges.length === 0) {
    return {
      hasOverlap: false,
      conflictingRanges: [],
      message: "No inventory ranges found"
    };
  }

  const rangeIds = inventoryRanges.map(r => r.id);

  // Check for overlapping allocations
  let query = supabase
    .from('card_range_allocations')
    .select(`
      allocation_start,
      allocation_end,
      customer_order_id,
      customer_orders!customer_order_id(order_number)
    `)
    .in('card_range_inventory_id', rangeIds)
    .lte('allocation_start', rangeEnd)
    .gte('allocation_end', rangeStart);

  if (excludeOrderItemId) {
    query = query.neq('customer_order_item_id', excludeOrderItemId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error checking sale range overlap:', error);
    return {
      hasOverlap: false,
      conflictingRanges: [],
      message: "Error checking for overlaps"
    };
  }

  if (!data || data.length === 0) {
    return {
      hasOverlap: false,
      conflictingRanges: [],
      message: "No overlapping sales found"
    };
  }

  const conflicts = data.map(row => ({
    rangeStart: row.allocation_start,
    rangeEnd: row.allocation_end,
    orderId: row.customer_order_id || undefined,
    orderNumber: (row.customer_orders as any)?.order_number || undefined
  }));

  const conflictDesc = conflicts.map(c =>
    `${c.rangeStart.toLocaleString()}-${c.rangeEnd.toLocaleString()}${c.orderNumber ? ` (Order #${c.orderNumber})` : ''}`
  ).join(', ');

  return {
    hasOverlap: true,
    conflictingRanges: conflicts,
    message: `Cards already sold: ${conflictDesc}`
  };
}

/**
 * Record a range as received into inventory (called when PO is received)
 */
export async function recordRangeReceived(
  itemId: string,
  itemType: 'inventory' | 'assembly',
  rangeStart: number,
  rangeEnd: number,
  sourcePoId: string,
  sourcePoItemId: string
): Promise<{ success: boolean; error?: string; id?: string }> {
  const baseData = {
    range_start: rangeStart,
    range_end: rangeEnd,
    source_po_id: sourcePoId,
    source_po_item_id: sourcePoItemId,
    status: 'available' as const,
    received_at: new Date().toISOString()
  };

  const insertData = itemType === 'inventory' 
    ? { ...baseData, inventory_item_id: itemId, assembly_id: null }
    : { ...baseData, inventory_item_id: null, assembly_id: itemId };

  const { data, error } = await supabase
    .from('card_range_inventory')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    console.error('Error recording range received:', error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

/**
 * Record a range as sold (called when customer order is fulfilled)
 */
export async function recordRangeSold(
  itemId: string,
  itemType: 'inventory' | 'assembly',
  rangeStart: number,
  rangeEnd: number,
  customerOrderId: string,
  customerOrderItemId: string
): Promise<{ success: boolean; error?: string }> {
  // Find the inventory range that contains this allocation
  const column = itemType === 'inventory' ? 'inventory_item_id' : 'assembly_id';
  
  const { data: inventoryRange, error: findError } = await supabase
    .from('card_range_inventory')
    .select('id, range_start, range_end')
    .eq(column, itemId)
    .lte('range_start', rangeStart)
    .gte('range_end', rangeEnd)
    .in('status', ['available', 'partial'])
    .single();

  if (findError || !inventoryRange) {
    console.error('Error finding inventory range:', findError);
    return { success: false, error: 'Could not find matching inventory range' };
  }

  // Create the allocation
  const { error: allocError } = await supabase
    .from('card_range_allocations')
    .insert({
      card_range_inventory_id: inventoryRange.id,
      allocation_start: rangeStart,
      allocation_end: rangeEnd,
      customer_order_id: customerOrderId,
      customer_order_item_id: customerOrderItemId,
      allocated_at: new Date().toISOString()
    });

  if (allocError) {
    console.error('Error creating allocation:', allocError);
    return { success: false, error: allocError.message };
  }

  // Update the inventory range status
  // Check if the entire range is now sold
  const { data: allAllocations } = await supabase
    .from('card_range_allocations')
    .select('allocation_start, allocation_end')
    .eq('card_range_inventory_id', inventoryRange.id)
    .order('allocation_start');

  const totalAllocated = (allAllocations || []).reduce((sum, a) => 
    sum + calculateRangeQuantity(a.allocation_start, a.allocation_end), 0
  );
  const totalRange = calculateRangeQuantity(inventoryRange.range_start, inventoryRange.range_end);

  const newStatus = totalAllocated >= totalRange ? 'sold' : 'partial';

  await supabase
    .from('card_range_inventory')
    .update({ status: newStatus })
    .eq('id', inventoryRange.id);

  return { success: true };
}

/**
 * Check if an item uses range tracking
 */
export function isRangeTracked(serialTrackingType: string | null): boolean {
  return serialTrackingType === 'range';
}
