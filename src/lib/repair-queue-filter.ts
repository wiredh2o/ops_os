// Shared filtering logic for the Repair Order Queue (Kanban + Fullscreen)

// Scrapped outcomes - item is disposed of, won't be shipped
// Items with these outcomes should be treated as "finished" for queue filtering
export const SCRAPPED_COMPLETION_OUTCOMES = [
  "unrepairable_scrapped",
  "customer_declined_scrapped",
] as const;

// Repair phase statuses - item is being worked on
export const REPAIR_PHASE_STATUSES = [
  "logged",
  "diagnosed",
  "in_repair",
  "completed",
  "repaired", // Legacy status - kept for backward compatibility
] as const;

// Shipping phase statuses - item is in fulfillment/transit
export const SHIPPING_PHASE_STATUSES = [
  "queued_for_shipping",
  "label_created",
  "in_transit",
  "delivered",
] as const;

// Items that should appear in the repair queue (not yet shipped)
export const INCOMPLETE_REPAIR_ITEM_STATUSES = [
  "logged",
  "diagnosed",
  "in_repair",
  "completed", // Keep visible until shipment order created
  "repaired", // Legacy status - kept for backward compatibility
] as const;

export const NEEDS_UNBOXING_PACKAGE_STATUSES = [
  "in_transit",
  "received",
  "opened",
] as const;

export const normalizeStatus = (status: unknown): string => {
  if (status === null || status === undefined) return "";
  return String(status).trim().toLowerCase();
};

export const isScrappedOutcome = (outcome: string | null | undefined): boolean => {
  if (!outcome) return false;
  return SCRAPPED_COMPLETION_OUTCOMES.includes(
    outcome as (typeof SCRAPPED_COMPLETION_OUTCOMES)[number]
  );
};

export const isInRepairPhase = (status: string): boolean => {
  return REPAIR_PHASE_STATUSES.includes(
    normalizeStatus(status) as (typeof REPAIR_PHASE_STATUSES)[number]
  );
};

export const isInShippingPhase = (status: string): boolean => {
  return SHIPPING_PHASE_STATUSES.includes(
    normalizeStatus(status) as (typeof SHIPPING_PHASE_STATUSES)[number]
  );
};

// Check if an item should be considered "finished" for queue purposes
export const isItemFinished = (
  status: string | null | undefined, 
  completionOutcome: string | null | undefined
): boolean => {
  const normalizedStatus = normalizeStatus(status);
  
  // In shipping phase = finished
  if (SHIPPING_PHASE_STATUSES.includes(
    normalizedStatus as (typeof SHIPPING_PHASE_STATUSES)[number]
  )) {
    return true;
  }
  
  // Scrapped = finished
  if (isScrappedOutcome(completionOutcome)) {
    return true;
  }
  
  return false;
};

export const filterRepairQueuePackages = <T extends { id: string; status?: unknown }>(
  packages: T[],
  itemsByPackage: Record<string, Array<{ status?: unknown; completion_outcome?: unknown }>>,
): T[] => {
  return (packages || []).filter((pkg) => {
    const items = itemsByPackage?.[pkg.id] || [];

    // Check if any item is still "active" (not shipped and not scrapped)
    const hasActiveItems = items.some((item) => {
      const normalizedStatus = normalizeStatus(item.status);
      const outcome = item.completion_outcome ? String(item.completion_outcome) : null;
      
      // Item is "active" if it's incomplete AND not scrapped
      const isIncomplete = INCOMPLETE_REPAIR_ITEM_STATUSES.includes(
        normalizedStatus as (typeof INCOMPLETE_REPAIR_ITEM_STATUSES)[number],
      );
      const isScrapped = isScrappedOutcome(outcome);
      
      return isIncomplete && !isScrapped;
    });

    const normalizedPkgStatus = normalizeStatus(pkg.status) || "in_transit";
    const needsUnboxing =
      items.length === 0 &&
      NEEDS_UNBOXING_PACKAGE_STATUSES.includes(
        normalizedPkgStatus as (typeof NEEDS_UNBOXING_PACKAGE_STATUSES)[number],
      );

    return hasActiveItems || needsUnboxing;
  });
};
