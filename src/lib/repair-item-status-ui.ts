/**
 * Shared status UI helper for repair items
 * Provides consistent status display across all repair queue components
 */

// Status categories
export const SHIPPING_PHASE_STATUSES = [
  'queued_for_shipping',
  'label_staged',
  'awaiting_pickup',
  'in_transit',
  'delivered'
] as const;

export const COMPLETED_STATUSES = [
  'completed',
  'repaired' // legacy status
] as const;

export type ShippingPhaseStatus = typeof SHIPPING_PHASE_STATUSES[number];
export type CompletedStatus = typeof COMPLETED_STATUSES[number];

/**
 * Check if an item is in the shipping phase (already queued for order fulfillment)
 */
export const isInShippingPhase = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return SHIPPING_PHASE_STATUSES.includes(status as ShippingPhaseStatus);
};

/**
 * Customer Order ribbon - combines order status and payment status into a single ribbon
 */
export interface CustomerOrderRibbon {
  label: string;
  bgClass: string;
}

export const getCustomerOrderRibbon = (
  orderStatus: string | null | undefined,
   paymentStatus: string | null | undefined,
   inventoryStatus?: {
     hasInventoryShortage?: boolean;
     hasAssemblyShortage?: boolean;
   }
): CustomerOrderRibbon => {
  // Cancelled takes priority
  if (orderStatus === 'cancelled') {
    return { label: 'CANCELLED', bgClass: 'bg-red-600' };
  }
  
  const isPaid = paymentStatus === 'paid';
  
  switch (orderStatus) {
    case 'fulfilled':
      return isPaid 
        ? { label: 'FULFILLED', bgClass: 'bg-green-600' }
        : { label: 'FULFILLED · UNPAID', bgClass: 'bg-amber-500' };
    case 'partially_fulfilled':
      return isPaid
        ? { label: 'PARTIAL', bgClass: 'bg-blue-500' }
        : { label: 'PARTIAL · UNPAID', bgClass: 'bg-amber-500' };
    case 'pending':
    default:
       // Check inventory status for pending orders
       if (inventoryStatus?.hasAssemblyShortage) {
         return { label: 'PENDING ASSEMBLY', bgClass: 'bg-orange-500' };
       }
       if (inventoryStatus?.hasInventoryShortage) {
         return { label: 'PENDING INVENTORY', bgClass: 'bg-orange-500' };
       }
      return isPaid
        ? { label: 'READY TO FULFILL', bgClass: 'bg-blue-500' }
         : { label: 'PENDING FULFILLMENT', bgClass: 'bg-gray-500' };
  }
};
/**
 * Check if an item is completed (includes legacy 'repaired' status)
 */
export const isCompletedStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return COMPLETED_STATUSES.includes(status as CompletedStatus);
};

/**
 * Check if an item should be visually muted in the Repair Order Queue
 * Items in shipping phase are muted because they're being handled in the Shipping Queue
 */
export const shouldMuteInRepairQueue = (status: string | null | undefined): boolean => {
  return isInShippingPhase(status);
};

/**
 * Check if an item should show as "complete" in the UI
 * This includes completed statuses AND shipping phase statuses
 */
export const isRepairComplete = (status: string | null | undefined): boolean => {
  return isCompletedStatus(status) || isInShippingPhase(status);
};

interface StatusRibbon {
  label: string;
  bgClass: string;
}

/**
 * Get the ribbon display info for a repair item status
 */
export const getRepairItemRibbon = (status: string | null | undefined): StatusRibbon => {
  switch (status) {
    // Repair phase statuses
    case 'logged':
      return { label: 'LOGGED', bgClass: 'bg-gray-600' };
    case 'diagnosed':
      return { label: 'DIAGNOSED', bgClass: 'bg-purple-600' };
    case 'in_repair':
      return { label: 'IN REPAIR', bgClass: 'bg-orange-600' };
    case 'completed':
    case 'repaired': // legacy
      return { label: 'COMPLETED', bgClass: 'bg-green-600' };
    
    // Shipping phase statuses
    case 'queued_for_shipping':
      return { label: 'QUEUED FOR SHIPPING', bgClass: 'bg-indigo-600' };
    case 'label_staged':
      return { label: 'LABEL STAGED', bgClass: 'bg-indigo-500' };
    case 'awaiting_pickup':
      return { label: 'AWAITING PICKUP', bgClass: 'bg-purple-600' };
    case 'in_transit':
      return { label: 'IN TRANSIT', bgClass: 'bg-cyan-600' };
    case 'delivered':
      return { label: 'DELIVERED', bgClass: 'bg-emerald-600' };
    
    // Post-shipping
    case 'invoiced':
      return { label: 'INVOICED', bgClass: 'bg-slate-600' };
    
    default:
      return { label: 'LOGGED', bgClass: 'bg-gray-600' };
  }
};

/**
 * Get a human-readable label for a repair item status
 */
export const getRepairItemStatusLabel = (status: string | null | undefined): string => {
  return getRepairItemRibbon(status).label;
};

/**
 * Status ribbon info for shipping order cards (production_orders in shipping queue)
 */
export interface ShippingOrderRibbon {
  label: string;
  bgClass: string;
}

export const getShippingOrderRibbon = (status: string | null | undefined): ShippingOrderRibbon => {
  switch (status) {
    case 'pending':
      return { label: 'PENDING', bgClass: 'bg-gray-500' };
    case 'approved':
      return { label: 'APPROVED', bgClass: 'bg-blue-500' };
    case 'in_progress':
      return { label: 'IN PROGRESS', bgClass: 'bg-amber-500' };
    case 'completed':
      return { label: 'READY TO SHIP', bgClass: 'bg-green-500' };
    case 'awaiting_payment':
      return { label: 'AWAITING PAYMENT', bgClass: 'bg-yellow-500' };
    case 'label_staged':
      return { label: 'LABEL STAGED', bgClass: 'bg-indigo-500' };
    case 'awaiting_pickup':
      return { label: 'AWAITING PICKUP', bgClass: 'bg-purple-600' };
    case 'ready_for_pickup':
      return { label: 'READY FOR PICK-UP', bgClass: 'bg-teal-600' };
    case 'picked_up':
      return { label: 'PICKED UP', bgClass: 'bg-emerald-600' };
    case 'in_transit':
      return { label: 'IN TRANSIT', bgClass: 'bg-cyan-600' };
    case 'delivered':
      return { label: 'DELIVERED', bgClass: 'bg-emerald-600' };
    case 'cancelled':
      return { label: 'CANCELLED', bgClass: 'bg-red-600' };
    default:
      return { label: (status || 'UNKNOWN').toUpperCase(), bgClass: 'bg-gray-400' };
  }
};

/**
 * Get payment status ribbon info for shipping queue cards
 * Calculates overdue status based on label_created_at date and payment terms
 */
export interface PaymentRibbon {
  label: string;
  bgClass: string;
}

export const getPaymentRibbon = (
  paymentStatus: string | null | undefined,
  paymentTerms: string | null | undefined,
  labelCreatedAt: string | null | undefined
): PaymentRibbon => {
  // If already paid, show green PAID
  if (paymentStatus === 'paid') {
    return { label: 'PAID', bgClass: 'bg-green-600' };
  }

  // Due in advance but not paid
  if (paymentTerms === 'due_in_advance' || !paymentTerms) {
    return { label: 'UNPAID', bgClass: 'bg-yellow-500' };
  }

  // Net terms - calculate if overdue
  const netDays = paymentTerms === 'net_15' ? 15 : paymentTerms === 'net_30' ? 30 : 0;
  
  if (netDays === 0) {
    return { label: 'UNPAID', bgClass: 'bg-yellow-500' };
  }

  // If label not created yet, show the net terms
  if (!labelCreatedAt) {
    return { label: `NET ${netDays}`, bgClass: 'bg-blue-500' };
  }

  // Calculate days since label created
  const labelDate = new Date(labelCreatedAt);
  const today = new Date();
  const daysSinceLabelCreated = Math.floor((today.getTime() - labelDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysOverdue = daysSinceLabelCreated - netDays;

  if (daysOverdue <= 0) {
    // Not overdue yet
    return { label: `NET ${netDays}`, bgClass: 'bg-blue-500' };
  } else if (daysOverdue <= 7) {
    // 1-7 days overdue - amber warning
    return { label: `${daysOverdue} DAY${daysOverdue > 1 ? 'S' : ''} OVERDUE`, bgClass: 'bg-amber-500' };
  } else {
    // 8+ days overdue - red alert
    return { label: `${daysOverdue} DAYS OVERDUE`, bgClass: 'bg-red-600' };
  }
};
