import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, AlertTriangle, Calendar, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { 
  SHIPPING_CARRIERS, 
  getShippingMethodsForCarrier, 
  calculateShipByDate,
  getCarrierLabel,
  getMethodLabel
} from '@/lib/shipping-carrier-options';

interface PurchaseOrderDetails {
  id: string;
  purchase_order_number: string;
  order_date: string;
  supplier_id: string;
  notes?: string | null;
  subtotal: number;
  total: number;
  ship_by_date?: string | null;
  requested_shipping_carrier?: string | null;
  requested_shipping_method?: string | null;
}

interface Supplier {
  id: string;
  name: string;
  email?: string | null;
  lead_time_days: number;
  default_shipping_carrier?: string | null;
  default_shipping_method?: string | null;
}

interface SendToVendorDialogProps {
  purchaseOrder: PurchaseOrderDetails;
  onClose: () => void;
  onSuccess: () => void;
}

export function SendToVendorDialog({ purchaseOrder, onClose, onSuccess }: SendToVendorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [itemCount, setItemCount] = useState<number>(0);
  const [shipByDate, setShipByDate] = useState<string>('');
  const [shippingCarrier, setShippingCarrier] = useState<string>('');
  const [shippingMethod, setShippingMethod] = useState<string>('');
  const { toast } = useToast();
  useEffect(() => {
    fetchData();
  }, [purchaseOrder.id]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      // Fetch supplier details
      const { data: supplierData, error: supplierError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', purchaseOrder.supplier_id)
        .single();

      if (supplierError) throw supplierError;
      setSupplier(supplierData);

      // Fetch PO items count
      const { count, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('*', { count: 'exact', head: true })
        .eq('purchase_order_id', purchaseOrder.id);

      if (itemsError) throw itemsError;
      setItemCount(count || 0);

      // Set initial values
      // Ship by date: use existing or calculate from order date + lead time - 4 days
      if (purchaseOrder.ship_by_date) {
        setShipByDate(purchaseOrder.ship_by_date);
      } else if (supplierData) {
        const orderDate = parseISO(purchaseOrder.order_date);
        const calculatedShipBy = calculateShipByDate(orderDate, supplierData.lead_time_days);
        setShipByDate(format(calculatedShipBy, 'yyyy-MM-dd'));
      }

      // Shipping carrier/method: use existing PO values or supplier defaults
      setShippingCarrier(
        purchaseOrder.requested_shipping_carrier || 
        supplierData?.default_shipping_carrier || 
        ''
      );
      setShippingMethod(
        purchaseOrder.requested_shipping_method || 
        supplierData?.default_shipping_method || 
        ''
      );

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load purchase order details',
        variant: 'destructive',
      });
    } finally {
      setFetchingData(false);
    }
  };

  const handleCarrierChange = (value: string) => {
    setShippingCarrier(value);
    // Reset method when carrier changes
    const methods = getShippingMethodsForCarrier(value);
    if (methods.length > 0) {
      setShippingMethod(methods[0].value);
    } else {
      setShippingMethod('');
    }
  };

  const handleSend = async () => {
    if (!supplier?.email) {
      toast({
        title: 'Cannot Send',
        description: 'Vendor does not have an email address configured',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Update PO with shipping details
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          ship_by_date: shipByDate,
          requested_shipping_carrier: shippingCarrier || null,
          requested_shipping_method: shippingMethod || null,
          status: 'sent',
        })
        .eq('id', purchaseOrder.id);

      if (updateError) throw updateError;

      // Send email via edge function
      const { data, error: emailError } = await supabase.functions.invoke('send-purchase-order-email', {
        body: {
          purchaseOrderId: purchaseOrder.id,
          shipByDate,
          shippingCarrier,
          shippingMethod,
        },
      });

      if (emailError) throw emailError;

      toast({
        title: 'Success',
        description: `Purchase order sent to ${supplier.name}`,
      });

      onSuccess();
    } catch (error) {
      console.error('Error sending PO:', error);
      toast({
        title: 'Error',
        description: 'Failed to send purchase order',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const availableMethods = getShippingMethodsForCarrier(shippingCarrier);

  if (fetchingData) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send to Vendor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vendor Info */}
          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="font-medium">{supplier?.name}</p>
            {supplier?.email ? (
              <p className="text-sm text-muted-foreground">{supplier.email}</p>
            ) : (
              <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No email address configured for this vendor
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* PO Summary */}
          <div className="rounded-lg border p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">PO Number:</span>
              <span className="font-medium">{purchaseOrder.purchase_order_number}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Order Date:</span>
              <span>{format(parseISO(purchaseOrder.order_date), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Items:</span>
              <span>{itemCount}</span>
            </div>
            <div className="flex justify-between text-sm mt-1 font-medium">
              <span>Total:</span>
              <FinancialGuard kind="supplier_price"><span>${purchaseOrder.total.toFixed(2)}</span></FinancialGuard>
            </div>
          </div>

          {/* Ship By Date */}
          <div className="space-y-2">
            <Label htmlFor="ship-by-date" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Ship By Date
            </Label>
            <Input
              id="ship-by-date"
              type="date"
              value={shipByDate}
              onChange={(e) => setShipByDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Calculated as {supplier?.lead_time_days || 14} days lead time minus 4 days for transit
            </p>
          </div>

          {/* Shipping Preferences */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Shipping Preference
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={shippingCarrier} onValueChange={handleCarrierChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Carrier" />
                </SelectTrigger>
                <SelectContent>
                  {SHIPPING_CARRIERS.map((carrier) => (
                    <SelectItem key={carrier.value} value={carrier.value}>
                      {carrier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select 
                value={shippingMethod} 
                onValueChange={setShippingMethod}
                disabled={!shippingCarrier}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  {availableMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={loading || !supplier?.email}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
