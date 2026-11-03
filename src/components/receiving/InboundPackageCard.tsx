import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, PackageOpen, Stethoscope, Edit, Trash2, Package, Building2, Phone, Mail, PackageX, Plus, Wrench, Box, Truck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { UnifiedOpenBoxModal } from "./UnifiedOpenBoxModal";
import { DiagnoseItemModal } from "./DiagnoseItemModal";
import { UnifiedPackageModal } from "./UnifiedPackageModal";
import { ComprehensiveRepairItemModal, RepairItemData } from "./ComprehensiveRepairItemModal";
import { CreateRepairShipmentModal } from "./CreateRepairShipmentModal";
import { cn, formatHoursToHrMin } from "@/lib/utils";
import { isRepairItemResolved, isRepairPackageArchived } from '@/lib/queue-lifecycle';
import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { getRepairItemRibbon, shouldMuteInRepairQueue } from "@/lib/repair-item-status-ui";
import { getRmaItems, type RmaRequest } from '@/lib/rma';

export type InboundPackage = {
  id: string;
  tracking_number: string;
  status: string;
  intake_notes?: string | null;
  item_count?: number | null;
  assigned_tray?: string | null;
  rma_request_id?: string | null;
  customer_po?: string | null;
  linked_purchase_order_id?: string | null;
  linked_transaction_id?: string | null;
  created_at: string;
  received_at?: string | null;
  company_id?: string | null;
  company?: {
    id?: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    owners_name?: string | null;
  } | null;
  shipping_preference?: string;
};

export type RepairItemSummary = {
  id: string;
  item_name: string;
  serial_number?: string | null;
  mac_address?: string | null;
  status?: string | null;
  problem_reported?: string | null;
  diagnosis?: string | null;
  repairability?: string | null;
  diagnosis_assessment?: string | null;
  completion_outcome?: string | null;
  estimated_cost?: number | null;
  total_hours?: number;
  package_id?: string;
  unboxing_order?: number;
};

interface InboundPackageCardProps {
  pkg: InboundPackage;
  items: RepairItemSummary[];
  archived?: boolean;
  shouldExpand?: boolean;
  onExpanded?: () => void;
}

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "received":
      return "secondary" as const;
    case "in_transit":
      return "outline" as const;
    default:
      return "outline" as const;
  }
};

export const InboundPackageCard: React.FC<InboundPackageCardProps> = ({ pkg, items, archived = false, shouldExpand = false, onExpanded }) => {
  const [open, setOpen] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [showUnboxModal, setShowUnboxModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [rma, setRma] = useState<RmaRequest | null>(null);
  useEffect(() => {
    if (!pkg.rma_request_id) return;
    let cancelled = false;
    supabase.from('rma_requests').select('*').eq('id', pkg.rma_request_id).single().then(({data}) => { if (!cancelled) setRma(data); });
    return () => { cancelled = true; };
  }, [pkg.rma_request_id]);
  const [showRepairItemModal, setShowRepairItemModal] = useState(false);
  const [repairItemModalMode, setRepairItemModalMode] = useState<'add' | 'edit'>('add');
  const [showDiagnoseModal, setShowDiagnoseModal] = useState(false);
  const [showEditPackageModal, setShowEditPackageModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shippingStatusDialogOpen, setShippingStatusDialogOpen] = useState(false);
  const [shippingStatusDialogType, setShippingStatusDialogType] = useState<'queued' | 'shipped'>('queued');
  const [pendingModalAction, setPendingModalAction] = useState<'diagnose' | 'edit' | null>(null);
  const [pendingItem, setPendingItem] = useState<RepairItemSummary | null>(null);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);
  // Local state to manage immediate updates to timer data
  const [localItems, setLocalItems] = useState<RepairItemSummary[]>(items);
  
  // Keep localItems synced with props
  useEffect(() => {
    setLocalItems(items);
  }, [items]);
  
  const [selectedItem, setSelectedItem] = useState<(RepairItemSummary & { package_id?: string }) | null>(null);
  const { toast } = useToast();

  const itemCount = pkg.item_count ?? localItems.length;
  const rmaItemDefaults = useMemo(() => {
    if (!rma) return undefined;
    const requested = getRmaItems(rma.items).flatMap(item => Array.from({length: item.quantity}, () => item));
    const next = requested[localItems.length];
    return next ? { item_name: next.item_name, serial_number: next.serial_number, mac_address: next.mac_address, problem_reported: rma.problem_reported } : undefined;
  }, [rma, localItems.length]);
  const visibleItems = archived ? localItems : localItems.filter(item => !isRepairItemResolved(item));
  const packageResolved = isRepairPackageArchived(pkg, localItems);
  const isUnboxed = pkg.status === "opened"; // Package is opened only when status is "opened"
  const receivedLabel = useMemo(() => {
    if (pkg.received_at) return `Received: ${format(new Date(pkg.received_at), "PP p")}`;
    return `Created: ${format(new Date(pkg.created_at), "PP p")}`;
  }, [pkg.received_at, pkg.created_at]);

  // Helper to check if item is already shipped (in_transit or delivered - cannot be edited)
  const isAlreadyShipped = (status: string | null | undefined) => {
    return isRepairItemResolved({ status });
  };

  // Count completed items ready to ship
  const completedItemsCount = useMemo(() => {
    return localItems.filter(item => item.status === 'completed').length;
  }, [localItems]);

  // Auto-expand when shouldExpand prop is true
  useEffect(() => {
    if (shouldExpand && !open) {
      console.log("InboundPackageCard: Auto-expanding package", pkg.id);
      setOpen(true);
      onExpanded?.();
    }
  }, [shouldExpand, open, pkg.id, onExpanded]);

  // Listen for items-added-to-package event to expand the card
  useEffect(() => {
    const handleItemsAdded = (event: CustomEvent) => {
      if (event.detail.packageId === pkg.id) {
        console.log("InboundPackageCard: Items added to package, expanding", pkg.id);
        setOpen(true);
      }
    };

    const handleItemUpdated = async (event: CustomEvent) => {
      if (event.detail.packageId === pkg.id && event.detail.itemId) {
        console.log("InboundPackageCard: Item updated, refreshing specific item", event.detail.itemId);
        
        try {
          // Fetch fresh data for the specific item
          const { data: itemResult } = await supabase
            .from("repair_items")
            .select("id, item_name, serial_number, mac_address, status, problem_reported, diagnosis, repairability, estimated_cost, total_accumulated_hours")
            .eq("id", event.detail.itemId)
            .maybeSingle();
          
          if (itemResult) {
            const updatedItem = {
              ...itemResult,
              total_hours: itemResult.total_accumulated_hours ?? 0,
              package_id: pkg.id
            };
            
            console.log(`InboundPackageCard: Refreshed item ${event.detail.itemId} data:`, updatedItem);
            
            // Update only the specific item in local state
            setLocalItems(prevItems =>
              prevItems.map(item =>
                item.id === event.detail.itemId ? { ...item, ...updatedItem } : item
              )
            );
          }
        } catch (error) {
          console.error("InboundPackageCard: Error fetching updated item data:", error);
        }
      }
    };

    window.addEventListener('items-added-to-package', handleItemsAdded as EventListener);
    window.addEventListener('repair-item-updated', handleItemUpdated as EventListener);
    window.addEventListener('repair-item-added', handleItemsAdded as EventListener); // Use same handler for added items
    
    return () => {
      window.removeEventListener('items-added-to-package', handleItemsAdded as EventListener);
      window.removeEventListener('repair-item-updated', handleItemUpdated as EventListener);
      window.removeEventListener('repair-item-added', handleItemsAdded as EventListener);
    };
  }, [pkg.id]);

  const handleDeleteItem = async (itemId: string) => {
    try {
      // Delete from database - both the repair item and its link to the package
      const { error: deleteItemLinkError } = await supabase
        .from('inbound_package_items')
        .delete()
        .eq('repair_item_id', itemId);

      if (deleteItemLinkError) throw deleteItemLinkError;

      const { error: deleteRepairError } = await supabase
        .from('repair_items')
        .delete()
        .eq('id', itemId);

      if (deleteRepairError) throw deleteRepairError;

      toast({
        title: "Item Deleted",
        description: "Repair item has been successfully deleted.",
      });

      // Dispatch custom event to refresh the data
      const event = new CustomEvent('repair-item-deleted', { 
        detail: { 
          packageId: pkg.id,
          itemId: itemId
        } 
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Error deleting repair item:', error);
      toast({
        title: "Error",
        description: "Failed to delete repair item. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDeletePackage = async () => {
    try {
      // First delete all repair items associated with this package
      const { error: deleteItemLinksError } = await supabase
        .from('inbound_package_items')
        .delete()
        .eq('package_id', pkg.id);

      if (deleteItemLinksError) throw deleteItemLinksError;

      // Delete repair items themselves
      const { error: deleteRepairItemsError } = await supabase
        .from('repair_items')
        .delete()
        .eq('package_id', pkg.id);

      if (deleteRepairItemsError) throw deleteRepairItemsError;

      // Delete receiving events
      const { error: deleteEventsError } = await supabase
        .from('receiving_events')
        .delete()
        .eq('package_id', pkg.id);

      if (deleteEventsError) throw deleteEventsError;

      // Finally delete the package
      const { error: deletePackageError } = await supabase
        .from('inbound_packages')
        .delete()
        .eq('id', pkg.id);

      if (deletePackageError) throw deletePackageError;

      toast({
        title: "Package Deleted",
        description: "Package and all associated items have been successfully deleted.",
      });

      // Dispatch custom event to refresh the parent component
      const event = new CustomEvent('package-deleted', { 
        detail: { 
          packageId: pkg.id
        } 
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Error deleting package:', error);
      toast({
        title: "Error",
        description: "Failed to delete package. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Simplified package status display
  const statusInfo = useMemo(() => {
    if (archived || packageResolved) return { label: 'ARCHIVED • ALL ITEMS RESOLVED', bgClass: 'bg-muted text-muted-foreground' };
    switch (pkg.status) {
      case 'in_transit':
        return {
          label: 'IN TRANSIT',
          bgClass: 'bg-blue-600'
        };
      case 'received':
        return {
          label: itemCount > 0 ? 'RECEIVED • Items logged' : 'RECEIVED • Ready to open box',
          bgClass: 'bg-green-600'
        };
      case 'opened':
        return {
          label: itemCount > 0 ? `BOX OPENED • ${itemCount} items` : 'BOX OPENED • Items recorded',
          bgClass: 'bg-green-600'
        };
      default:
        return {
          label: 'UNKNOWN STATUS',
          bgClass: 'bg-gray-600'
        };
    }
  }, [pkg.status, itemCount, archived, packageResolved]);

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden border-2 border-gray-400 dark:border-gray-500">
      {/* Status Ribbon */}
      <div className={`w-full py-1 px-2 text-center text-xs font-medium text-white ${statusInfo.bgClass}`}>
        <div className="leading-tight">{statusInfo.label}</div>
      </div>

      {/* Ship As Available Badge */}
      {pkg.shipping_preference === 'ship_as_available' && (
        <div className="px-2 pt-2 flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400">
            <Truck className="h-3 w-3 mr-1" />
            Ship As Available
          </Badge>
        </div>
      )}

      <CardHeader className="pb-2 pt-3 px-3">
        <div className="space-y-1 flex-1 min-w-0">
          {/* Company Information - Name and Owner at top */}
          {pkg.company && (
            <div className="space-y-0 mb-1 p-1 rounded-md bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-foreground">
                  {pkg.company.name}
                </div>
                <div className="flex justify-end -mr-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 w-5 p-0 border border-red-500 text-red-500 hover:bg-red-400 hover:text-white hover:border-red-400"
                          disabled={archived}
                          onClick={() => setShowDeleteConfirmation(true)}
                        >
                          <Trash2 className="h-2 w-2" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete package</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              {pkg.company.owners_name && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{pkg.company.owners_name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-3 w-3 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setDetailsCollapsed(!detailsCollapsed)}
                  >
                    {detailsCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
          
          <Collapsible open={!detailsCollapsed}>
            <CollapsibleContent>
              <CardTitle className="text-sm flex items-center gap-2">
                <PackageOpen className="h-3 w-3 text-primary" />
                {pkg.tracking_number.slice(-6)}
              </CardTitle>
              <div className="text-xs text-muted-foreground">{receivedLabel}</div>
              
              {/* Contact Information - Phone and Email at bottom */}
              {pkg.company && (pkg.company.phone || pkg.company.email) && (
                <div className="space-y-1 mt-1 p-1 rounded-md bg-muted/30">
                  {pkg.company.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground ml-4">
                      <Phone className="h-2.5 w-2.5" />
                      {pkg.company.phone}
                    </div>
                  )}
                  {pkg.company.email && (
                    <div className="flex items-center gap-2 text-xs ml-4">
                      <Mail className="h-2.5 w-2.5 text-muted-foreground" />
                      <a 
                        href={`mailto:${pkg.company.email}`}
                        className="text-primary hover:underline"
                      >
                        {pkg.company.email}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardHeader>

      <CardContent className="pt-0 px-3 pb-3">
        {pkg.rma_request_id && <Badge variant="outline" className="mb-2">{pkg.intake_notes?.split('\n')[0] || 'RMA return'}</Badge>}
        <Collapsible open={!detailsCollapsed}>
          <CollapsibleContent>
            {pkg.intake_notes && (
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{pkg.intake_notes}</p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Shipping preference badge with prioritization button */}

        {/* Package action buttons */}
        <div className={`flex justify-end gap-1 ${detailsCollapsed ? 'mb-0 -mt-2' : 'mb-3'}`}>
          {!archived && rma && ['issued','in_transit'].includes(rma.status) && <Button variant="outline" size="sm" onClick={() => setShowReceiptModal(true)}>Record RMA receipt</Button>}
          {!archived && completedItemsCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                    onClick={() => setShowShipmentModal(true)}
                  >
                    <Truck className="h-2.5 w-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Create Shipment ({completedItemsCount} ready)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                  disabled={archived || Boolean(rma && ['issued','in_transit'].includes(rma.status))}
                  onClick={() => setShowUnboxModal(true)}
                >
                  <PackageOpen className="h-2.5 w-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isUnboxed ? 'Edit Open Box' : 'Open Box'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                  disabled={archived}
                  onClick={() => setShowEditPackageModal(true)}
                >
                  <Box className="h-2.5 w-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit package</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {(isUnboxed || localItems.length > 0) && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <div className="flex items-center gap-1 mt-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="px-2 h-6">
                  {open ? (
                    <ChevronDown className="h-4 w-4 mr-1" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-1" />
                  )}
                  {archived ? 'Resolved items' : 'Items'} ({visibleItems.length})
                  {!archived && completedItemsCount > 0 && (
                    <Badge className="ml-2 bg-green-600 text-white text-xs px-1.5 py-0">
                      {completedItemsCount} Ready
                    </Badge>
                  )}
                </Button>
              </CollapsibleTrigger>
              {/* Hide "Unbox Items" button when package is at capacity */}
              {!archived && !(localItems.length >= pkg.item_count && pkg.item_count && pkg.item_count > 0) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                      onClick={() => {
                        setRepairItemModalMode('add');
                        setShowRepairItemModal(true);
                      }}
                    >
                     <PackageOpen className="h-2.5 w-2.5 rotate-180" />
                   </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Unbox Items</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            <CollapsibleContent className="mt-2 space-y-2">
              {visibleItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">No items linked to this package yet.</div>
              ) : (
                [...visibleItems]
                  .sort((a, b) => {
                    const orderDifference = (a.unboxing_order ?? Number.MAX_SAFE_INTEGER) - (b.unboxing_order ?? Number.MAX_SAFE_INTEGER);
                    return orderDifference !== 0 ? orderDifference : a.id.localeCompare(b.id);
                  })
                  .map((it) => {
                    // Use shared helper for consistent status display
                    const itemStatusInfo = isRepairItemResolved(it) && (it.status === 'scrapped' || it.completion_outcome?.endsWith('_scrapped')) ? { label: 'SCRAPPED', bgClass: 'bg-muted text-muted-foreground' } : getRepairItemRibbon(it.status);
                    const isMuted = archived || shouldMuteInRepairQueue(it.status);

                    return (
                      <TooltipProvider key={it.id}>
                        <Tooltip>
                      <TooltipTrigger asChild>
                            <div 
                              className={cn(
                                "rounded-md overflow-hidden ml-6 w-11/12 relative",
                                isMuted 
                                  ? "border-2 border-dashed border-muted-foreground/30 opacity-50" 
                                  : "border-2 border-gray-400 dark:border-gray-500"
                              )}
                            >
                              {/* Item Status Ribbon */}
                              <div className={`w-full py-1 px-2 text-center text-xs font-medium text-white ${itemStatusInfo.bgClass} ${isMuted ? 'flex items-center justify-center gap-1' : ''}`}>
                                {isMuted && <Truck className="h-3 w-3" />}
                                <div className="leading-tight">{itemStatusInfo.label}</div>
                              </div>
                              
                              {/* Item Delete Button - hide for muted items */}
                              {!isMuted && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="absolute top-8 right-1.5 h-6 w-6 p-0 border border-red-500 text-red-500 hover:bg-red-400 hover:text-white hover:border-red-400"
                                        onClick={() => handleDeleteItem(it.id)}
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Delete item</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              
                              <div className="p-2">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  Item #{it.unboxing_order ?? '—'}
                                  {it.item_name && <span className="text-muted-foreground">({it.item_name})</span>}
                                </div>
                                
                                {it.mac_address && (
                                  <div className="text-xs mt-1 text-muted-foreground">
                                    <strong>MAC:</strong> {it.mac_address}
                                  </div>
                                )}
                                
                                {it.serial_number && (
                                  <div className="text-xs mt-1 text-muted-foreground">
                                    <strong>Serial:</strong> {it.serial_number}
                                  </div>
                                )}
                                
                                {it.diagnosis && (
                                  <div className="text-xs mt-1 line-clamp-2 text-muted-foreground">
                                    <strong>Diagnosis:</strong> {it.diagnosis}
                                  </div>
                                )}
                                
                                {it.estimated_cost && (
                                  <div className="text-xs mt-1 text-muted-foreground">
                                    <FinancialGuard kind="revenue"><strong>Estimate:</strong> ${it.estimated_cost}</FinancialGuard>
                                  </div>
                                )}

                                {it.total_hours && (
                                  <div className="text-xs mt-1 text-muted-foreground">
                                    <strong>Labor Hours:</strong> {formatHoursToHrMin(it.total_hours)}
                                  </div>
                                )}

                                <div className="flex justify-between items-center mt-2 mr-0">
                                  {/* Left side: Shipping Queue indicator (only for muted items) */}
                                  {isMuted && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Truck className="h-3 w-3" />
                                      <span>{archived ? 'Resolved' : 'In Shipping Queue'}</span>
                                    </div>
                                  )}
                                  
                                  {/* Right side: Buttons (always visible) */}
                                  <div className={cn("flex gap-1", !isMuted && "ml-auto")}>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                                            onClick={() => {
                                              if (archived) {
                                                setIsReadOnlyMode(true);
                                                setSelectedItem(it);
                                                setShowDiagnoseModal(true);
                                              } else if (isMuted) {
                                                setPendingModalAction('diagnose');
                                                setPendingItem(it);
                                                setShippingStatusDialogType(isAlreadyShipped(it.status) ? 'shipped' : 'queued');
                                                setShippingStatusDialogOpen(true);
                                              } else {
                                                setSelectedItem(it);
                                                setShowDiagnoseModal(true);
                                              }
                                            }}
                                          >
                                            <Stethoscope className="h-2.5 w-2.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{isMuted ? 'View diagnosis' : 'Diagnose item'}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                      
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 w-6 p-0 border border-gray-400 dark:border-gray-500"
                                            onClick={() => {
                                              if (archived) {
                                                setIsReadOnlyMode(true);
                                                setSelectedItem(it);
                                                setRepairItemModalMode('edit');
                                                setShowRepairItemModal(true);
                                              } else if (isMuted) {
                                                setPendingModalAction('edit');
                                                setPendingItem(it);
                                                setShippingStatusDialogType(isAlreadyShipped(it.status) ? 'shipped' : 'queued');
                                                setShippingStatusDialogOpen(true);
                                              } else {
                                                setSelectedItem(it);
                                                setRepairItemModalMode('edit');
                                                setShowRepairItemModal(true);
                                              }
                                            }}
                                          >
                                            <Edit className="h-2.5 w-2.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{isMuted ? 'View item' : 'Edit item'}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TooltipTrigger>
                          {isMuted && (
                            <TooltipContent>
                              <p>{archived ? 'This item is resolved' : 'This item is in the Shipping Queue'}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <UnifiedOpenBoxModal
        isOpen={showUnboxModal}
        onClose={() => setShowUnboxModal(false)}
        package={pkg}
        mode={isUnboxed ? 'edit' : 'unbox'}
        onSuccess={() => {
          // Refresh the parent component data
          const event = new CustomEvent('package-updated', { 
            detail: { 
              packageId: pkg.id
            } 
          });
          window.dispatchEvent(event);
        }}
      />

      <ComprehensiveRepairItemModal
        isOpen={showRepairItemModal}
        onClose={() => {
          setShowRepairItemModal(false);
          setSelectedItem(null);
          setIsReadOnlyMode(false);
        }}
        packageId={pkg.id}
        initialDetails={rmaItemDefaults}
        editItem={repairItemModalMode === 'edit' ? selectedItem as RepairItemData : undefined}
        mode={repairItemModalMode}
        companyId={pkg.company ? (pkg.company as any).id : undefined}
        readOnly={isReadOnlyMode}
        onSuccess={() => {
          // Dispatch custom event to refresh the data
          const event = new CustomEvent('repair-item-added', { 
            detail: { 
              packageId: pkg.id
            } 
          });
          window.dispatchEvent(event);
        }}
      />

      {selectedItem && (
        <DiagnoseItemModal
          isOpen={showDiagnoseModal}
          onClose={() => {
            setShowDiagnoseModal(false);
            setSelectedItem(null);
            setIsReadOnlyMode(false);
          }}
          item={{
            ...selectedItem,
            package_id: pkg.id
          }}
          itemIndex={selectedItem.unboxing_order ?? 1}
          totalItems={itemCount}
          readOnly={isReadOnlyMode}
        />
      )}

      <UnifiedPackageModal
        open={showEditPackageModal}
        onOpenChange={setShowEditPackageModal}
        mode="edit"
        package={pkg}
        onSuccess={() => {
          console.log("Package updated successfully - dispatching custom event for package refresh");
          // Dispatch custom event for package refresh
          const event = new CustomEvent('package-updated', { 
            detail: { packageId: pkg.id } 
          });
          window.dispatchEvent(event);
        }}
      />
      {rma && <UnifiedPackageModal open={showReceiptModal} onOpenChange={setShowReceiptModal} mode="receive" rma={rma} onSuccess={() => { setRma({...rma,status:'received'}); }} />}

      {/* Delete Confirmation Modal */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete:
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>The package record ({pkg.tracking_number})</li>
                <li>All {localItems.length} associated repair item{localItems.length !== 1 ? 's' : ''}</li>
                <li>All related receiving events and data</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={() => {
                setShowDeleteConfirmation(false);
                handleDeletePackage();
              }}
            >
              Delete Package
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Shipment Modal */}
      <CreateRepairShipmentModal
        isOpen={showShipmentModal}
        onClose={() => setShowShipmentModal(false)}
        packageId={pkg.id}
        companyId={pkg.company_id || pkg.company?.id || null}
        companyName={pkg.company?.name || 'Unknown Company'}
        trackingNumber={pkg.tracking_number}
      />

      {/* Shipping Status Dialog */}
      <AlertDialog open={shippingStatusDialogOpen} onOpenChange={setShippingStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {shippingStatusDialogType === 'shipped' ? 'Item Already Shipped' : 'Item In Shipping Queue'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {shippingStatusDialogType === 'shipped' 
                ? 'This item cannot be edited because it has already been shipped to the customer.'
                : 'To edit this item, you must first delete the shipping order that contains this item from the Shipping Queue.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              // After acknowledging, open the modal in read-only mode
              if (pendingItem && pendingModalAction) {
                setIsReadOnlyMode(true);
                setSelectedItem(pendingItem);
                if (pendingModalAction === 'diagnose') {
                  setShowDiagnoseModal(true);
                } else {
                  setRepairItemModalMode('edit');
                  setShowRepairItemModal(true);
                }
                // Clear pending state
                setPendingModalAction(null);
                setPendingItem(null);
              }
            }}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
};
