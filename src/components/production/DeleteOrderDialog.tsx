import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CreditCard, FileText, Truck, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { useSalesTaxPercentage } from '@/hooks/useSystemSettings';

interface OrderDetails {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: number;
  shipping_cost: number | null;
  fedex_tracking_number: string | null;
  fedex_label_url: string | null;
  carrier: string | null;
  shipping_carrier: string | null;
  customer_company_id: string | null;
  company?: {
    id: string;
    name: string;
    is_taxable: boolean;
  };
  items?: Array<{
    id: string;
    item_name: string;
    total_price: number;
    is_taxable: boolean;
    repair_item_id: string | null;
    source_order_item_id: string | null;
    quantity: number;
  }>;
  parent_customer_order_id?: string | null;
  parent_customer_order?: {
    order_number: string;
  } | null;
}

interface DeleteOrderDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteOrderDialog({ orderId, open, onOpenChange, onSuccess }: DeleteOrderDialogProps) {
  const { toast } = useToast();
  const taxRate = useSalesTaxPercentage();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [paymentOption, setPaymentOption] = useState<'credit' | 'refund'>('credit');

  useEffect(() => {
    if (open && orderId) {
      loadOrderDetails();
    }
  }, [open, orderId]);

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('production_orders')
        .select(`
          id,
          order_number,
          status,
          payment_status,
          total_amount,
          shipping_cost,
          fedex_tracking_number,
          fedex_label_url,
          carrier,
          shipping_carrier,
          customer_company_id,
          parent_customer_order_id,
          company:companies(id, name, is_taxable),
          parent_customer_order:customer_orders!parent_customer_order_id(order_number),
          items:production_order_items(id, item_name, total_price, is_taxable, repair_item_id, source_order_item_id, quantity)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setOrderDetails(data as unknown as OrderDetails);
    } catch (error: any) {
      console.error('Error loading order details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order details',
        variant: 'destructive',
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const getCarrierDisplayName = () => {
    const carrier = orderDetails?.carrier?.toLowerCase() || orderDetails?.shipping_carrier?.toLowerCase();
    if (carrier === 'ups') return 'UPS';
    if (carrier === 'usps') return 'USPS';
    if (carrier === 'fedex') return 'FedEx';
    return orderDetails?.shipping_carrier || 'the carrier';
  };

  const getStatusWarning = () => {
    if (!orderDetails) return null;
    const carrierName = getCarrierDisplayName();
    switch (orderDetails.status) {
      case 'label_staged':
        return { level: 'info', message: `Shipping label will be voided with ${carrierName}` };
      case 'awaiting_pickup':
        return { level: 'info', message: `Shipping label will be voided with ${carrierName}` };
      case 'in_transit':
        return { level: 'warning', message: '⚠️ Package may already be in transit - voiding label may not stop delivery' };
      case 'delivered':
        return { level: 'warning', message: '⚠️ Package has been delivered - label cannot be voided but order data will be cleared' };
      default:
        return null;
    }
  };

  const hasPaymentCollected = () => {
    if (!orderDetails) return false;
    return orderDetails.payment_status === 'paid';
  };

  const hasShippingLabel = () => {
    if (!orderDetails) return false;
    return !!orderDetails.fedex_tracking_number;
  };

  const calculateRefundAmount = () => {
    if (!orderDetails) return 0;

    const subtotal = orderDetails.total_amount || 0;
    const shippingCost = orderDetails.shipping_cost || 0;
    
    // Calculate tax on taxable items if customer is taxable
    let taxAmount = 0;
    if (orderDetails.company?.is_taxable && orderDetails.items) {
      const taxableTotal = orderDetails.items
        .filter(item => item.is_taxable)
        .reduce((sum, item) => sum + (item.total_price || 0), 0);
      
      taxAmount = (taxableTotal * taxRate) / 100;
    }

    return subtotal + taxAmount + shippingCost;
  };

  const getTaxAmount = () => {
    if (!orderDetails?.company?.is_taxable || !orderDetails.items) return 0;
    
    const taxableTotal = orderDetails.items
      .filter(item => item.is_taxable)
      .reduce((sum, item) => sum + (item.total_price || 0), 0);
    
    return (taxableTotal * taxRate) / 100;
  };

  const handleDelete = async () => {
    if (!orderDetails) return;
    
    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Step 1: Void shipping label if exists (carrier-aware)
      if (orderDetails.fedex_tracking_number) {
        const carrier = orderDetails.carrier?.toLowerCase() || orderDetails.shipping_carrier?.toLowerCase();
        let voidFunctionName = 'void-fedex-shipment'; // default
        
        if (carrier === 'ups') {
          voidFunctionName = 'void-ups-shipment';
        } else if (carrier === 'usps') {
          voidFunctionName = 'void-usps-shipment';
        }
        
        console.log(`Voiding ${carrier || 'unknown'} label:`, orderDetails.fedex_tracking_number);
        
        const { data: voidData, error: voidError } = await supabase.functions.invoke(voidFunctionName, {
          body: {
            tracking_number: orderDetails.fedex_tracking_number,
            order_id: orderDetails.id,
          },
        });

        if (voidError) {
          console.error(`${voidFunctionName} error:`, voidError);
          // Continue anyway - the label will expire
        } else {
          console.log(`${voidFunctionName} result:`, voidData);
        }

        // Delete label from storage if exists
        if (orderDetails.fedex_label_url) {
          const { error: deleteError } = await supabase.storage
            .from('shipping-labels')
            .remove([orderDetails.fedex_label_url]);
          
          if (deleteError) {
            console.error('Error deleting label file:', deleteError);
          }
        }
      }

      // Step 2: Handle payment credit/refund
      if (hasPaymentCollected() && orderDetails.customer_company_id) {
        const refundAmount = calculateRefundAmount();
        
        if (paymentOption === 'credit') {
          // Add to store credit balance
          const { data: company } = await supabase
            .from('companies')
            .select('store_credit_balance')
            .eq('id', orderDetails.customer_company_id)
            .single();

          await supabase
            .from('companies')
            .update({ 
              store_credit_balance: (company?.store_credit_balance || 0) + refundAmount 
            })
            .eq('id', orderDetails.customer_company_id);

          // Log the transaction
          await supabase
            .from('store_credit_transactions')
            .insert({
              company_id: orderDetails.customer_company_id,
              amount: refundAmount,
              transaction_type: 'credit',
              source_type: 'order_cancellation',
              source_order_id: orderDetails.id,
              description: `Store credit from cancelled order ${orderDetails.order_number}`,
              created_by: user.id,
            });

        } else {
          // Mark for refund via check
          const { data: company } = await supabase
            .from('companies')
            .select('pending_refund_balance')
            .eq('id', orderDetails.customer_company_id)
            .single();

          await supabase
            .from('companies')
            .update({ 
              pending_refund_balance: (company?.pending_refund_balance || 0) + refundAmount 
            })
            .eq('id', orderDetails.customer_company_id);

          // Log the transaction
          await supabase
            .from('store_credit_transactions')
            .insert({
              company_id: orderDetails.customer_company_id,
              amount: refundAmount,
              transaction_type: 'refund_pending',
              source_type: 'order_cancellation',
              source_order_id: orderDetails.id,
              description: `Pending refund from cancelled order ${orderDetails.order_number}`,
              created_by: user.id,
            });
        }
      }

      // Step 3: Reset repair items to 'completed' status
      const repairItemIds = orderDetails.items
        ?.filter(item => item.repair_item_id)
        .map(item => item.repair_item_id) || [];

      if (repairItemIds.length > 0) {
        await supabase
          .from('repair_items')
          .update({ 
            status: 'completed',
            completion_outcome: 'repaired'
          })
          .in('id', repairItemIds);
      }

      // Step 4: Delete order items
      await supabase
        .from('production_order_items')
        .delete()
        .eq('production_order_id', orderDetails.id);

      // Step 5: Delete the order
      const { error: deleteError } = await supabase
        .from('production_orders')
        .delete()
        .eq('id', orderDetails.id);

      if (deleteError) throw deleteError;

      // Step 6: Recalculate fulfillment on parent customer order (if linked)
      if (orderDetails.parent_customer_order_id) {
        const { error: recalcError } = await supabase.rpc(
          'recalculate_customer_order_fulfillment',
          { p_customer_order_id: orderDetails.parent_customer_order_id }
        );
        if (recalcError) {
          console.error('Error recalculating fulfillment:', recalcError);
          // Non-fatal: order is already deleted, log but don't block
        }
      }

      const refundAmount = calculateRefundAmount();
      let successMessage = 'Order deleted successfully';
      
      if (hasPaymentCollected()) {
        if (paymentOption === 'credit') {
          successMessage = `Order deleted. ${formatCurrency(refundAmount)} added to customer store credit`;
        } else {
          successMessage = `Order deleted. ${formatCurrency(refundAmount)} marked for refund via check`;
        }
      }

      toast({
        title: 'Success',
        description: successMessage,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete order',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const refundAmount = calculateRefundAmount();
  const taxAmount = getTaxAmount();
  const statusWarning = getStatusWarning();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Order from Fulfillment Queue</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Are you sure you want to delete order{' '}
                <span className="font-medium">{orderDetails?.order_number}</span>?
              </p>

              {/* Status warning banner */}
              {statusWarning && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  statusWarning.level === 'warning' 
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700' 
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
                }`}>
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">{statusWarning.message}</span>
                </div>
              )}

              {/* Parent customer order warning */}
              {orderDetails?.parent_customer_order_id && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700">
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">
                    Linked to customer order{' '}
                    <span className="font-medium">
                      {orderDetails.parent_customer_order?.order_number || 'Unknown'}
                    </span>
                    . Fulfillment progress will be reversed.
                  </span>
                </div>
              )}

              {/* What will happen */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span>Repair items will be reset to "Completed" status</span>
                </div>
                
                {hasShippingLabel() && (
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span>{getCarrierDisplayName()} shipping label will be voided and deleted</span>
                  </div>
                )}
              </div>

              {/* Payment handling section */}
              {hasPaymentCollected() && (
                <>
                  <Separator />
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span className="font-medium">Payment Already Collected</span>
                    </div>

                    {/* Amount breakdown */}
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span><FinancialGuard kind="revenue">{formatCurrency(orderDetails?.total_amount || 0)}</FinancialGuard></span>
                      </div>
                      {taxAmount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tax</span>
                          <span><FinancialGuard kind="revenue">{formatCurrency(taxAmount)}</FinancialGuard></span>
                        </div>
                      )}
                      {(orderDetails?.shipping_cost || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Shipping</span>
                          <span><FinancialGuard kind="revenue">{formatCurrency(orderDetails?.shipping_cost || 0)}</FinancialGuard></span>
                        </div>
                      )}
                      <Separator className="my-2" />
                      <div className="flex justify-between font-medium">
                        <span>Total to Credit/Refund</span>
                        <span className="text-primary"><FinancialGuard kind="revenue">{formatCurrency(refundAmount)}</FinancialGuard></span>
                      </div>
                    </div>

                    {/* Payment option selection */}
                    <RadioGroup 
                      value={paymentOption} 
                      onValueChange={(v) => setPaymentOption(v as 'credit' | 'refund')}
                      className="space-y-2"
                    >
                      <div 
                        className={`flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          paymentOption === 'credit' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setPaymentOption('credit')}
                      >
                        <RadioGroupItem value="credit" id="credit" />
                        <Label htmlFor="credit" className="flex-1 cursor-pointer">
                          <div className="font-medium">Apply as Store Credit</div>
                          <div className="text-xs text-muted-foreground">
                            Credit will be available for future orders
                          </div>
                        </Label>
                      </div>
                      
                      <div 
                        className={`flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          paymentOption === 'refund' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setPaymentOption('refund')}
                      >
                        <RadioGroupItem value="refund" id="refund" />
                        <Label htmlFor="refund" className="flex-1 cursor-pointer">
                          <div className="font-medium">Mark for Refund via Check</div>
                          <div className="text-xs text-muted-foreground">
                            Refund will appear in pending refunds queue
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={processing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Order'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
