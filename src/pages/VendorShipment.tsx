import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Package, Truck, CheckCircle2, AlertTriangle, MapPin, Calendar, Hash } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface POItem {
  id: string;
  item_name: string;
  quantity: number;
  uom?: string;
  unit_cost: number;
  total_cost: number;
}

interface PurchaseOrderData {
  id: string;
  purchaseOrderNumber: string;
  orderDate: string;
  shipByDate: string | null;
  requestedCarrier: string | null;
  requestedMethod: string | null;
  status: string;
  notes: string | null;
  subtotal: number;
  total: number;
  vendorTrackingNumber: string | null;
  vendorTrackingCarrier: string | null;
  vendorShippedAt: string | null;
  vendorDeliveryStatus: string | null;
  isDropShip: boolean;
}

interface SupplierData {
  id: string;
  name: string;
}

const CARRIERS = [
  { value: 'fedex', label: 'FedEx' },
  { value: 'ups', label: 'UPS' },
  { value: 'usps', label: 'USPS' },
  { value: 'dhl', label: 'DHL' },
  { value: 'other', label: 'Other' },
];

export default function VendorShipment() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderData | null>(null);
  const [supplier, setSupplier] = useState<SupplierData | null>(null);
  const [items, setItems] = useState<POItem[]>([]);
  const [shipToAddress, setShipToAddress] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('WashGear');
  
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [shipDate, setShipDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (token) {
      fetchPurchaseOrder();
    }
  }, [token]);

  const fetchPurchaseOrder = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-po-by-shipment-token', {
        body: { token },
      });

      if (fetchError) throw fetchError;
      if (!data.success) throw new Error(data.error);

      setPurchaseOrder(data.purchaseOrder);
      setSupplier(data.supplier);
      setItems(data.items || []);
      setShipToAddress(data.shipToAddress);
      setCompanyName(data.companyName || 'WashGear');

      // Pre-fill carrier if requested
      if (data.purchaseOrder.requestedCarrier) {
        setCarrier(data.purchaseOrder.requestedCarrier.toLowerCase());
      }

      // Check if already shipped
      if (data.purchaseOrder.vendorTrackingNumber) {
        setSuccess(true);
        setTrackingNumber(data.purchaseOrder.vendorTrackingNumber);
        setCarrier(data.purchaseOrder.vendorTrackingCarrier || '');
      }
    } catch (err: any) {
      console.error('Error fetching PO:', err);
      setError(err.message || 'Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!trackingNumber.trim() || !carrier) {
      setError('Please enter a tracking number and select a carrier');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { data, error: submitError } = await supabase.functions.invoke('submit-vendor-shipment', {
        body: {
          token,
          trackingNumber: trackingNumber.trim(),
          carrier,
          shipDate,
          notes: notes.trim() || undefined,
        },
      });

      if (submitError) throw submitError;
      if (!data.success) throw new Error(data.error);

      setSuccess(true);
    } catch (err: any) {
      console.error('Error submitting shipment:', err);
      setError(err.message || 'Failed to submit tracking information');
    } finally {
      setSubmitting(false);
    }
  };

  const getCarrierLabel = (value: string) => {
    return CARRIERS.find(c => c.value === value)?.label || value.toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading purchase order...</p>
        </div>
      </div>
    );
  }

  if (error && !purchaseOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <CardTitle>Unable to Load Order</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              This link may have expired or the order may not exist. Please contact {companyName} for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-primary" />
            <CardTitle>Shipment Confirmed!</CardTitle>
            <CardDescription>
              Thank you for providing the tracking information for PO {purchaseOrder?.purchaseOrderNumber}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Tracking Details</span>
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">Carrier:</span>{' '}
                <span className="font-medium">{getCarrierLabel(carrier)}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Tracking #:</span>{' '}
                <span className="font-mono font-medium">{trackingNumber}</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              You can close this window. We'll monitor the shipment and update the customer automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-1">{companyName}</h1>
          <p className="text-muted-foreground">Vendor Shipment Portal</p>
        </div>

        {/* PO Summary Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  PO {purchaseOrder?.purchaseOrderNumber}
                </CardTitle>
                <CardDescription>
                  For {supplier?.name}
                </CardDescription>
              </div>
              <Badge variant={purchaseOrder?.status === 'sent' ? 'default' : 'secondary'}>
                {purchaseOrder?.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Order Date</p>
                  <p className="font-medium">
                    {purchaseOrder?.orderDate ? format(parseISO(purchaseOrder.orderDate), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Ship By</p>
                  <p className="font-medium">
                    {purchaseOrder?.shipByDate ? format(parseISO(purchaseOrder.shipByDate), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
              </div>
            </div>

            {purchaseOrder?.requestedCarrier && (
              <div className="bg-accent/50 rounded-lg p-3 text-sm">
                <p className="font-medium text-accent-foreground">
                  Requested Shipping: {getCarrierLabel(purchaseOrder.requestedCarrier)}
                  {purchaseOrder.requestedMethod && ` - ${purchaseOrder.requestedMethod}`}
                </p>
              </div>
            )}

            <Separator />

            {/* Ship-to Address */}
            {shipToAddress && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Ship To</span>
                  {purchaseOrder?.isDropShip && (
                    <Badge variant="outline" className="text-xs">Drop Ship</Badge>
                  )}
                </div>
                <pre className="text-sm bg-muted rounded-lg p-3 whitespace-pre-wrap font-sans">
                  {shipToAddress}
                </pre>
              </div>
            )}

            <Separator />

            {/* Items */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Order Items</span>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} {item.uom || 'ea'}
                      </p>
                    </div>
                    <p className="font-medium text-sm">${item.total_cost.toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 font-bold">
                <span>Total</span>
                <span>${purchaseOrder?.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tracking Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Add Tracking Information
            </CardTitle>
            <CardDescription>
              Enter the shipment tracking details once this order has shipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="carrier">Carrier *</Label>
                  <Select value={carrier} onValueChange={setCarrier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARRIERS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shipDate">Ship Date</Label>
                  <Input
                    id="shipDate"
                    type="date"
                    value={shipDate}
                    onChange={(e) => setShipDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trackingNumber">Tracking Number *</Label>
                <Input
                  id="trackingNumber"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Enter tracking number"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information about this shipment..."
                  rows={2}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm Shipment
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {companyName}. Questions? Contact us.
        </p>
      </div>
    </div>
  );
}
