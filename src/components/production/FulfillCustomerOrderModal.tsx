import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Package, AlertTriangle, CheckCircle, Truck, Key, CreditCard } from "lucide-react";
import { CustomerOrderSummary } from "./CustomerOrderCard";
import { useAuth } from "@/hooks/useAuth";
import {
  calculateAndGetFreightCharge,
  createDropShipPurchaseOrder,
  determineFulfillmentMethod,
} from "@/lib/fulfillment-routing-utils";
import { isRangeTracked, recordRangeSold } from "@/lib/serial-range-utils";
import { RangeAssignmentSection } from "@/components/shipping/RangeAssignmentSection";

interface OrderItem {
  id: string;
  item_type: string;
  quantity_ordered: number;
  quantity_invoiced: number;
  unit_price: number;
  notes: string | null;
  requested_serial: string | null;
  inventory_item?: { id: string; sku: string; sales_description: string | null; quantity_ats: number; serial_tracking_type?: string | null; external_supplier_id?: string | null } | null;
  assembly?: { id: string; sku: string; sales_description: string | null; quantity_ats: number; serial_tracking_type?: string | null; external_supplier_id?: string | null } | null;
  labor_item?: { id: string; item_number: string; name: string } | null;
  inventory_sales_uom_id?: string | null;
  assembly_sales_uom_id?: string | null;
}

interface FulfillCustomerOrderModalProps {
  order: CustomerOrderSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const FulfillCustomerOrderModal = ({
  order,
  open,
  onOpenChange,
  onSuccess,
}: FulfillCustomerOrderModalProps) => {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  // Track range assignments: { itemId: { rangeStart, rangeEnd, isValid } }
  const [rangeAssignments, setRangeAssignments] = useState<Record<string, { rangeStart: number | null; rangeEnd: number | null; isValid: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (open && order.id) {
      fetchOrderItems();
    }
  }, [open, order.id]);

  const fetchOrderItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customer_order_items")
        .select(`
          id, item_type, quantity_ordered, quantity_invoiced, unit_price, notes, requested_serial, is_taxable,
          inventory_sales_uom_id, assembly_sales_uom_id,
          inventory_item:inventory_items!customer_order_items_inventory_item_id_fkey(id, sku, sales_description, quantity_ats, serial_tracking_type, external_supplier_id),
          assembly:assemblies!customer_order_items_assembly_id_fkey(id, sku, sales_description, quantity_ats, serial_tracking_type, external_supplier_id),
          labor_item:labor_items(id, item_number, name)
        `)
        .eq("customer_order_id", order.id);

      if (error) throw error;

      setItems(data || []);
      
      // Pre-select all items with remaining quantity
      const initialSelection: Record<string, number> = {};
      (data || []).forEach(item => {
        const remaining = item.quantity_ordered - item.quantity_invoiced;
        if (remaining > 0) {
          initialSelection[item.id] = remaining;
        }
      });
      setSelectedItems(initialSelection);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load order items: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getItemName = (item: OrderItem): string => {
    if (item.item_type === "inventory_item" && item.inventory_item) {
      return item.inventory_item.sales_description || item.inventory_item.sku;
    }
    if (item.item_type === "assembly" && item.assembly) {
      return item.assembly.sales_description || item.assembly.sku;
    }
    if (item.item_type === "labor" && item.labor_item) {
      return item.labor_item.name;
    }
    return "Unknown Item";
  };

  const getItemSku = (item: OrderItem): string => {
    if (item.item_type === "inventory_item" && item.inventory_item) {
      return item.inventory_item.sku;
    }
    if (item.item_type === "assembly" && item.assembly) {
      return item.assembly.sku;
    }
    if (item.item_type === "labor" && item.labor_item) {
      return item.labor_item.item_number;
    }
    return "";
  };

  const getAvailableStock = (item: OrderItem): number | null => {
    if (item.item_type === "labor") return null;
    if (item.item_type === "inventory_item" && item.inventory_item) {
      return item.inventory_item.quantity_ats;
    }
    if (item.item_type === "assembly" && item.assembly) {
      return item.assembly.quantity_ats;
    }
    return 0;
  };

  // Check if item requires manual serial tracking
  const requiresManualSerial = (item: OrderItem): boolean => {
    if (item.item_type === "inventory_item" && item.inventory_item) {
      return item.inventory_item.serial_tracking_type === "manual";
    }
    if (item.item_type === "assembly" && item.assembly) {
      return item.assembly.serial_tracking_type === "manual";
    }
    return false;
  };

  // Check if item requires range tracking (fleet/gift cards)
  const requiresRangeTracking = (item: OrderItem): boolean => {
    if (item.item_type === "inventory_item" && item.inventory_item) {
      return isRangeTracked(item.inventory_item.serial_tracking_type);
    }
    if (item.item_type === "assembly" && item.assembly) {
      return isRangeTracked(item.assembly.serial_tracking_type);
    }
    return false;
  };

  // Get item ID for range tracking
  const getItemIdForRange = (item: OrderItem): string | null => {
    if (item.item_type === "inventory_item" && item.inventory_item) {
      return item.inventory_item.id;
    }
    if (item.item_type === "assembly" && item.assembly) {
      return item.assembly.id;
    }
    return null;
  };

  // Check if item has a requested serial
  const hasRequestedSerial = (item: OrderItem): boolean => {
    return !!item.requested_serial;
  };

  // Determine if item needs drop-ship (manual serial item with specific serial or low stock)
  const needsDropShip = (item: OrderItem): boolean => {
    if (!requiresManualSerial(item)) return false;
    const availableStock = getAvailableStock(item);
    const remaining = item.quantity_ordered - item.quantity_invoiced;
    // If stock is insufficient and it requires manual serial
    return availableStock !== null && availableStock < remaining;
  };

  // Get the external supplier for an item
  const getExternalSupplier = (item: OrderItem): string | null => {
    if (item.item_type === "inventory_item" && item.inventory_item) {
      return item.inventory_item.external_supplier_id || null;
    }
    if (item.item_type === "assembly" && item.assembly) {
      return item.assembly.external_supplier_id || null;
    }
    return null;
  };

  // Handle range assignment changes
  const handleRangeChange = useCallback((itemId: string, rangeStart: number | null, rangeEnd: number | null, isValid: boolean) => {
    setRangeAssignments(prev => ({
      ...prev,
      [itemId]: { rangeStart, rangeEnd, isValid }
    }));
  }, []);

  const handleToggleItem = (itemId: string, remaining: number) => {
    setSelectedItems(prev => {
      if (prev[itemId] !== undefined) {
        const { [itemId]: _, ...rest } = prev;
        // Also clear range assignment when deselecting
        setRangeAssignments(prevRanges => {
          const { [itemId]: __, ...restRanges } = prevRanges;
          return restRanges;
        });
        return rest;
      }
      return { ...prev, [itemId]: remaining };
    });
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const remaining = item.quantity_ordered - item.quantity_invoiced;
    const validQuantity = Math.min(Math.max(1, quantity), remaining);
    
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: validQuantity,
    }));
  };

  const handleFulfill = async () => {
    const selectedItemIds = Object.keys(selectedItems);
    if (selectedItemIds.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one item to fulfill",
        variant: "destructive",
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to fulfill orders",
        variant: "destructive",
      });
      return;
    }

    // An invoice may only contain items available to ship now (drop-ships excepted).
    for (const id of selectedItemIds) {
      const item = items.find(i => i.id === id)!;
      const dropShip = needsDropShip(item) && !!getExternalSupplier(item);
      if (!canInvoiceQuantity(selectedItems[id], getAvailableStock(item), dropShip)) {
        toast({
          title: "Not available to ship",
          description: `Only ${getAvailableStock(item)} of ${getItemName(item)} can ship now. Invoice just what's available.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Validate range-tracked items have valid range assignments
    const rangeTrackedSelectedItems = selectedItemIds
      .map(id => items.find(i => i.id === id)!)
      .filter(item => requiresRangeTracking(item));

    for (const item of rangeTrackedSelectedItems) {
      const assignment = rangeAssignments[item.id];
      if (!assignment?.isValid) {
        toast({
          title: "Invalid Range Assignment",
          description: `Please assign a valid card range for ${getItemName(item)}`,
          variant: "destructive",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      // Fetch customer order details for the production order
      const { data: customerOrder, error: orderError } = await supabase
        .from("customer_orders")
        .select(`
          id, order_number, notes, shipping_preference, signature_option,
          carrier_preference, shipping_address_id, customer_po, tax_destination,
           company:companies(id, name, email, phone, is_taxable, preferred_shipping_carrier, shipping_addresses, default_shipping_address_id)
        `)
        .eq("id", order.id)
        .single();

      if (orderError) throw orderError;

      // Generate new production order number
      const { data: lastOrder } = await supabase
        .from("production_orders")
        .select("order_number")
        .ilike("order_number", "INV-%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNumber = 1001;
      if (lastOrder?.order_number) {
        const match = lastOrder.order_number.match(/INV-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      const newOrderNumber = `INV-${nextNumber}`;

      // Calculate totals for selected items
      let subtotal = 0;
      const selectedItemsData = selectedItemIds.map(itemId => {
        const item = items.find(i => i.id === itemId)!;
        const qty = selectedItems[itemId];
        const lineTotal = qty * item.unit_price;
        subtotal += lineTotal;
        return { item, qty, lineTotal };
      });

      // Create production order (invoice)
      const { data: newOrder, error: createError } = await supabase
        .from("production_orders")
        .insert({
          order_number: newOrderNumber,
          order_type: "customer",
          status: "completed", // Ready for shipping
          customer_company_id: customerOrder.company?.id,
          customer_name: customerOrder.company?.name || order.company_name,
          customer_email: customerOrder.company?.email,
          customer_phone: customerOrder.company?.phone,
          notes: customerOrder.notes,
          customer_po: customerOrder.customer_po || null,
          shipping_preference: customerOrder.shipping_preference as "ship_complete" | "ship_as_available" | null,
          signature_option: customerOrder.signature_option,
          parent_customer_order_id: order.id,
          tax_destination: (customerOrder as any).tax_destination ?? null,
          carrier_preference: customerOrder.carrier_preference || customerOrder.company?.preferred_shipping_carrier,
          total_amount: subtotal,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (createError) throw createError;

      // Create production order items
      const orderItems = selectedItemsData.map(({ item, qty, lineTotal }) => ({
        production_order_id: newOrder.id,
        item_name: getItemName(item),
        item_type: item.item_type,
        quantity: qty,
        unit_price: item.unit_price,
        total_price: lineTotal,
        // Item-level taxability from the source order line; labor is never taxable.
        is_taxable: item.item_type !== "labor" && (item as any).is_taxable !== false,
        source_order_item_id: item.id,
        assembly_id: item.item_type === "assembly" && item.assembly ? item.assembly.id : null,
        inventory_item_id: item.item_type === "inventory_item" && item.inventory_item ? item.inventory_item.id : null,
        labor_item_id: item.item_type === "labor" && item.labor_item ? item.labor_item.id : null,
      }));

      const { error: itemsError } = await supabase
        .from("production_order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Drop-ship routing + freight (manual-serial items only)
      const companyShippingAddresses = (() => {
        const raw = customerOrder.company?.shipping_addresses;
        if (!raw) return [] as any[];
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      })();

      const shippingAddressId = customerOrder.shipping_address_id || customerOrder.company?.default_shipping_address_id;
      const shipTo = (companyShippingAddresses || []).find((a: any) => a.id === shippingAddressId) || companyShippingAddresses?.[0];

      let freightTotal = 0;
      let freightLaborItemId: string | null = null;

      if (shipTo) {
        for (const { item, qty } of selectedItemsData) {
          if (!requiresManualSerial(item)) continue;
          if (item.item_type !== 'inventory_item' && item.item_type !== 'assembly') continue;

          const itemId = item.item_type === 'inventory_item' ? item.inventory_item?.id : item.assembly?.id;
          if (!itemId) continue;

          const fulfillment = await determineFulfillmentMethod(
            itemId,
            item.item_type === 'inventory_item' ? 'inventory' : 'assembly',
            qty,
            item.requested_serial
          );

          if (fulfillment.method !== 'drop_ship') continue;

          const vendorId = getExternalSupplier(item);
          if (!vendorId) {
            throw new Error(`Missing external supplier for ${getItemSku(item)} (required for drop-ship).`);
          }

          // Create drop-ship PO
          const poResult = await createDropShipPurchaseOrder({
            vendorId,
            customerOrderId: order.id,
            customerOrderItemId: item.id,
            itemId,
            itemType: item.item_type === 'inventory_item' ? 'inventory' : 'assembly',
            itemSku: getItemSku(item),
            itemName: getItemName(item),
            quantity: qty,
            unitCost: item.unit_price,
            customerAddress: {
              city: shipTo.city,
              state: shipTo.state,
              zip: shipTo.zip,
              country: shipTo.country || 'US',
            },
            customerName: customerOrder.company?.name || order.company_name,
            userId: user.id,
          });

          if (!poResult.success) {
            throw new Error(poResult.error || 'Failed to create drop-ship PO');
          }

          // Calculate freight and accumulate (one freight line item on invoice)
          const freight = await calculateAndGetFreightCharge(
            vendorId,
            {
              city: shipTo.city,
              state: shipTo.state,
              zip: shipTo.zip,
              country: shipTo.country || 'US',
            },
            1
          );

          if (freight.error) {
            console.warn('[FulfillCustomerOrderModal] Freight calc error:', freight.error);
          } else {
            freightTotal += freight.freightAmount;
            freightLaborItemId = freight.laborItemId;
          }
        }
      }

      // Add freight labor line item (NEVER taxable)
      if (freightTotal > 0 && freightLaborItemId) {
        const { error: freightInsertError } = await supabase
          .from('production_order_items')
          .insert({
            production_order_id: newOrder.id,
            item_type: 'labor',
            labor_item_id: freightLaborItemId,
            item_name: 'Drop Ship Freight',
            quantity: 1,
            unit_price: freightTotal,
            total_price: freightTotal,
            is_taxable: false,
            source_order_item_id: null,
          });

        if (freightInsertError) throw freightInsertError;

        const { error: totalUpdateError } = await supabase
          .from('production_orders')
          .update({ total_amount: subtotal + freightTotal })
          .eq('id', newOrder.id);

        if (totalUpdateError) throw totalUpdateError;
      }

      // Update quantity_invoiced on customer_order_items and record range allocations
      for (const itemId of selectedItemIds) {
        const item = items.find(i => i.id === itemId)!;
        const newInvoiced = item.quantity_invoiced + selectedItems[itemId];

        // Record range allocation for range-tracked items
        if (requiresRangeTracking(item)) {
          const assignment = rangeAssignments[itemId];
          const rangeItemId = getItemIdForRange(item);
          if (assignment?.isValid && rangeItemId && assignment.rangeStart && assignment.rangeEnd) {
            const rangeResult = await recordRangeSold(
              rangeItemId,
              item.item_type === "inventory_item" ? "inventory" : "assembly",
              assignment.rangeStart,
              assignment.rangeEnd,
              order.id,
              itemId
            );
            
            if (!rangeResult.success) {
              throw new Error(`Failed to record range allocation: ${rangeResult.error}`);
            }

            // Update customer_order_items with the range
            const { error: rangeUpdateError } = await supabase
              .from("customer_order_items")
              .update({ 
                quantity_invoiced: newInvoiced,
                serial_range_start: assignment.rangeStart,
                serial_range_end: assignment.rangeEnd,
              })
              .eq("id", itemId);
            if (rangeUpdateError) throw new Error(`Failed to update item ${getItemSku(item)}: ${rangeUpdateError.message}`);
          } else {
            const { error: itemUpdateError } = await supabase
              .from("customer_order_items")
              .update({ quantity_invoiced: newInvoiced })
              .eq("id", itemId);
            if (itemUpdateError) throw new Error(`Failed to update item ${getItemSku(item)}: ${itemUpdateError.message}`);
          }
        } else {
          const { error: itemUpdateError } = await supabase
            .from("customer_order_items")
            .update({ quantity_invoiced: newInvoiced })
            .eq("id", itemId);
          if (itemUpdateError) throw new Error(`Failed to update item ${getItemSku(item)}: ${itemUpdateError.message}`);
        }
      }

      // Check if all items are fully invoiced
      const { data: updatedItems } = await supabase
        .from("customer_order_items")
        .select("quantity_ordered, quantity_invoiced")
        .eq("customer_order_id", order.id);

      const allFullyInvoiced = updatedItems?.every(
        i => i.quantity_invoiced >= i.quantity_ordered
      );

      // Update customer order status
      const newStatus = allFullyInvoiced ? "fulfilled" : "partially_fulfilled";
      await supabase
        .from("customer_orders")
        .update({ order_status: newStatus })
        .eq("id", order.id);

      // Detach one-time card after full fulfillment — only if no other open orders use it
      if (newStatus === 'fulfilled' && order.is_one_time_card && order.stripe_payment_method_id) {
        try {
          const { data: siblingOrders } = await supabase
            .from('customer_orders')
            .select('id')
            .eq('stripe_payment_method_id', order.stripe_payment_method_id)
            .eq('is_one_time_card', true)
            .neq('id', order.id)
            .not('order_status', 'in', '(fulfilled,cancelled)');

          if (!siblingOrders?.length) {
            await supabase.functions.invoke('detach-stripe-payment-method', {
              body: {
                stripe_customer_id: order.stripe_customer_id,
                payment_method_id: order.stripe_payment_method_id,
              }
            });
            console.log('One-time card detached after full fulfillment (no sibling orders)');
          } else {
            console.log(`Skipping detach — ${siblingOrders.length} other open order(s) still use this one-time card`);
          }
        } catch (detachErr) {
          console.error('Failed to detach one-time card:', detachErr);
          // Non-blocking — order fulfillment still succeeds
        }
      }

      toast({
        title: "Success",
        description: `Created invoice ${newOrderNumber} with ${selectedItemIds.length} items`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create invoice: " + error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const totalSelected = Object.values(selectedItems).reduce((sum, qty) => sum + qty, 0);
  const totalValue = Object.entries(selectedItems).reduce((sum, [itemId, qty]) => {
    const item = items.find(i => i.id === itemId);
    return sum + (item ? qty * item.unit_price : 0);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-accent" />
            Fulfill Order: {order.order_number}
          </DialogTitle>
          <DialogDescription>
            Select items to include in this shipment. A new invoice will be created for the selected items.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Order Info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Customer:</span>
            <span className="font-medium">{order.company_name}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items found for this order
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const remaining = item.quantity_ordered - item.quantity_invoiced;
                const isSelected = selectedItems[item.id] !== undefined;
                const availableStock = getAvailableStock(item);
                const hasStockWarning = availableStock !== null && availableStock < remaining;

                if (remaining <= 0) {
                  return (
                    <Card key={item.id} className="opacity-50">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-status-complete" />
                          <div>
                            <p className="text-sm font-medium">{getItemName(item)}</p>
                            <p className="text-xs text-muted-foreground">{getItemSku(item)}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">Fully Invoiced</Badge>
                      </CardContent>
                    </Card>
                  );
                }

                return (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "border-accent bg-accent/10" : ""
                    }`}
                    onClick={() => handleToggleItem(item.id, remaining)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleItem(item.id, remaining)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{getItemName(item)}</p>
                              <p className="text-xs text-muted-foreground">{getItemSku(item)}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {item.item_type}
                            </Badge>
                          </div>

                          <div className="mt-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-4">
                              <span className="text-muted-foreground">
                                Ordered: {item.quantity_ordered}
                              </span>
                              <span className="text-muted-foreground">
                                Invoiced: {item.quantity_invoiced}
                              </span>
                              <span className="font-medium text-foreground">
                                Remaining: {remaining}
                              </span>
                            </div>
                            <span className="font-medium">
                              <FinancialGuard kind="revenue">{formatCurrency(item.unit_price)}</FinancialGuard> ea
                            </span>
                          </div>

                          {/* Stock Warning */}
                          {hasStockWarning && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-status-progress">
                              <AlertTriangle className="h-3 w-3" />
                              Only {availableStock} in stock
                            </div>
                          )}

                          {/* Serial Tracking Indicator */}
                          {requiresManualSerial(item) && (
                            <div className="mt-2 flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-xs gap-1">
                                <Key className="h-3 w-3" />
                                Manual Serial
                              </Badge>
                              {hasRequestedSerial(item) && (
                                <span className="text-muted-foreground">
                                  Requested: <span className="font-mono">{item.requested_serial}</span>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Range Tracking Indicator */}
                          {requiresRangeTracking(item) && (
                            <div className="mt-2 flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-xs gap-1 border-accent text-accent">
                                <CreditCard className="h-3 w-3" />
                                Range Tracking
                              </Badge>
                              <span className="text-muted-foreground">
                                Assign card range at fulfillment
                              </span>
                            </div>
                          )}

                          {/* Drop-Ship Indicator */}
                          {needsDropShip(item) && getExternalSupplier(item) && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-accent-foreground bg-accent/30 px-2 py-1 rounded">
                              <Truck className="h-3 w-3" />
                              Will create drop-ship PO (insufficient stock)
                            </div>
                          )}

                          {/* Quantity Selector */}
                          {isSelected && (
                            <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <Label className="text-xs text-muted-foreground">Qty to fulfill:</Label>
                              <Input
                                type="number"
                                min={1}
                                max={remaining}
                                value={selectedItems[item.id]}
                                onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                                className="w-20 h-7 text-xs"
                              />
                              <span className="text-xs text-muted-foreground">
                                = <FinancialGuard kind="revenue">{formatCurrency(selectedItems[item.id] * item.unit_price)}</FinancialGuard>
                              </span>
                            </div>
                          )}

                          {/* Range Assignment Section - for range-tracked items */}
                          {isSelected && requiresRangeTracking(item) && getItemIdForRange(item) && (
                            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                              <RangeAssignmentSection
                                itemId={getItemIdForRange(item)!}
                                itemType={item.item_type === "inventory_item" ? "inventory" : "assembly"}
                                itemSku={getItemSku(item)}
                                quantityToFulfill={selectedItems[item.id]}
                                onRangeChange={(start, end, isValid) => handleRangeChange(item.id, start, end, isValid)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Summary */}
          {Object.keys(selectedItems).length > 0 && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Selected Items:</span>
                <span className="font-medium">{totalSelected} units</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-semibold"><FinancialGuard kind="revenue">{formatCurrency(totalValue)}</FinancialGuard></span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleFulfill}
            disabled={submitting || Object.keys(selectedItems).length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Invoice...
              </>
            ) : (
              `Create Invoice (${Object.keys(selectedItems).length} items)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
