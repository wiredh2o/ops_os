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
 import { Loader2, AlertTriangle, CreditCard, Package } from 'lucide-react';
 import { supabase } from '@/integrations/supabase/client';
 import { useToast } from '@/hooks/use-toast';
 import { formatCurrency } from '@/lib/utils';
 import { useSalesTaxPercentage } from '@/hooks/useSystemSettings';
 
interface OrderDetails {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  deposit_amount: number | null;
  estimated_shipping: number | null;
  customer_company_id: string;
  is_one_time_card: boolean;
  stripe_payment_method_id: string | null;
  company?: {
    id: string;
    name: string;
    is_taxable: boolean;
    stripe_customer_id: string | null;
  };
   items?: Array<{
     id: string;
     quantity_ordered: number;
     quantity_invoiced: number;
     unit_price: number;
     item_type: string;
     assembly_id: string | null;
     inventory_item_id: string | null;
     labor_item_id: string | null;
   }>;
 }
 
 interface DeleteCustomerOrderDialogProps {
   orderId: string;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onSuccess: () => void;
 }
 
 export function DeleteCustomerOrderDialog({ orderId, open, onOpenChange, onSuccess }: DeleteCustomerOrderDialogProps) {
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
          .from('customer_orders')
          .select(`
            id,
            order_number,
            order_status,
            payment_status,
            deposit_amount,
            estimated_shipping,
            customer_company_id,
            is_one_time_card,
            stripe_payment_method_id,
            company:companies(id, name, is_taxable, stripe_customer_id),
            items:customer_order_items(id, quantity_ordered, quantity_invoiced, unit_price, item_type, assembly_id, inventory_item_id, labor_item_id)
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
 
   const hasPaymentCollected = () => {
     if (!orderDetails) return false;
     return orderDetails.payment_status === 'paid' || orderDetails.payment_status === 'deposit_paid';
   };
 
   const hasPartialFulfillment = () => {
     if (!orderDetails?.items) return false;
     return orderDetails.items.some(item => item.quantity_invoiced > 0);
   };
 
   const calculateSubtotal = () => {
     if (!orderDetails?.items) return 0;
     return orderDetails.items.reduce((sum, item) => sum + (item.quantity_ordered * item.unit_price), 0);
   };
 
   const calculateTaxAmount = () => {
     if (!orderDetails?.company?.is_taxable || !orderDetails.items) return 0;
     // Assemblies and inventory items are typically taxable, labor may vary
     const taxableTotal = orderDetails.items
       .filter(item => item.item_type === 'assembly' || item.item_type === 'inventory_item')
       .reduce((sum, item) => sum + (item.quantity_ordered * item.unit_price), 0);
     return (taxableTotal * taxRate) / 100;
   };
 
   const calculateRefundAmount = () => {
     if (!orderDetails) return 0;
     const subtotal = calculateSubtotal();
     const taxAmount = calculateTaxAmount();
     const shippingCost = orderDetails.estimated_shipping || 0;
     return subtotal + taxAmount + shippingCost;
   };
 
   const handleDelete = async () => {
     if (!orderDetails) return;
     
     setProcessing(true);
 
     try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) throw new Error('Not authenticated');
 
       // Step 1: Handle payment credit/refund if payment was collected
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
               description: `Store credit from cancelled customer order ${orderDetails.order_number}`,
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
               description: `Pending refund from cancelled customer order ${orderDetails.order_number}`,
               created_by: user.id,
             });
         }
       }
 
         // Step 2: Detach one-time card if applicable — only if no other open orders use it
         if (orderDetails.is_one_time_card && orderDetails.stripe_payment_method_id) {
           try {
             const { data: siblingOrders } = await supabase
               .from('customer_orders')
               .select('id')
               .eq('stripe_payment_method_id', orderDetails.stripe_payment_method_id)
               .eq('is_one_time_card', true)
               .neq('id', orderDetails.id)
               .not('order_status', 'in', '(fulfilled,cancelled)');

             if (!siblingOrders?.length) {
               await supabase.functions.invoke('detach-stripe-payment-method', {
                 body: {
                   stripe_customer_id: orderDetails.company?.stripe_customer_id,
                   payment_method_id: orderDetails.stripe_payment_method_id,
                 }
               });
               console.log('One-time card detached on order deletion (no sibling orders)');
             } else {
               console.log(`Skipping detach — ${siblingOrders.length} other open order(s) still use this one-time card`);
             }
           } catch (detachErr) {
             console.error('Failed to detach one-time card:', detachErr);
           }
         }

        // Step 3: Delete order items first (foreign key constraint)
        await supabase
          .from('customer_order_items')
          .delete()
          .eq('customer_order_id', orderDetails.id);
 
       // Step 4: Delete the order
       const { error: deleteError } = await supabase
         .from('customer_orders')
         .delete()
         .eq('id', orderDetails.id);
 
       if (deleteError) throw deleteError;
 
       // Success message
       const refundAmount = calculateRefundAmount();
       let successMessage = 'Customer order deleted successfully';
       
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
       console.error('Error deleting customer order:', error);
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
   const taxAmount = calculateTaxAmount();
   const subtotal = calculateSubtotal();
   const itemCount = orderDetails?.items?.length || 0;
 
   return (
     <AlertDialog open={open} onOpenChange={onOpenChange}>
       <AlertDialogContent className="max-w-md">
         <AlertDialogHeader>
           <AlertDialogTitle>Delete Customer Order</AlertDialogTitle>
           <AlertDialogDescription asChild>
             <div className="space-y-4">
               <p>
                 Are you sure you want to delete order{' '}
                 <span className="font-medium">{orderDetails?.order_number}</span>
                 {orderDetails?.company?.name && (
                   <> for <span className="font-medium">{orderDetails.company.name}</span></>
                 )}?
               </p>
 
               {/* Partial fulfillment warning */}
               {hasPartialFulfillment() && (
                 <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                   <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                   <span className="text-sm">This order has been partially fulfilled. Some items have already been invoiced.</span>
                 </div>
               )}
 
               {/* What will happen */}
               <div className="space-y-2 text-sm">
                 <div className="flex items-center gap-2">
                   <Package className="h-4 w-4 text-muted-foreground" />
                   <span>{itemCount} line item{itemCount !== 1 ? 's' : ''} will be removed</span>
                 </div>
               </div>
 
               {/* Payment handling section */}
               {hasPaymentCollected() && (
                 <>
                   <Separator />
                   
                   <div className="space-y-3">
                     <div className="flex items-center gap-2">
                       <CreditCard className="h-4 w-4 text-primary" />
                       <span className="font-medium">Payment Already Collected</span>
                       <Badge variant="secondary" className="text-xs">
                         {orderDetails?.payment_status === 'deposit_paid' ? 'Deposit Paid' : 'Paid'}
                       </Badge>
                     </div>
 
                     {/* Amount breakdown */}
                     <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                       <div className="flex justify-between">
                         <span className="text-muted-foreground">Subtotal</span>
                         <span>{formatCurrency(subtotal)}</span>
                       </div>
                       {taxAmount > 0 && (
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">Tax</span>
                           <span>{formatCurrency(taxAmount)}</span>
                         </div>
                       )}
                       {(orderDetails?.estimated_shipping || 0) > 0 && (
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">Shipping</span>
                           <span>{formatCurrency(orderDetails?.estimated_shipping || 0)}</span>
                         </div>
                       )}
                       <Separator className="my-2" />
                       <div className="flex justify-between font-medium">
                         <span>Total to Credit/Refund</span>
                         <span className="text-primary">{formatCurrency(refundAmount)}</span>
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