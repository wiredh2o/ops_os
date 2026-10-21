import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PackageCheck, Truck, RefreshCw, Plus, Wrench, Trash2, Loader2, ShoppingCart } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/utils';
import { EnhancedProductionOrderForm } from './EnhancedProductionOrderForm';
import { RepairOrderForm } from './RepairOrderForm';
import { KanbanCard } from './KanbanCard';
import { useToast } from '@/hooks/use-toast';
import { RepairOrderQueueKanban } from '@/components/receiving/RepairOrderQueueKanban';
import { ShipOrderModal } from '@/components/shipping/ShipOrderModal';
import { DeleteOrderDialog } from './DeleteOrderDialog';
 import { DeleteCustomerOrderDialog } from './DeleteCustomerOrderDialog';
import { BackorderAlertWidget } from './BackorderAlertWidget';
import { CustomerOrderCard, CustomerOrderSummary, CustomerOrderLineItem } from './CustomerOrderCard';
import { FulfillCustomerOrderModal } from './FulfillCustomerOrderModal';
import { CustomerOrderForm } from './CustomerOrderForm';
import { PendingSerialsDashboardWidget } from './PendingSerialsDashboardWidget';
import { getCurrentTaxRate } from '@/lib/tax-utils';

import { OrderLineItem } from './KanbanCard';

interface KanbanOrder {
  id: string;
  order_number: string;
  customer_name: string;
  created_at: string;
  priority: string;
  status: string;
  total_amount?: number;
  notes?: string;
  customer_email?: string;
  customer_phone?: string;
  shipping_preference?: string;
  store_at_point_of_use?: boolean;
  customer_po?: string;
  line_items?: OrderLineItem[];
  tax_total?: number;
  shipping_cost?: number;
  payment_status?: string;
  payment_terms?: string;
  label_created_at?: string;
}


export const ProductionDashboard = () => {
  const [subassemblyOrders, setSubassemblyOrders] = useState<KanbanOrder[]>([]);
  const [readyToBuildWorkItems, setReadyToBuildWorkItems] = useState<KanbanOrder[]>([]);
  const [readyToShipOrders, setReadyToShipOrders] = useState<KanbanOrder[]>([]);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [selectedOrderToShip, setSelectedOrderToShip] = useState<KanbanOrder | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [showFulfillModal, setShowFulfillModal] = useState(false);
  const [selectedCustomerOrder, setSelectedCustomerOrder] = useState<CustomerOrderSummary | null>(null);
  const [showCustomerOrderForm, setShowCustomerOrderForm] = useState(false);
   const [editingCustomerOrderId, setEditingCustomerOrderId] = useState<string | null>(null);
   const [deleteCustomerOrderId, setDeleteCustomerOrderId] = useState<string | null>(null);
  const { toast } = useToast();


  useEffect(() => {
    fetchKanbanData();
    
    // Set up real-time subscriptions
    const productionChannel = supabase
      .channel('production-updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'production_orders' }, 
        fetchKanbanData
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'inventory_items' }, 
        fetchKanbanData
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'assemblies' }, 
        fetchKanbanData
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'customer_orders' }, 
        fetchKanbanData
      )
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'customer_order_items' }, 
        fetchKanbanData
      )
      .subscribe();

    // Listen for shipping order created events
    const handleShippingOrderCreated = () => {
      console.log("ProductionDashboard: Shipping order created, refreshing data");
      fetchKanbanData();
    };

    window.addEventListener('shipping-order-created', handleShippingOrderCreated);

    return () => {
      supabase.removeChannel(productionChannel);
      window.removeEventListener('shipping-order-created', handleShippingOrderCreated);
    };
  }, []);

  const fetchKanbanData = async () => {
    try {
      setLoading(true);
      
      // Fetch data in parallel
      const [buildRes, subBuildRes, shipRes, customerOrdersRes, taxRate] = await Promise.all([
        supabase.rpc('get_ready_to_build_production_orders'),
        supabase.rpc('get_ready_to_build_subassembly_orders'),
        supabase.rpc('get_ready_to_ship_customer_orders'),
        supabase
          .from('customer_orders')
          .select(`
            id, order_number, order_status, payment_status, priority, 
            shipping_preference, due_date, deposit_paid, deposit_amount,
            estimated_shipping, notes, created_at, customer_company_id,
            customer_po, is_one_time_card, stripe_payment_method_id,
            company:companies(id, name, is_taxable, stripe_customer_id)
          `)
          .in('order_status', ['pending', 'partially_fulfilled'])
          .order('created_at', { ascending: true }),
        getCurrentTaxRate(),
      ]);

      if (buildRes.error) throw buildRes.error;
      if (subBuildRes.error) throw subBuildRes.error;
      if (shipRes.error) throw shipRes.error;
      if (customerOrdersRes.error) throw customerOrdersRes.error;

      setReadyToBuildWorkItems(buildRes.data || []);
      setSubassemblyOrders(subBuildRes.data || []);

      // Process customer orders with item aggregation
      const rawCustomerOrders = customerOrdersRes.data || [];
      if (rawCustomerOrders.length > 0) {
        const orderIds = rawCustomerOrders.map((o: any) => o.id);
        const { data: items } = await supabase
          .from('customer_order_items')
           .select(`
             id,
             customer_order_id, 
             quantity_ordered, 
             quantity_invoiced, 
             unit_price,
             item_type,
          inventory_item:inventory_items(id, sku, sales_description, quantity_ats),
          assembly:assemblies(id, sku, sales_description, quantity_ats),
          labor_item:labor_items(id, name)
           `)
          .in('customer_order_id', orderIds);

        const processedOrders: CustomerOrderSummary[] = rawCustomerOrders.map((order: any) => {
          const orderItems = items?.filter(i => i.customer_order_id === order.id) || [];
          const itemCount = orderItems.length;
          const totalItemQuantity = orderItems
            .filter(i => i.item_type !== 'labor')
            .reduce((sum, i) => sum + i.quantity_ordered, 0);
          const orderTotal = orderItems.reduce((sum, i) => sum + (i.quantity_ordered * i.unit_price), 0);
          const quantityOrdered = orderItems.reduce((sum, i) => sum + i.quantity_ordered, 0);
          const quantityInvoiced = orderItems.reduce((sum, i) => sum + i.quantity_invoiced, 0);
           
           // Check for inventory shortages
           let hasInventoryShortage = false;
           let hasAssemblyShortage = false;
           
           for (const item of orderItems) {
             const quantityNeeded = item.quantity_ordered - item.quantity_invoiced;
             if (quantityNeeded <= 0) continue;
             
             if (item.item_type === 'inventory_item' && item.inventory_item) {
               if ((item.inventory_item.quantity_ats || 0) < quantityNeeded) {
                 hasInventoryShortage = true;
               }
             } else if (item.item_type === 'assembly' && item.assembly) {
               if ((item.assembly.quantity_ats || 0) < quantityNeeded) {
                 hasAssemblyShortage = true;
               }
             }
           }

          // Build line items array for display
          const lineItems: CustomerOrderLineItem[] = orderItems.map((item: any) => ({
            id: item.id,
            item_name: item.inventory_item?.sku || item.assembly?.sku || item.labor_item?.name || 'Unknown',
            item_description: item.inventory_item?.sales_description || item.assembly?.sales_description || item.labor_item?.name || 'Unknown',
            item_type: item.item_type,
            quantity_ordered: item.quantity_ordered,
            unit_price: item.unit_price,
            line_total: item.quantity_ordered * item.unit_price,
          }));

          // Calculate tax (assemblies and inventory are taxable, labor is not)
          const isTaxable = order.company?.is_taxable ?? true;
          const taxableTotal = lineItems
            .filter(li => li.item_type === 'assembly' || li.item_type === 'inventory_item')
            .reduce((sum, li) => sum + li.line_total, 0);
          const taxAmount = isTaxable ? (taxableTotal * taxRate) / 100 : 0;

          return {
            id: order.id,
            order_number: order.order_number,
            order_status: order.order_status || 'pending',
            payment_status: order.payment_status || 'pending',
            priority: order.priority || 'normal',
            shipping_preference: order.shipping_preference || 'ship_complete',
            due_date: order.due_date,
            deposit_paid: order.deposit_paid || false,
            deposit_amount: order.deposit_amount || 0,
            estimated_shipping: order.estimated_shipping || 0,
            notes: order.notes,
            created_at: order.created_at,
            company_name: order.company?.name || 'Unknown',
            company_id: order.company?.id || '',
            item_count: itemCount,
            total_item_quantity: totalItemQuantity,
            order_total: orderTotal,
            quantity_ordered: quantityOrdered,
            quantity_invoiced: quantityInvoiced,
            hasInventoryShortage,
            hasAssemblyShortage,
            line_items: lineItems,
            is_taxable: isTaxable,
            tax_amount: taxAmount,
            customer_po: order.customer_po || null,
            is_one_time_card: order.is_one_time_card || false,
            stripe_payment_method_id: order.stripe_payment_method_id || null,
            stripe_customer_id: order.company?.stripe_customer_id || null,
          };
        });
        setCustomerOrders(processedOrders);
      } else {
        setCustomerOrders([]);
      }
      
      // Fetch line items for shipping orders
      const shippingOrders = shipRes.data || [];
      if (shippingOrders.length > 0) {
        const orderIds = shippingOrders.map((o: KanbanOrder) => o.id);
        
        const { data: lineItems } = await supabase
          .from('production_order_items')
          .select('id, production_order_id, item_name, item_sku, quantity, unit_price, total_price, is_taxable, tax_amount, repair_item_id')
          .in('production_order_id', orderIds);
        
        // Fetch order details including shipping cost, payment status, and label_created_at
        const { data: orderDetails } = await supabase
          .from('production_orders')
          .select('id, shipping_cost, payment_status, label_created_at, customer_company_id')
          .in('id', orderIds);

        // Fetch company payment terms for the orders
        const companyIds = [...new Set(orderDetails?.filter(od => od.customer_company_id).map(od => od.customer_company_id) || [])];
        let companyTermsMap: Record<string, string> = {};
        
        if (companyIds.length > 0) {
          const { data: companies } = await supabase
            .from('companies')
            .select('id, payment_terms')
            .in('id', companyIds);
          
          companyTermsMap = (companies || []).reduce((acc, c) => {
            acc[c.id] = c.payment_terms || 'due_in_advance';
            return acc;
          }, {} as Record<string, string>);
        }

        // Fetch repair item data for grouping and diagnosis viewing
        const repairItemIds = [...new Set(lineItems?.filter(li => li.repair_item_id).map(li => li.repair_item_id) || [])];
        let repairItemsMap: Record<string, {
          id: string;
          item_name: string;
          serial_number?: string | null;
          mac_address?: string | null;
          problem_reported?: string | null;
          package_id?: string | null;
          diagnosis?: string | null;
          diagnosis_assessment?: string | null;
          completion_outcome?: string | null;
          estimated_cost?: number | null;
          status?: string | null;
          assigned_tray?: string | null;
          unboxing_order?: number | null;
          package_item_count?: number | null;
        }> = {};
        
        if (repairItemIds.length > 0) {
          const { data: repairItems } = await supabase
            .from('repair_items')
            .select('id, item_name, serial_number, mac_address, problem_reported, package_id, diagnosis, diagnosis_assessment, completion_outcome, estimated_cost, status')
            .in('id', repairItemIds);
          
          // Fetch assigned_tray from inbound_packages for each repair item's package
          const packageIds = [...new Set(repairItems?.filter(ri => ri.package_id).map(ri => ri.package_id) || [])];
          let packageTrayMap: Record<string, string | null> = {};
          let packageItemCountMap: Record<string, number> = {};
          
          if (packageIds.length > 0) {
            const { data: packages } = await supabase
              .from('inbound_packages')
              .select('id, assigned_tray')
              .in('id', packageIds);
            
            packageTrayMap = (packages || []).reduce((acc, pkg) => {
              acc[pkg.id] = pkg.assigned_tray;
              return acc;
            }, {} as Record<string, string | null>);

            // Fetch all package items to get unboxing_order and count per package
            const { data: packageItems } = await supabase
              .from('inbound_package_items')
              .select('repair_item_id, package_id, unboxing_order')
              .in('package_id', packageIds);

            // Build unboxing order map and count items per package
            const unboxingOrderMap: Record<string, number | null> = {};
            (packageItems || []).forEach(pi => {
              if (pi.repair_item_id) {
                unboxingOrderMap[pi.repair_item_id] = pi.unboxing_order;
              }
              // Count items per package
              packageItemCountMap[pi.package_id] = (packageItemCountMap[pi.package_id] || 0) + 1;
            });

            repairItemsMap = (repairItems || []).reduce((acc, ri) => {
              acc[ri.id] = {
                ...ri,
                assigned_tray: ri.package_id ? packageTrayMap[ri.package_id] : null,
                unboxing_order: unboxingOrderMap[ri.id] ?? null,
                package_item_count: ri.package_id ? packageItemCountMap[ri.package_id] : null,
              };
              return acc;
            }, {} as Record<string, typeof repairItemsMap[string]>);
          } else {
            // No packages, just map the repair items without tray/unboxing info
            repairItemsMap = (repairItems || []).reduce((acc, ri) => {
              acc[ri.id] = {
                ...ri,
                assigned_tray: null,
                unboxing_order: null,
                package_item_count: null,
              };
              return acc;
            }, {} as Record<string, typeof repairItemsMap[string]>);
          }
        }

        // Merge line items into orders with repair item data
        const ordersWithItems = shippingOrders.map((order: KanbanOrder) => {
          const items = (lineItems?.filter(li => li.production_order_id === order.id) || []).map(li => ({
            ...li,
            repair_item_name: li.repair_item_id ? repairItemsMap[li.repair_item_id]?.item_name : undefined,
            repair_item_data: li.repair_item_id ? repairItemsMap[li.repair_item_id] : undefined,
          }));
          const orderDetail = orderDetails?.find(od => od.id === order.id);
          const paymentTerms = orderDetail?.customer_company_id 
            ? companyTermsMap[orderDetail.customer_company_id] 
            : 'due_in_advance';
          return {
            ...order,
            line_items: items,
            tax_total: items.reduce((sum, li) => sum + (li.tax_amount || 0), 0),
            shipping_cost: orderDetail?.shipping_cost || 0,
            payment_status: orderDetail?.payment_status,
            payment_terms: paymentTerms,
            label_created_at: orderDetail?.label_created_at,
          };
        });
        
        setReadyToShipOrders(ordersWithItems);
      } else {
        setReadyToShipOrders([]);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch kanban data: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProductionAction = async (orderId: string, action: string) => {
    try {
      let updateData: any = {};

      switch (action) {
        case 'start_building':
          updateData = { status: 'in_progress' };
          break;
        case 'mark_complete':
          updateData = { status: 'completed' };
          break;
        default:
          return;
      }

      const { error } = await supabase
        .from('production_orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Production order ${action.replace('_', ' ')} successfully`,
      });

      fetchKanbanData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update production order: ' + error.message,
        variant: 'destructive',
      });
    }
  };

  const handleFulfillmentAction = async (orderId: string, action: string) => {
    if (action === 'ship_order') {
      // Find the order and open the shipping modal
      const orderToShip = readyToShipOrders.find(o => o.id === orderId);
      if (orderToShip) {
        setSelectedOrderToShip(orderToShip);
        setShowShipModal(true);
      }
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setDeleteOrderId(orderId);
  };

  const handleFulfillCustomerOrder = (orderId: string) => {
    const order = customerOrders.find(o => o.id === orderId);
    if (order) {
      setSelectedCustomerOrder(order);
      setShowFulfillModal(true);
    }
  };

   const handleEditCustomerOrder = (orderId: string) => {
     setEditingCustomerOrderId(orderId);
   };

   const handleDeleteCustomerOrder = (orderId: string) => {
     setDeleteCustomerOrderId(orderId);
   };

  const handleResetAllShipping = async () => {
    setResettingAll(true);
    try {
      // 1. Fetch ALL shipping orders
      const { data: shippingOrders, error: fetchError } = await supabase
        .from('production_orders')
        .select('id, fedex_tracking_number, fedex_label_url, order_type, status');

      if (fetchError) throw fetchError;

      if (!shippingOrders || shippingOrders.length === 0) {
        toast({
          title: 'No orders to reset',
          description: 'There are no shipping orders in the system',
        });
        setShowResetAllConfirm(false);
        setResettingAll(false);
        return;
      }

      let voidedLabels = 0;
      let deletedOrders = 0;
      let resetItems = 0;

      // 2. For each order with a tracking number, void the FedEx label
      for (const order of shippingOrders) {
        if (order.fedex_tracking_number) {
          try {
            await supabase.functions.invoke('void-fedex-shipment', {
              body: {
                tracking_number: order.fedex_tracking_number,
                order_id: order.id,
              },
            });
            voidedLabels++;
          } catch (voidError) {
            console.error('Error voiding label for order:', order.id, voidError);
          }
        }

        // Delete label from storage if exists
        if (order.fedex_label_url) {
          try {
            await supabase.storage
              .from('shipping-labels')
              .remove([order.fedex_label_url]);
          } catch (deleteError) {
            console.error('Error deleting label file:', deleteError);
          }
        }
      }

      // 3. Get all repair_item_ids from production_order_items
      const orderIds = shippingOrders.map(o => o.id);
      const { data: orderItems } = await supabase
        .from('production_order_items')
        .select('repair_item_id')
        .in('production_order_id', orderIds);

      const repairItemIds = (orderItems || [])
        .filter(i => i.repair_item_id)
        .map(i => i.repair_item_id) as string[];

      // 4. Reset all repair items to 'completed' status
      if (repairItemIds.length > 0) {
        const { error: updateError } = await supabase
          .from('repair_items')
          .update({ 
            status: 'completed',
            completion_outcome: 'repaired'
          })
          .in('id', repairItemIds);

        if (!updateError) {
          resetItems = repairItemIds.length;
        }
      }

      // 5. Delete all production_order_items for these orders
      await supabase
        .from('production_order_items')
        .delete()
        .in('production_order_id', orderIds);

      // 6. Delete all the production_orders themselves
      const { error: deleteOrdersError } = await supabase
        .from('production_orders')
        .delete()
        .in('id', orderIds);

      if (deleteOrdersError) throw deleteOrdersError;
      deletedOrders = orderIds.length;

      // 7. Dispatch refresh events
      window.dispatchEvent(new CustomEvent('repair-item-updated'));
      fetchKanbanData();

      toast({
        title: 'Reset Complete',
        description: `Deleted ${deletedOrders} orders, voided ${voidedLabels} labels, reset ${resetItems} repair items`,
      });

      setShowResetAllConfirm(false);
    } catch (error: any) {
      console.error('Error resetting shipping:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset shipping: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setResettingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading kanban board...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Production Kanban Dashboard</h2>
          <p className="text-muted-foreground">Assembly production and customer fulfillment workflow</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={fetchKanbanData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowProductionForm(true)} className="bg-gradient-primary">
            <Plus className="h-4 w-4 mr-2" />
            New Customer Order
          </Button>
          <Button onClick={() => setShowRepairForm(true)} variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground">
            <Wrench className="h-4 w-4 mr-2" />
            New Repair Order
          </Button>
        </div>
      </div>

      {/* Backorder Alert Widget */}
      <BackorderAlertWidget />

      {/* Pending Serial Numbers Widget */}
      <PendingSerialsDashboardWidget />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="border-border shadow-elegant">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customer Orders
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{customerOrders.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting fulfillment</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-elegant">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ready to Build
            </CardTitle>
            <PackageCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{readyToBuildWorkItems.length}</div>
            <p className="text-xs text-muted-foreground">Single assemblies to build</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-elegant">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ready to Ship
            </CardTitle>
            <Truck className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{readyToShipOrders.length}</div>
            <p className="text-xs text-muted-foreground">Customer orders</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-elegant">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Production Value
            </CardTitle>
            <PackageCheck className="h-4 w-4 text-status-progress" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              <FinancialGuard kind="revenue">{formatCurrency(readyToBuildWorkItems.reduce((sum, o) => sum + (o.total_amount || 0), 0))}</FinancialGuard>
            </div>
            <p className="text-xs text-muted-foreground">Orders value</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-elegant">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Shipping Value
            </CardTitle>
            <Truck className="h-4 w-4 text-status-complete" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              <FinancialGuard kind="revenue">{formatCurrency(readyToShipOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0))}</FinancialGuard>
            </div>
            <p className="text-xs text-muted-foreground">Ready to ship</p>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Subassembly Production Queue */}
        <Card className="min-h-[400px] lg:w-1/5 border-2 border-muted-foreground/40">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                Subassembly Production Queue
              </CardTitle>
              <Badge variant="secondary">{subassemblyOrders.length} orders</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Subassemblies to build (store at point of use when completed)
            </p>
          </CardHeader>
          <CardContent className="space-y-0">
            {subassemblyOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No subassemblies ready to build</h3>
                <p className="text-muted-foreground">
                  Subassembly build orders will appear here from cascade demand
                </p>
              </div>
            ) : (
              subassemblyOrders.map((order) => (
                <KanbanCard
                  key={order.id}
                  order={order}
                  type="production"
                  onAction={handleProductionAction}
                  onDelete={handleDeleteOrder}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Assembly Production Queue */}
        <Card className="min-h-[400px] lg:w-1/5 border-2 border-muted-foreground/40">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-primary" />
                Assembly Production Queue
              </CardTitle>
              <Badge variant="secondary">{readyToBuildWorkItems.length} orders</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Single assemblies ready to build (LEAN single-piece flow)
            </p>
          </CardHeader>
          <CardContent className="space-y-0">
            {readyToBuildWorkItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <PackageCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No work items ready to build</h3>
                <p className="text-muted-foreground">
                  Assembly build orders will appear here when all required components are in stock
                </p>
              </div>
            ) : (
              readyToBuildWorkItems.map((order) => (
                <KanbanCard
                  key={order.id}
                  order={order}
                  type="production"
                  onAction={handleProductionAction}
                  onDelete={handleDeleteOrder}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Customer Order Queue */}
        <Card className="min-h-[400px] lg:w-1/5 border-2 border-muted-foreground/40">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-accent" />
                Customer Orders
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowCustomerOrderForm(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
                <Badge variant="secondary">{customerOrders.length}</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Pending orders awaiting fulfillment
            </p>
          </CardHeader>
          <CardContent className="space-y-0">
            {customerOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No pending customer orders</h3>
                <p className="text-muted-foreground">
                  Customer orders will appear here when created
                </p>
              </div>
            ) : (
              customerOrders.map((order) => (
                <CustomerOrderCard
                  key={order.id}
                  order={order}
                  onFulfill={handleFulfillCustomerOrder}
                   onEdit={handleEditCustomerOrder}
                   onDelete={handleDeleteCustomerOrder}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Shipping Queue */}
        <Card className="min-h-[400px] lg:w-1/5 border-2 border-muted-foreground/40">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-accent" />
                Shipping Queue
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowResetAllConfirm(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Reset All
                </Button>
                <Badge variant="secondary">{readyToShipOrders.length} orders</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Customer orders ready to ship (FIFO by order date)
            </p>
          </CardHeader>
          <CardContent className="space-y-0">
            {readyToShipOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No orders ready to ship</h3>
                <p className="text-muted-foreground">
                  Orders will appear here based on their shipping preference and inventory availability
                </p>
              </div>
            ) : (
              readyToShipOrders.map((order) => (
                <KanbanCard
                  key={order.id}
                  order={order}
                  type="fulfillment"
                  onAction={handleFulfillmentAction}
                  onDelete={handleDeleteOrder}
                />
              ))
            )}
          </CardContent>
        </Card>

        <RepairOrderQueueKanban />
      </div>

      {/* Modals */}
      {showProductionForm && (
        <EnhancedProductionOrderForm
          onClose={() => setShowProductionForm(false)}
          onSuccess={() => {
            setShowProductionForm(false);
            fetchKanbanData();
          }}
        />
      )}

      {showRepairForm && (
        <RepairOrderForm
          onClose={() => setShowRepairForm(false)}
          onSuccess={() => {
            setShowRepairForm(false);
            fetchKanbanData();
          }}
        />
      )}

      {showShipModal && selectedOrderToShip && (
        <ShipOrderModal
          order={selectedOrderToShip}
          onClose={() => {
            setShowShipModal(false);
            setSelectedOrderToShip(null);
          }}
          onSuccess={() => {
            setShowShipModal(false);
            setSelectedOrderToShip(null);
            fetchKanbanData();
          }}
        />
      )}

      {deleteOrderId && (
        <DeleteOrderDialog
          orderId={deleteOrderId}
          open={!!deleteOrderId}
          onOpenChange={(open) => !open && setDeleteOrderId(null)}
          onSuccess={() => {
            setDeleteOrderId(null);
            fetchKanbanData();
          }}
        />
      )}

      {/* Reset All Shipping Confirmation Dialog */}
      <AlertDialog open={showResetAllConfirm} onOpenChange={setShowResetAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Reset All Shipping Orders (Debug)
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will <strong>permanently delete ALL shipping orders</strong> in the system. This action cannot be undone.
              </p>
              <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-lg p-3 text-sm space-y-1">
                <p><strong>What will happen:</strong></p>
                <ul className="list-disc list-inside space-y-1">
                  <li>All FedEx shipping labels will be voided</li>
                  <li>All label files will be deleted from storage</li>
                  <li>All repair items will be reset to "Completed" status</li>
                  <li>All production orders will be deleted</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleResetAllShipping();
              }}
              disabled={resettingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resettingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset All Shipping'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fulfill Customer Order Modal */}
      {showFulfillModal && selectedCustomerOrder && (
        <FulfillCustomerOrderModal
          order={selectedCustomerOrder}
          open={showFulfillModal}
          onOpenChange={(open) => {
            setShowFulfillModal(open);
            if (!open) setSelectedCustomerOrder(null);
          }}
          onSuccess={() => {
            fetchKanbanData();
          }}
        />
      )}

      <CustomerOrderForm
         open={showCustomerOrderForm || !!editingCustomerOrderId}
         orderId={editingCustomerOrderId || undefined}
         onClose={() => {
           setShowCustomerOrderForm(false);
           setEditingCustomerOrderId(null);
         }}
         onSuccess={() => {
           fetchKanbanData();
           setEditingCustomerOrderId(null);
         }}
      />

       {/* Delete Customer Order Dialog */}
       {deleteCustomerOrderId && (
         <DeleteCustomerOrderDialog
           orderId={deleteCustomerOrderId}
           open={!!deleteCustomerOrderId}
           onOpenChange={(open) => !open && setDeleteCustomerOrderId(null)}
           onSuccess={() => {
             setDeleteCustomerOrderId(null);
             fetchKanbanData();
           }}
         />
       )}
    </div>
  );
};