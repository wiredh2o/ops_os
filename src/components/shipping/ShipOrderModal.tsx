import { calculateJurisdictionTax, getTaxModel, parseTaxLines, type TaxModel } from '@/lib/tax-utils';
import { TaxLines } from '@/components/production/TaxLines';
import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Package, CreditCard, Truck, AlertCircle, CheckCircle, Printer, Download, Pencil, ChevronDown, Boxes } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { AddressSelector } from './AddressSelector';
import { AddAddressForm } from './AddAddressForm';
import { EditAddressForm } from './EditAddressForm';
import { MultiCarrierRateComparison } from './MultiCarrierRateComparison';
import { PaymentSelector } from './PaymentSelector';
import { ManualCardEntry, PaymentCompletionDetails } from './ManualCardEntry';
import { PackingStepContent, type PackingConfig } from './PackingStepContent';
import { PaymentTermsBadge } from '@/components/payments/PaymentTermsBadge';
import { CustomerPhoneDialog } from './CustomerPhoneDialog';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { printThermalLabel, downloadLabel } from '@/lib/thermal-print-utils';
import { PrintInstructionsTooltip } from './PrintInstructionsTooltip';
import { ThirdPartyBillingFallbackDialog } from './ThirdPartyBillingFallbackDialog';
import { SerialAssignmentModal } from './SerialAssignmentModal';
import { carrierAllowedForDropShip, dropShipLabelRecipient, isDropShipSnapshot, type DropShipSnapshot } from '@/lib/drop-ship';
import { printPackingSlip } from '@/lib/packing-slip';

interface ShipOrderModalProps {
  order: {
    id: string;
    order_number: string;
    customer_name: string;
    total_amount?: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
  is_taxable?: boolean;
}

interface Customer {
  id: string;
  name: string;
  is_taxable?: boolean;
  email: string;
  phone: string;
  payment_terms: string;
  stripe_customer_id: string | null;
  shipping_addresses: ShippingAddress[];
  default_shipping_address_id: string | null;
  signature_required?: boolean;
  customer_number?: number;
  owners_name?: string | null;
  store_credit_balance?: number;
  preferred_shipping_carrier?: string;
  billing_address?: string | null;
  // Third-party shipping fields
  is_distributor?: boolean;
  use_third_party_shipping?: boolean;
  fedex_account_number?: string | null;
  ups_account_number?: string | null;
}

interface UnifiedRate {
  carrier: 'fedex' | 'ups' | 'usps';
  service_type: string;
  service_name: string;
  total_charge: number;
  currency: string;
  transit_days: number;
  pricing_type?: 'weight_based' | 'flat_rate';
  container_type?: string;
  isMock: boolean;
}

interface AutoSerialItem {
  id: string;
  sku: string;
  description: string;
  prefix: string;
  quantity: number;
  productionOrderItemId: string;
  assemblyId?: string;
  inventoryItemId?: string;
}

export function ShipOrderModal({ order, onClose, onSuccess }: ShipOrderModalProps) {
  const { toast } = useToast();
  const { data: companySettings } = useCompanySettings();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [taxModel, setTaxModel] = useState<TaxModel>({ jurisdictions: [], zips: [], assignments: [] });
  const [taxPending, setTaxPending] = useState(true);
  const [taxError, setTaxError] = useState('');
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [taxSnapshotReady, setTaxSnapshotReady] = useState(false);
  const [step, setStep] = useState<'address' | 'packing' | 'select_rate' | 'payment' | 'manual_entry' | 'creating_label' | 'print_label' | 'pickup_complete'>('address');
  const [isPickUpOrder, setIsPickUpOrder] = useState(false);
  const [resumedFromPersistence, setResumedFromPersistence] = useState(false);
  const [labelPath, setLabelPath] = useState<string | null>(null);
  const [labelBlobUrl, setLabelBlobUrl] = useState<string | null>(null);
  const [labelMimeType, setLabelMimeType] = useState<string | null>(null);
  const [labelLoadError, setLabelLoadError] = useState<string | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [pendingShipment, setPendingShipment] = useState(false);
  
  // Label creation states (now happens after payment)
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [labelCreated, setLabelCreated] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [createdTrackingNumber, setCreatedTrackingNumber] = useState<string | null>(null);
  const [showPaymentCharging, setShowPaymentCharging] = useState(false);
  
  // Selections
  const [selectedAddress, setSelectedAddress] = useState<ShippingAddress | null>(null);
  // Distributor drop-ship destination saved on the invoice (overrides the account's addresses)
  const [dropShip, setDropShip] = useState<DropShipSnapshot | null>(null);
  const [selectedRate, setSelectedRate] = useState<UnifiedRate | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [paymentMethodType, setPaymentMethodType] = useState<'card' | 'terms' | 'link' | 'manual_entry' | 'manual_entry_save' | 'invoice'>('card');
  const [paymentAmountOption, setPaymentAmountOption] = useState<'full' | 'remaining' | 'terms'>('full');
  const [saveCardForLink, setSaveCardForLink] = useState(true);
  const [manualPaymentIntentId, setManualPaymentIntentId] = useState<string | null>(null);

  // Third-party billing fallback dialog state
  const [thirdPartyFallbackOpen, setThirdPartyFallbackOpen] = useState(false);
  const [thirdPartyFallbackCarrier, setThirdPartyFallbackCarrier] = useState('');
  const [thirdPartyFallbackAccount, setThirdPartyFallbackAccount] = useState('');
  const [thirdPartyFallbackError, setThirdPartyFallbackError] = useState('');
  const [thirdPartyFallbackRetry, setThirdPartyFallbackRetry] = useState<(() => void) | null>(null);
  const [completedPayment, setCompletedPayment] = useState<PaymentCompletionDetails | null>(null);
  const [customerHasExistingCards, setCustomerHasExistingCards] = useState(false);
  
  // Shipping details for rate calculation
  const [packageWeight, setPackageWeight] = useState(1);
  const [packageDimensions, setPackageDimensions] = useState({ length: 6, width: 6, height: 6 });
  const [packingConfig, setPackingConfig] = useState<PackingConfig | null>(null);
  const [autoPackagingApplied, setAutoPackagingApplied] = useState(false);

  // Auto-serial (assemblies) flow
  const [autoSerialItems, setAutoSerialItems] = useState<AutoSerialItem[]>([]);
  const [autoSerialModalOpen, setAutoSerialModalOpen] = useState(false);
  const [autoSerialChecked, setAutoSerialChecked] = useState(false);

  useEffect(() => {
    loadOrderDetails();
  }, [order.id]);

  const maybePromptAutoSerialAssignment = async () => {
    try {
      const { data: poItems, error } = await supabase
        .from('production_order_items')
        .select(`
          id,
          quantity,
          assembly:assemblies(id, sku, sales_description, serial_tracking_type, serial_prefix),
          inventory_item:inventory_items(id, sku, sales_description, serial_tracking_type, serial_prefix)
        `)
        .eq('production_order_id', order.id);

      if (error) throw error;

      const candidates: AutoSerialItem[] = (poItems || [])
        .map((row: any) => {
          const a = row.assembly;
          const inv = row.inventory_item;
          const source = a || inv;
          if (!source) return null;
          if (source.serial_tracking_type !== 'auto_date') return null;
          if (!source.serial_prefix) return null;

          return {
            id: row.id,
            sku: source.sku,
            description: source.sales_description || source.sku,
            prefix: source.serial_prefix,
            quantity: row.quantity,
            productionOrderItemId: row.id,
            assemblyId: a?.id,
            inventoryItemId: inv?.id,
          } satisfies AutoSerialItem;
        })
        .filter(Boolean) as AutoSerialItem[];

      if (candidates.length === 0) return;

      // Prevent accidental double-generation: if any serial already exists for a line item, skip it.
      const { data: existing } = await supabase
        .from('order_item_serials')
        .select('production_order_item_id')
        .in('production_order_item_id', candidates.map((c) => c.productionOrderItemId))
        .limit(1000);

      const existingSet = new Set((existing || []).map((r: any) => r.production_order_item_id));
      const remaining = candidates.filter((c) => !existingSet.has(c.productionOrderItemId));

      if (remaining.length === 0) return;

      setAutoSerialItems(remaining);
      setAutoSerialModalOpen(true);
    } catch (e) {
      console.error('[ShipOrderModal] Auto-serial detection failed', e);
    }
  };

  // Download label directly from Supabase storage and create blob URL
  useEffect(() => {
    if (!labelPath) {
      setLabelBlobUrl(null);
      setLabelMimeType(null);
      setLabelLoadError(null);
      setLabelLoading(false);
      return;
    }

    let blobUrl: string | null = null;

    const downloadLabelFile = async () => {
      try {
        setLabelLoading(true);
        setLabelLoadError(null);
        
        let blob: Blob | null = null;
        
        // Try 1: Signed URL + fetch (more reliable, avoids some browser issues)
        try {
          const { data: signedUrlData, error: signedUrlError } = await supabase
            .storage
            .from('shipping-labels')
            .createSignedUrl(labelPath, 3600);
          
          if (!signedUrlError && signedUrlData?.signedUrl) {
            const response = await fetch(signedUrlData.signedUrl);
            if (response.ok) {
              blob = await response.blob();
              console.log('[ShipOrderModal] Label fetched via signed URL');
            }
          }
        } catch (e) {
          console.warn('[ShipOrderModal] Signed URL fetch failed, trying direct download', e);
        }
        
        // Try 2: Direct download as fallback
        if (!blob) {
          const { data, error } = await supabase
            .storage
            .from('shipping-labels')
            .download(labelPath);
          
          if (error) {
            console.error('[ShipOrderModal] Storage error details:', JSON.stringify(error));
            throw new Error(`Storage download failed: ${error.message || error.name || 'Unknown error'}`);
          }
          blob = data;
          console.log('[ShipOrderModal] Label fetched via direct download');
        }
        
        if (!blob) {
          throw new Error('Could not retrieve label data');
        }
        
        // Determine mime type from blob or filename
        let mimeType = blob.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
          mimeType = labelPath.toLowerCase().endsWith('.png') ? 'image/png' : 'application/pdf';
        }
        
        blobUrl = URL.createObjectURL(blob);
        
        setLabelBlobUrl(blobUrl);
        setLabelMimeType(mimeType);
        setLabelLoading(false);
        console.log('[ShipOrderModal] Label ready:', { labelPath, mimeType, blobUrl });
      } catch (error: any) {
        console.error('[ShipOrderModal] Failed to download label:', error);
        setLabelLoadError(error.message || 'Failed to load label. Please try again.');
        setLabelLoading(false);
      }
    };

    downloadLabelFile();

    // Cleanup: revoke blob URL when component unmounts or labelPath changes
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [labelPath]);

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch full order details with customer info and line items
      const { data: orderData, error: orderError } = await supabase
        .from('production_orders')
        .select(`
          *,
          company:companies(
            id,
            name,
            email,
            phone,
            payment_terms,
            stripe_customer_id,
            shipping_addresses,
            default_shipping_address_id,
            customer_number,
            is_taxable,
            owners_name,
            store_credit_balance,
            preferred_shipping_carrier,
            billing_address,
            is_distributor,
            use_third_party_shipping,
            fedex_account_number,
            ups_account_number
          ),
          items:production_order_items(
            id,
            item_name,
            item_sku,
            item_type,
            quantity,
            unit_price,
            total_price,
            is_taxable,
            tax_rate,
            tax_amount,
            sales_uom_description,
            inventory_item_id,
            assembly_id
          )
        `)
        .eq('id', order.id)
        .single();

      if (orderError) throw orderError;

      // For repair orders, fetch customer_po from inbound package if not on production order
      let effectiveCustomerPo = orderData.customer_po;
      if (!effectiveCustomerPo && orderData.order_type === 'repair') {
        const { data: poData } = await supabase
          .from('production_order_items')
          .select(`
            repair_items!inner(
              inbound_packages:package_id!inner(customer_po)
            )
          `)
          .eq('production_order_id', order.id)
          .not('repair_item_id', 'is', null)
          .limit(1)
          .maybeSingle();
        
        if (poData?.repair_items?.inbound_packages?.customer_po) {
          effectiveCustomerPo = poData.repair_items.inbound_packages.customer_po;
        }
      }

      setOrderDetails({ ...orderData, customer_po: effectiveCustomerPo });
      
      // Resolve customer - prefer direct join, fallback to inbound_package for repair orders
      let resolvedCompany = orderData.company;
      
      if (!resolvedCompany && orderData.inbound_package_id) {
        // Fallback: fetch customer via inbound package
        const { data: packageData } = await supabase
          .from('inbound_packages')
          .select(`
            company:companies(
              id,
              name,
              email,
              phone,
              payment_terms,
              stripe_customer_id,
              shipping_addresses,
              default_shipping_address_id,
              customer_number,
              is_taxable,
              owners_name,
              store_credit_balance,
              preferred_shipping_carrier,
              billing_address,
              is_distributor,
              use_third_party_shipping,
              fedex_account_number,
              ups_account_number
            )
          `)
          .eq('id', orderData.inbound_package_id)
          .single();
        
        if (packageData?.company) {
          resolvedCompany = packageData.company;
        }
      }
      
      if (resolvedCompany) {
        const shippingAddresses = typeof resolvedCompany.shipping_addresses === 'string' 
          ? JSON.parse(resolvedCompany.shipping_addresses) 
          : (resolvedCompany.shipping_addresses || []);
        
        // Set customer taxability status

        
        // Check if this is a Pick-Up customer
        const pickUp = resolvedCompany.preferred_shipping_carrier === 'Pick-Up';
        setIsPickUpOrder(pickUp);
        
        setCustomer({
          ...resolvedCompany,
          shipping_addresses: shippingAddresses,
        });
        
        // For Pick-Up orders, skip to payment step directly
        if (pickUp) {
          const terms = resolvedCompany.payment_terms || 'due_in_advance';
          const requiresPayment = terms === 'due_in_advance' || terms === 'fifty_fifty';
          if (requiresPayment) {
            setStep('payment');
          } else {
            setStep('pickup_complete');
          }
        }

        // Auto-select default address
        if (resolvedCompany.default_shipping_address_id && shippingAddresses.length > 0) {
          const defaultAddr = shippingAddresses.find(
            (addr: ShippingAddress) => addr.id === resolvedCompany.default_shipping_address_id
          );
          if (defaultAddr) {
            setSelectedAddress(defaultAddr);
          }
        } else if (shippingAddresses.length === 1) {
          setSelectedAddress(shippingAddresses[0]);
        }
      }

      if (isDropShipSnapshot(orderData.drop_ship_snapshot)) {
        setDropShip(orderData.drop_ship_snapshot);
        setSelectedAddress(orderData.drop_ship_snapshot as unknown as ShippingAddress);
      }

      // Prompt auto-serial assignment before shipping label creation
      if (!autoSerialChecked && !orderData.fedex_tracking_number && !orderData.fedex_label_url) {
        setAutoSerialChecked(true);
        await maybePromptAutoSerialAssignment();
      }

      // Check for existing shipping progress to resume (prevent duplicate labels/payments)
      if (orderData.fedex_tracking_number && orderData.fedex_label_url) {
        // Label already created - determine where to resume
        setLabelPath(orderData.fedex_label_url);
        setTrackingNumber(orderData.fedex_tracking_number);
        setLabelCreated(true);
        setCreatedTrackingNumber(orderData.fedex_tracking_number);
        setResumedFromPersistence(true);
        
        if (orderData.payment_status === 'paid' || orderData.payment_status === 'invoiced') {
          // Payment complete - go straight to print
          setStep('print_label');
        } else {
          // Label created but payment pending - check if payment is needed
          const terms = resolvedCompany?.payment_terms || 'due_in_advance';
          const requiresPayment = terms === 'due_in_advance' || terms === 'fifty_fifty';
          if (requiresPayment) {
            setStep('payment');
          } else {
            // Net terms - no payment needed, go to print
            setStep('print_label');
          }
        }
      }
    } catch (error: any) {
      console.error('Error loading order details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Set payment amount option based on customer payment terms
  useEffect(() => {
    if (customer) {
      const terms = customer.payment_terms || 'due_in_advance';
      if (terms === 'net_15' || terms === 'net_30') {
        setPaymentAmountOption('terms');
        setPaymentMethodType('terms');
      } else if (terms === 'fifty_fifty' && orderDetails?.deposit_paid) {
        setPaymentAmountOption('remaining');
      } else {
        setPaymentAmountOption('full');
      }
    }
  }, [customer, orderDetails?.deposit_paid]);

  const requiresPaymentBeforeShipping = () => {
    if (!customer) return true;
    const terms = customer.payment_terms || 'due_in_advance';
    return terms === 'due_in_advance' || terms === 'fifty_fifty';
  };

  // Get subtotal of all line items (before tax)
  const getItemsSubtotal = () => {
    if (!orderDetails?.items) return orderDetails?.total_amount || order.total_amount || 0;
    return orderDetails.items.reduce(
      (sum: number, item: any) => sum + (item.total_price || 0), 
      0
    );
  };

  const taxLocked = !!(orderDetails?.payment_received_at || orderDetails?.label_created_at || orderDetails?.picked_up_at);
  const liveTax = calculateJurisdictionTax(taxModel, {
    customerIsTaxable: customer?.is_taxable === true, distributor: customer?.is_distributor,
    destination: selectedAddress, shipping: selectedRate?.total_charge || 0, shipments: isPickUpOrder ? 0 : 1,
    items: (orderDetails?.items || []).map((i: any) => ({ amount: i.total_price || 0, item_type: i.item_type, is_taxable: i.is_taxable === true })),
  });
  // Stored snapshot is authoritative once saved; the live quote is only a preview while it saves.
  const useStored = taxLocked || taxSnapshotReady;
  const taxLines = useStored ? parseTaxLines(orderDetails?.tax_lines) : liveTax.taxLines;
  const taxReview = useStored ? !!orderDetails?.tax_review_required : liveTax.reviewRequired;
  const getTotalTax = () => useStored ? Number(orderDetails?.tax_amount) || 0 : liveTax.taxAmount;
  useEffect(() => {
    if (!customer || !selectedAddress || taxLocked) { if (taxLocked) setTaxPending(false); return; }
    let cancelled = false; setTaxPending(true); setTaxError(''); setTaxSnapshotReady(false);
    (async () => {
      const model = await getTaxModel(selectedAddress.state, selectedAddress.zip);
      const { error } = await supabase.from('production_orders').update({ tax_destination: (dropShip ? { ...selectedAddress, email: undefined, phone: undefined } : selectedAddress) as any, shipping_cost: selectedRate?.total_charge || 0 }).eq('id', order.id);
      if (error) throw error;
      // Read back the server-calculated snapshot so displayed and charged tax match what is stored.
      const { data: snap, error: snapErr } = await supabase.from('production_orders')
        .select('tax_lines, tax_amount, tax_review_required').eq('id', order.id).single();
      if (snapErr) throw snapErr;
      if (!cancelled) { setTaxModel(model); setOrderDetails((prev: any) => prev ? { ...prev, ...snap } : prev); setTaxSnapshotReady(true); }
    })().catch(e => { if (!cancelled) setTaxError(e.message); }).finally(() => { if (!cancelled) setTaxPending(false); });
    return () => { cancelled = true; };
  }, [customer?.id, selectedAddress, selectedRate?.total_charge, taxLocked]);

  const getOrderSubtotal = () => {
    return getItemsSubtotal() + getTotalTax();
  };

  const getShippingCost = () => {
    return selectedRate?.total_charge || 0;
  };

  // Get available store credit
  const getAvailableCredit = () => {
    return customer?.store_credit_balance || 0;
  };

  // Calculate how much credit to apply (can't exceed order total)
  const getCreditToApply = () => {
    const grossTotal = getOrderSubtotal() + getShippingCost();
    return Math.min(getAvailableCredit(), grossTotal);
  };

  // Calculate remaining credit after this order
  const getRemainingCredit = () => {
    return getAvailableCredit() - getCreditToApply();
  };

  const getAmountDue = () => {
    if (!orderDetails || !customer) return (order.total_amount || 0) + getShippingCost();
    
    const orderSubtotal = getOrderSubtotal();
    const shippingCost = getShippingCost();
    const totalWithShipping = orderSubtotal + shippingCost;
    
    // Apply store credit first
    const creditToApply = getCreditToApply();
    const afterCredit = totalWithShipping - creditToApply;
    
    // Use the selected payment amount option
    switch (paymentAmountOption) {
      case 'terms':
        return 0; // Bill on terms
      case 'remaining':
        // For fifty_fifty with deposit paid, charge remaining 50% + shipping minus credit
        if (orderDetails.deposit_paid) {
          return Math.max(0, (orderSubtotal * 0.5) + shippingCost - creditToApply);
        }
        return Math.max(0, afterCredit - (orderDetails.deposit_amount || 0));
      case 'full':
      default:
        return Math.max(0, afterCredit);
    }
  };

  const handleAddressSelected = (address: ShippingAddress) => {
    setSelectedAddress(address);
    setStep('packing');
  };

  // Map production_order_items to the OrderItem shape PackingStepContent expects
  const packingOrderItems = React.useMemo(() => {
    if (!orderDetails?.items) return [];
    return orderDetails.items
      .filter((item: any) => item.item_type !== 'labor')
      .map((item: any) => ({
        id: item.id,
        item_type: item.item_type as 'inventory_item' | 'assembly',
        inventory_item_id: item.inventory_item_id || undefined,
        assembly_id: item.assembly_id || undefined,
        item_name: item.item_name,
        item_sku: item.item_sku || '',
        quantity_ordered: item.quantity,
        unit_price: item.unit_price || 0,
      }));
  }, [orderDetails?.items]);

  // Price-free packing slip for the person packing the box
  const handlePrintPackingSlip = () => {
    if (!orderDetails) return;
    const shipTo = dropShip
      ? { name: dropShip.recipient_name, address: dropShip.address, city: dropShip.city, state: dropShip.state, zip: dropShip.zip }
      : selectedAddress
        ? { name: customer?.owners_name || customer?.name || order.customer_name, address: selectedAddress.address, city: selectedAddress.city, state: selectedAddress.state, zip: selectedAddress.zip }
        : { name: customer?.name || order.customer_name };
    printPackingSlip({
      orderNumber: orderDetails.order_number || order.order_number,
      customerPo: orderDetails.customer_po,
      companyName: customer?.name || order.customer_name,
      orderDate: orderDetails.created_at
        ? new Date(orderDetails.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
        : null,
      shipTo,
      isDropShip: !!dropShip,
      items: (orderDetails.items || [])
        .filter((item: any) => item.item_type !== 'labor')
        .map((item: any) => ({
          sku: item.item_sku || item.item_name,
          description: item.item_name,
          quantity: item.quantity,
        })),
      notes: orderDetails.notes,
    });
  };

  const handlePackingComplete = (config: PackingConfig) => {
    setPackingConfig(config);
    // Extract dimensions and weight from the packing result
    if (config.packages && config.packages.length > 0) {
      const pkg = config.packages[0];
      if (pkg.box) {
        setPackageDimensions({
          length: Math.ceil(pkg.box.dimension_l),
          width: Math.ceil(pkg.box.dimension_w),
          height: Math.ceil(pkg.box.dimension_h),
        });
      }
      const totalWeightLbs = (pkg.totalPackageWeightOz || 0) / 16;
      setPackageWeight(Math.max(1, Math.round(totalWeightLbs * 10) / 10));
      setAutoPackagingApplied(true);
    }
  };

  // Called when a rate is selected via MultiCarrierRateComparison (new flow: no label created yet)
  const handleRateSelected = (rate: UnifiedRate) => {
    setSelectedRate(rate);
    
    // Determine next step
    if (requiresPaymentBeforeShipping() && getAmountDue() > 0) {
      setShowPaymentCharging(false);
      setPaymentComplete(false);
      setPaymentError(null);
      setStep('payment');
    } else {
      // Net terms or zero balance - skip payment, go straight to label creation
      setStep('creating_label');
    }
  };

  // Create shipping label (called after payment succeeds or for net terms)
  const createShippingLabel = async () => {
    if (!selectedRate || !selectedAddress || !customer) return;
    if (!carrierAllowedForDropShip(selectedRate.carrier, dropShip)) {
      setLabelError('USPS cannot be used until this drop-ship address is flagged USPS eligible.');
      return;
    }
    
    setIsCreatingLabel(true);
    setLabelError(null);
    
    try {
      const getLabelFunctionName = (carrier: string) => {
        switch (carrier) {
          case 'ups': return 'create-ups-shipment';
          case 'usps': return 'create-usps-label';
          default: return 'create-fedex-shipment';
        }
      };

      const labelBody: any = {
        ship_from: {
          name: companySettings?.shipFromAddress?.contactName || '',
          company: companySettings?.shipFromAddress?.companyName || 'Your Company',
          street: companySettings?.shipFromAddress?.street1 || '123 Main St',
          street2: companySettings?.shipFromAddress?.street2,
          city: companySettings?.shipFromAddress?.city || 'Denver',
          state: companySettings?.shipFromAddress?.state || 'CO',
          postal_code: companySettings?.shipFromAddress?.zip || '80202',
          country: 'US',
          phone: companySettings?.shipFromAddress?.phone || '3035551234',
        },
        ship_to: {
          // Drop-ship labels show only the car wash name as the recipient
          ...(dropShip ? dropShipLabelRecipient(dropShip, customer.phone) : { name: customer.owners_name || '', company: customer.name || order.customer_name, phone: customer.phone }),
          street: selectedAddress.address,
          city: selectedAddress.city,
          state: selectedAddress.state,
          postal_code: selectedAddress.zip,
          country: selectedAddress.country || 'US',
          residential: false,
        },
        packages: [{ weight_lbs: packageWeight, dimensions: packageDimensions }],
        service_type: selectedRate.service_type,
        order_id: order.id,
        label_format: 'PNG',
      };

      // Add container type for USPS flat rate
      if (selectedRate.carrier === 'usps' && selectedRate.container_type) {
        labelBody.container_type = selectedRate.container_type;
      }

      // Add third-party billing info if applicable
      if (customer.is_distributor && customer.use_third_party_shipping) {
        if (selectedRate.carrier === 'fedex' && customer.fedex_account_number) {
          labelBody.third_party_billing = true;
          labelBody.third_party_fedex_account = customer.fedex_account_number;
          const billingZip = customer.billing_address
            ? customer.billing_address.split(', ').pop()?.trim() || ''
            : '';
          labelBody.third_party_fedex_zip = billingZip;
        } else if (selectedRate.carrier === 'ups' && customer.ups_account_number) {
          labelBody.third_party_billing = true;
          labelBody.third_party_ups_account = customer.ups_account_number;
          const billingZip = customer.billing_address
            ? customer.billing_address.split(', ').pop()?.trim() || ''
            : '';
          labelBody.third_party_ups_zip = billingZip;
        }
      }

      const { data: shipmentData, error: shipmentError } = await supabase.functions.invoke(
        getLabelFunctionName(selectedRate.carrier),
        { body: labelBody }
      );

      // Check for third-party billing error
      if (shipmentData?.isThirdPartyError) {
        const accountNumber = selectedRate.carrier === 'fedex'
          ? customer.fedex_account_number
          : customer.ups_account_number;
        
        setThirdPartyFallbackCarrier(selectedRate.carrier.toUpperCase());
        setThirdPartyFallbackAccount(accountNumber || 'Unknown');
        setThirdPartyFallbackError(shipmentData.details || shipmentData.error || 'Third-party billing failed');
        setThirdPartyFallbackRetry(() => () => createShippingLabel());
        setThirdPartyFallbackOpen(true);
        setIsCreatingLabel(false);
        return;
      }

      if (shipmentError || !shipmentData?.tracking_number) {
        throw new Error(shipmentError?.message || shipmentData?.error || 'Failed to create shipping label');
      }

      // Update order with tracking info and status
      const nowIso = new Date().toISOString();
      const creditApplied = getCreditToApply();
      const updateData: any = {
        status: 'awaiting_pickup',
        sold_at: nowIso,
        label_created_at: nowIso,
        shipping_cost: selectedRate.total_charge,
        fedex_tracking_number: shipmentData.tracking_number,
        fedex_label_url: shipmentData.label_path,
        carrier: selectedRate.carrier,
        is_mock_shipment: shipmentData.isMock || selectedRate.isMock,
      };

      // Set payment status
      if (paymentComplete || paymentMethodType === 'terms' || paymentMethodType === 'invoice') {
        updateData.payment_status = paymentMethodType === 'terms' || paymentMethodType === 'invoice' ? 'invoiced' : 'paid';
        if (updateData.payment_status === 'paid') {
          updateData.payment_received_at = nowIso;
        }
      }

      await supabase
        .from('production_orders')
        .update(updateData)
        .eq('id', order.id);

      // Deduct store credit if applicable
      if (creditApplied > 0 && customer.id) {
        await supabase
          .from('companies')
          .update({ store_credit_balance: getRemainingCredit() })
          .eq('id', customer.id);
          
        await supabase
          .from('production_orders')
          .update({ credit_applied: creditApplied })
          .eq('id', order.id);
      }

      // Update repair items if this is a repair order
      if (orderDetails?.order_type === 'repair' && shipmentData.tracking_number) {
        const { data: orderItems } = await supabase
          .from('production_order_items')
          .select('repair_item_id')
          .eq('production_order_id', order.id)
          .not('repair_item_id', 'is', null);

        const repairItemIds = orderItems?.map(item => item.repair_item_id).filter(Boolean) || [];
        
        if (repairItemIds.length > 0) {
          await supabase
            .from('repair_items')
            .update({ status: 'label_created' })
            .in('id', repairItemIds);
        }
      }

      // Set label data and transition to print
      setLabelPath(shipmentData.label_path);
      setTrackingNumber(shipmentData.tracking_number);
      setCreatedTrackingNumber(shipmentData.tracking_number);
      setLabelCreated(true);
      setStep('print_label');
    } catch (error: any) {
      console.error('Error creating shipping label:', error);
      setLabelError(error.message || 'Failed to create shipping label');
    } finally {
      setIsCreatingLabel(false);
    }
  };

  const handlePaymentSelected = (
    methodId: string | null, 
    type: 'card' | 'terms' | 'link' | 'manual_entry' | 'manual_entry_save' | 'invoice', 
    amountOption: 'full' | 'remaining' | 'terms',
    saveCard?: boolean,
    hasExistingCards?: boolean
  ) => {
    if (taxPending || taxError || taxReview) { toast({ title: 'Tax review required', description: taxError || 'Admin or Accounting must complete destination tax settings.', variant: 'destructive' }); return; }
    setSelectedPaymentMethod(methodId);
    setPaymentMethodType(type);
    setPaymentAmountOption(amountOption);
    if (saveCard !== undefined) {
      setSaveCardForLink(saveCard);
    }
    if (hasExistingCards !== undefined) {
      setCustomerHasExistingCards(hasExistingCards);
    }
    
    if (type === 'manual_entry' || type === 'manual_entry_save') {
      setStep('manual_entry');
    } else {
      // Show payment charging UI instead of immediately processing
      setShowPaymentCharging(true);
    }
  };

  const handleManualPaymentSuccess = (details: PaymentCompletionDetails) => {
    setManualPaymentIntentId(details.paymentIntentId);
    setCompletedPayment(details);
    // Manual entry already collected payment, go to next step
    setPaymentComplete(true);
    // For pick-up orders, go to pickup_complete; otherwise create label
    setStep(isPickUpOrder ? 'pickup_complete' : 'creating_label');
  };

  // Create shipment/label only (no payment)

  // Charge payment only (after label created)
  const handleChargePayment = async () => {
    if (!customer) return;
    if (taxPending || taxError || taxReview) { setPaymentError(taxError || 'Tax jurisdiction review is required before payment.'); return; }
    
    setIsProcessingPayment(true);
    setPaymentError(null);
    
    try {
      const amountDue = getAmountDue();
      const creditApplied = getCreditToApply();

      // Handle invoice/net terms - no actual charge
      if (paymentMethodType === 'invoice' || paymentMethodType === 'terms') {
        await supabase
          .from('production_orders')
          .update({ payment_status: 'invoiced' })
          .eq('id', order.id);
      } else if (paymentMethodType === 'card' && selectedPaymentMethod && amountDue > 0) {
        // Charge saved card
        const { data: chargeData, error: chargeError } = await supabase.functions.invoke('charge-saved-card', {
          body: {
            stripe_customer_id: customer.stripe_customer_id,
            payment_method_id: selectedPaymentMethod,
            amount: Math.round(amountDue * 100),
            order_id: order.id,
            description: `Order ${order.order_number}`,
          },
        });

        if (chargeError || !chargeData?.success) {
          throw new Error(chargeError?.message || chargeData?.error || 'Payment failed');
        }

        // Note: charge-saved-card already updates payment_status, payment_received_at, and stripe_payment_intent_id
        // No redundant update needed here
      } else if (paymentMethodType === 'link') {
        // Send payment link
        await supabase.functions.invoke('send-payment-link', {
          body: {
            order_id: order.id,
            order_number: order.order_number,
            customer_email: customer?.email,
            customer_phone: customer?.phone,
            customer_name: customer?.name,
            amount: amountDue,
          },
        });
        
        await supabase
          .from('production_orders')
          .update({ payment_status: 'pending' })
          .eq('id', order.id);
      }

      // Deduct store credit if applicable
      if (creditApplied > 0) {
        await supabase
          .from('companies')
          .update({ store_credit_balance: getRemainingCredit() })
          .eq('id', customer.id);
          
        await supabase
          .from('production_orders')
          .update({ credit_applied: creditApplied })
          .eq('id', order.id);
      }

      setPaymentComplete(true);
      // Don't auto-advance - user must click to continue
    } catch (error: any) {
      console.error('Error processing payment:', error);
      setPaymentError(error.message || 'Payment processing failed');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Skip payment and proceed to next step
  const handleSkipPayment = async () => {
    await supabase
      .from('production_orders')
      .update({ payment_status: 'pending', notes: 'Payment skipped during shipping - collect later' })
      .eq('id', order.id);
    // For pick-up orders, go to pickup_complete; otherwise create label
    setStep(isPickUpOrder ? 'pickup_complete' : 'creating_label');
  };

  const handleSetDefaultAddress = async (addressId: string) => {
    if (!customer) return;
    
    try {
      const { error } = await supabase
        .from('companies')
        .update({ default_shipping_address_id: addressId })
        .eq('id', customer.id);

      if (error) throw error;

      setCustomer({
        ...customer,
        default_shipping_address_id: addressId,
      });

      toast({
        title: 'Default Updated',
        description: 'Default shipping address has been updated',
      });
    } catch (error: any) {
      console.error('Error setting default address:', error);
      toast({
        title: 'Error',
        description: 'Failed to update default address',
        variant: 'destructive',
      });
    }
  };

  const handleAddAddress = async (
    addressData: Omit<ShippingAddress, 'id'>,
    setAsDefault: boolean
  ) => {
    if (!customer) return;

    const newAddress: ShippingAddress = {
      ...addressData,
      id: crypto.randomUUID(),
    };

    const updatedAddresses = [...customer.shipping_addresses, newAddress];

    try {
      const updateData: any = {
        shipping_addresses: updatedAddresses,
      };

      if (setAsDefault) {
        updateData.default_shipping_address_id = newAddress.id;
      }

      const { error } = await supabase
        .from('companies')
        .update(updateData)
        .eq('id', customer.id);

      if (error) throw error;

      setCustomer({
        ...customer,
        shipping_addresses: updatedAddresses,
        default_shipping_address_id: setAsDefault ? newAddress.id : customer.default_shipping_address_id,
      });

      // Auto-select the new address for this shipment
      setSelectedAddress(newAddress);
      setShowAddAddressForm(false);

      toast({
        title: 'Address Added',
        description: setAsDefault 
          ? 'Address saved and set as default' 
          : 'Shipping address has been added',
      });
    } catch (error: any) {
      console.error('Error adding address:', error);
      toast({
        title: 'Error',
        description: 'Failed to add shipping address',
        variant: 'destructive',
      });
    }
  };

  const handleEditAddress = async (
    updatedAddress: ShippingAddress,
    setAsDefault: boolean
  ) => {
    if (!customer) return;

    const updatedAddresses = customer.shipping_addresses.map(addr =>
      addr.id === updatedAddress.id ? updatedAddress : addr
    );

    try {
      const updateData: any = {
        shipping_addresses: updatedAddresses,
      };

      if (setAsDefault) {
        updateData.default_shipping_address_id = updatedAddress.id;
      }

      const { error } = await supabase
        .from('companies')
        .update(updateData)
        .eq('id', customer.id);

      if (error) throw error;

      setCustomer({
        ...customer,
        shipping_addresses: updatedAddresses,
        default_shipping_address_id: setAsDefault ? updatedAddress.id : customer.default_shipping_address_id,
      });

      // Update selected address if it was the one being edited
      if (selectedAddress?.id === updatedAddress.id) {
        setSelectedAddress(updatedAddress);
      }

      setEditingAddress(null);

      toast({
        title: 'Address Updated',
        description: 'Shipping address has been updated',
      });
    } catch (error: any) {
      console.error('Error updating address:', error);
      toast({
        title: 'Error',
        description: 'Failed to update shipping address',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!customer) return;

    const updatedAddresses = customer.shipping_addresses.filter(
      addr => addr.id !== addressId
    );

    try {
      const updateData: any = {
        shipping_addresses: updatedAddresses,
      };

      // Clear default if deleted address was default
      if (customer.default_shipping_address_id === addressId) {
        updateData.default_shipping_address_id = updatedAddresses[0]?.id || null;
      }

      const { error } = await supabase
        .from('companies')
        .update(updateData)
        .eq('id', customer.id);

      if (error) throw error;

      setCustomer({
        ...customer,
        shipping_addresses: updatedAddresses,
        default_shipping_address_id: updateData.default_shipping_address_id ?? customer.default_shipping_address_id,
      });

      // Clear selection if deleted address was selected
      if (selectedAddress?.id === addressId) {
        setSelectedAddress(updatedAddresses[0] || null);
      }

      setEditingAddress(null);

      toast({
        title: 'Address Deleted',
        description: 'Shipping address has been removed',
      });
    } catch (error: any) {
      console.error('Error deleting address:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete shipping address',
        variant: 'destructive',
      });
    }
  };

  // Handler for when customer phone is saved
  const handlePhoneSaved = (phone: string) => {
    setCustomer(prev => prev ? { ...prev, phone } : null);
    setShowPhoneDialog(false);
  };

  // Auto-trigger label creation when entering 'creating_label' step
  useEffect(() => {
    if (step === 'creating_label' && !isCreatingLabel && !labelCreated) {
      createShippingLabel();
    }
  }, [step]);

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Ship Order {order.order_number}
          </DialogTitle>
        </DialogHeader>

        {/* Order Summary */}
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{order.customer_name}</p>
                {orderDetails?.customer_po && (
                  <p className="text-sm text-muted-foreground">PO# {orderDetails.customer_po}</p>
                )}
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                  {customer?.phone && (
                    isMobile ? (
                      <a href={`tel:${customer.phone}`} className="hover:underline text-primary">
                        {customer.phone}
                      </a>
                    ) : (
                      <span>{customer.phone}</span>
                    )
                  )}
                  {customer?.email && (
                    <a href={`mailto:${customer.email}`} className="hover:underline text-primary">
                      {customer.email}
                    </a>
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors group w-full">
                      <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:-rotate-90" />
                      <span>Items & Labor</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-1 space-y-1 pl-4 border-l-2 border-muted">
                        {orderDetails?.items?.map((item: any, idx: number) => (
                          <div key={item.id || idx}>
                            <div className="flex justify-between gap-2 items-start">
                              <div className="flex-1 min-w-0">
                                <span className="text-foreground text-xs font-medium truncate block">
                                  {item.item_name}
                                  {item.item_type === 'labor' && (
                                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 leading-4">Labor</Badge>
                                  )}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  {item.item_sku && <span>SKU: {item.item_sku}</span>}
                                  {item.item_sku && item.sales_uom_description && <span>·</span>}
                                  {item.sales_uom_description && <span>{item.sales_uom_description}</span>}
                                </div>
                              </div>
                              <div className="text-right text-xs whitespace-nowrap shrink-0">
                                <span className="text-muted-foreground">{item.quantity} × <FinancialGuard kind="revenue">{formatCurrency(item.unit_price || 0)}</FinancialGuard></span>
                                <span className="ml-2 text-foreground font-medium"><FinancialGuard kind="revenue">{formatCurrency(item.total_price || 0)}</FinancialGuard></span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="flex justify-between gap-4 pt-1">
                    <span>Subtotal:</span>
                    <span><FinancialGuard kind="revenue">{formatCurrency(getItemsSubtotal())}</FinancialGuard></span>
                  </div>
                  <TaxLines lines={taxLines} legacyAmount={getTotalTax()} reviewRequired={taxReview || !!taxError}/>
                  {selectedRate && (
                    <div className="flex justify-between gap-4">
                      <span>Shipping:</span>
                      <span><FinancialGuard kind="revenue">{formatCurrency(getShippingCost())}</FinancialGuard></span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 font-medium text-foreground pt-1">
                    <span>Gross Total:</span>
                    <span className="relative">
                      <FinancialGuard kind="revenue">{formatCurrency(getOrderSubtotal() + getShippingCost())}</FinancialGuard>
                      {!selectedRate && (
                        <span className="absolute left-full top-0 ml-1 text-muted-foreground font-normal whitespace-nowrap">
                          (Plus shipping)
                        </span>
                      )}
                    </span>
                  </div>
                  {getCreditToApply() > 0 && (
                    <div className="flex justify-between gap-4 text-green-600 dark:text-green-400">
                      <span>Store Credit Applied:</span>
                      <span>-<FinancialGuard kind="revenue">{formatCurrency(getCreditToApply())}</FinancialGuard></span>
                    </div>
                  )}
                  {getCreditToApply() > 0 && (
                    <div className="flex justify-between gap-4 font-medium text-foreground">
                      <span>Amount Due:</span>
                      <span><FinancialGuard kind="revenue">{formatCurrency(getAmountDue())}</FinancialGuard></span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <PaymentTermsBadge terms={customer?.payment_terms} />
                {customer?.payment_terms === 'fifty_fifty' && orderDetails?.deposit_paid && (
                  <Badge variant="outline" className="ml-2">50% Deposit Paid</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumed from persistence banner */}
        {resumedFromPersistence && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Continuing from where you left off. A shipping label has already been created for this order.
            </p>
          </div>
        )}

        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
          {isPickUpOrder ? (
            // Pick-Up order: simplified workflow
            <>
              {requiresPaymentBeforeShipping() && (
                <>
                  <Badge variant={step === 'payment' || step === 'manual_entry' ? 'default' : 'outline'}>1. Payment</Badge>
                  <span className="text-muted-foreground">→</span>
                </>
              )}
              <Badge variant={step === 'pickup_complete' ? 'default' : 'outline'}>
                {requiresPaymentBeforeShipping() ? '2. Complete' : '1. Complete'}
              </Badge>
            </>
          ) : (
            // Standard shipping workflow
            <>
              <Badge variant={step === 'address' ? 'default' : 'outline'}>1. Address</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={step === 'packing' ? 'default' : 'outline'}>2. Packing</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={step === 'select_rate' ? 'default' : 'outline'}>3. Select Rate</Badge>
              <span className="text-muted-foreground">→</span>
              {requiresPaymentBeforeShipping() && (
                <>
                  <Badge variant={step === 'payment' || step === 'manual_entry' ? 'default' : 'outline'}>4. Payment</Badge>
                  <span className="text-muted-foreground">→</span>
                </>
              )}
              <Badge variant={step === 'print_label' ? 'default' : 'outline'}>
                {requiresPaymentBeforeShipping() ? '5. Print Label' : '4. Print Label'}
              </Badge>
            </>
          )}
        </div>

        <Separator />

        {/* Step Content */}
        <div className="min-h-[300px]">
          {step === 'address' && customer && dropShip && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">Drop-ship address <Badge variant="outline">Owned by {customer.name}</Badge></CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-sm text-muted-foreground">Label recipient</p>
                <p className="font-medium">{dropShip.recipient_name}</p>
                <p className="text-sm">{dropShip.address}</p>
                <p className="text-sm">{dropShip.city}, {dropShip.state} {dropShip.zip}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant={dropShip.usps_eligible ? 'secondary' : 'outline'}>{dropShip.usps_eligible ? 'USPS eligible' : 'USPS not allowed'}</Badge>
                  {(dropShip.email || dropShip.phone) && <Badge variant="outline">Shipment notice: {[dropShip.email, dropShip.phone].filter(Boolean).join(' · ')}</Badge>}
                </div>
                <div className="flex justify-end pt-3"><Button onClick={() => handleAddressSelected(dropShip as unknown as ShippingAddress)}>Continue</Button></div>
              </CardContent>
            </Card>
          )}
          {step === 'address' && customer && !dropShip && (
            editingAddress ? (
              <EditAddressForm
                address={editingAddress}
                isDefault={editingAddress.id === customer.default_shipping_address_id}
                canDelete={customer.shipping_addresses.length > 1}
                onSave={handleEditAddress}
                onDelete={handleDeleteAddress}
                onCancel={() => setEditingAddress(null)}
              />
            ) : showAddAddressForm ? (
              <AddAddressForm
                onSave={handleAddAddress}
                onCancel={() => setShowAddAddressForm(false)}
                defaultSignatureRequired={customer.signature_required}
              />
            ) : (
              <AddressSelector
                addresses={customer.shipping_addresses}
                selectedAddress={selectedAddress}
                defaultAddressId={customer.default_shipping_address_id}
                companyName={customer.name}
                onSelect={handleAddressSelected}
                onSetDefault={handleSetDefaultAddress}
                onAddAddress={() => setShowAddAddressForm(true)}
                onEditAddress={(address) => setEditingAddress(address)}
              />
            )
          )}

          {step === 'packing' && packingOrderItems.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Boxes className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Packing Recommendation</h3>
              </div>
              <PackingStepContent
                orderItems={packingOrderItems}
                onPackingComplete={handlePackingComplete}
                initialPackingConfig={packingConfig}
              />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep('address')}>
                  Back
                </Button>
                <Button variant="outline" onClick={handlePrintPackingSlip}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Packing Slip
                </Button>
                <Button
                  className="flex-1"
                  disabled={!packingConfig}
                  onClick={() => setStep('select_rate')}
                >
                  Continue to Rates
                </Button>
              </div>
            </div>
          )}

          {step === 'select_rate' && selectedAddress && customer && (
            <MultiCarrierRateComparison
              shipTo={selectedAddress}
              packageWeight={packageWeight}
              packageDimensions={packageDimensions}
              onWeightChange={setPackageWeight}
              onDimensionsChange={setPackageDimensions}
              onRateSelected={handleRateSelected}
              onBack={() => setStep('packing')}
              autoPackaging={autoPackagingApplied}
              shipFrom={{
                name: companySettings?.shipFromAddress?.contactName,
                company: companySettings?.shipFromAddress?.companyName || 'Your Company',
                street: companySettings?.shipFromAddress?.street1 || '123 Main St',
                street2: companySettings?.shipFromAddress?.street2,
                city: companySettings?.shipFromAddress?.city || 'Denver',
                state: companySettings?.shipFromAddress?.state || 'CO',
                postal_code: companySettings?.shipFromAddress?.zip || '80202',
                country: 'US',
                phone: companySettings?.shipFromAddress?.phone || '3035551234',
              }}
              shipToDetails={dropShip ? dropShipLabelRecipient(dropShip, customer?.phone) : {
                name: customer?.owners_name || undefined,
                company: customer?.name || order.customer_name,
                phone: customer?.phone,
              }}
              excludedCarriers={carrierAllowedForDropShip('usps', dropShip) ? [] : ['usps']}
              orderId={order.id}
            />
          )}

          {step === 'payment' && customer && (
            !showPaymentCharging ? (
              <PaymentSelector
                customer={customer}
                amountDue={getAmountDue()}
                orderSubtotal={getOrderSubtotal()}
                shippingCost={getShippingCost()}
                depositPaid={orderDetails?.deposit_paid || false}
                depositAmount={orderDetails?.deposit_amount || 0}
                onSelect={handlePaymentSelected}
                onBack={() => setStep('select_rate')}
                onCustomerUpdated={(stripeCustomerId) => {
                  setCustomer({ ...customer, stripe_customer_id: stripeCustomerId });
                }}
              />
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Process Payment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-medium text-muted-foreground">Payment Method</p>
                        <p>{paymentMethodType === 'card' ? 'Saved Card' : 
                            paymentMethodType === 'link' ? 'Payment Link' : 
                            paymentMethodType === 'invoice' ? 'Invoice' : 'Net Terms'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Amount</p>
                        <p className="text-primary font-medium"><FinancialGuard kind="revenue">{formatCurrency(getAmountDue())}</FinancialGuard></p>
                      </div>
                    </div>

                    <Separator />

                    {/* Progress/Status Area */}
                    {isProcessingPayment ? (
                      <div className="py-8 space-y-4">
                        {/* Shimmer progress bar */}
                        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                          <div className="absolute inset-0 bg-primary/30" />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
                        </div>
                        <p className="text-center text-muted-foreground">Processing payment...</p>
                      </div>
                    ) : paymentComplete ? (
                      <div className="py-6 text-center space-y-3">
                        <div className="flex justify-center">
                          <CheckCircle className="h-12 w-12 text-green-500 animate-check-bounce" />
                        </div>
                        <div>
                          <p className="font-medium text-green-600">Payment Successful!</p>
                          <p className="text-sm text-muted-foreground">
                            <FinancialGuard kind="revenue">{paymentMethodType === 'link' ? 'Payment link sent to customer' : 
                             paymentMethodType === 'invoice' || paymentMethodType === 'terms' ? 'Invoice will be sent after shipping' :
                             `Charged ${formatCurrency(getAmountDue())}`}</FinancialGuard>
                          </p>
                        </div>
                      </div>
                    ) : paymentError ? (
                      <div className="py-4">
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                          <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-destructive">Payment Failed</p>
                            <p className="text-sm text-muted-foreground mt-1">{paymentError}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <p>Ready to process payment for this order.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {paymentError ? (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setPaymentError(null);
                          setShowPaymentCharging(false);
                        }}
                      >
                        Change Method
                      </Button>
                      <Button 
                        className="flex-1" 
                        onClick={() => {
                          setPaymentError(null);
                          handleChargePayment();
                        }}
                      >
                        Retry Payment
                      </Button>
                      <Button variant="ghost" onClick={onClose}>
                        Cancel
                      </Button>
                    </>
                  ) : paymentComplete ? (
                    <>
                      <Button 
                        className="flex-1" 
                        onClick={() => {
                          if (isPickUpOrder) {
                            setStep('pickup_complete');
                          } else {
                            // After payment, create the label
                            setStep('creating_label');
                          }
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {isPickUpOrder ? 'Continue to Complete Order' : 'Continue to Create Label'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={() => setShowPaymentCharging(false)}
                        disabled={isProcessingPayment}
                      >
                        Back
                      </Button>
                      <Button 
                        className="flex-1" 
                        onClick={handleChargePayment}
                        disabled={isProcessingPayment}
                      >
                        {isProcessingPayment ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4 mr-2" />
                            Process Payment
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          )}

          {step === 'manual_entry' && customer && (
            <ManualCardEntry
              customerId={customer.id}
              stripeCustomerId={customer.stripe_customer_id}
              amount={getAmountDue()}
              orderId={order.id}
              orderNumber={order.order_number}
              onSuccess={handleManualPaymentSuccess}
              onBack={() => setStep('payment')}
              isOneTimePayment={paymentMethodType === 'manual_entry'}
              forceSaveCard={paymentMethodType === 'manual_entry_save'}
            />
          )}

          {/* Creating Label Step (auto-triggered after payment) */}
          {step === 'creating_label' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Creating Shipping Label
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isCreatingLabel ? (
                    <div className="py-8 space-y-4">
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                        <div className="absolute inset-0 bg-primary/30" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
                      </div>
                      <p className="text-center text-muted-foreground">
                        Creating {selectedRate?.carrier.toUpperCase()} {selectedRate?.service_name} label...
                      </p>
                    </div>
                  ) : labelError ? (
                    <div className="py-4">
                      <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium text-destructive">Label Creation Failed</p>
                          <p className="text-sm text-muted-foreground mt-1">{labelError}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setLabelError(null);
                            setStep('select_rate');
                          }}
                        >
                          Back to Rates
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => {
                            setLabelError(null);
                            createShippingLabel();
                          }}
                        >
                          Retry
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          {step === 'pickup_complete' && customer && (
            <div className="space-y-4">
              <Card className="border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-teal-700 dark:text-teal-300">
                    <Package className="h-5 w-5" />
                    Pick-Up Order Ready
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Customer</p>
                    <p className="font-medium">{customer.name}</p>
                    {customer.owners_name && (
                      <p className="text-sm text-muted-foreground">Contact: {customer.owners_name}</p>
                    )}
                  </div>
                  {customer.phone && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Phone</p>
                      <p className={isMobile ? '' : 'font-mono'}>
                        {isMobile ? (
                          <a href={`tel:${customer.phone}`} className="text-primary hover:underline">
                            {customer.phone}
                          </a>
                        ) : (
                          customer.phone
                        )}
                      </p>
                    </div>
                  )}
                  {customer.email && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Email</p>
                      <a href={`mailto:${customer.email}`} className="text-primary hover:underline">
                        {customer.email}
                      </a>
                    </div>
                  )}
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      This order will be marked as <span className="font-semibold text-teal-700 dark:text-teal-300">Ready for Pick-Up</span>. 
                      The customer will need to collect it in person.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Button 
                className="w-full bg-teal-600 hover:bg-teal-700" 
                onClick={async () => {
                  setProcessing(true);
                  try {
                    // Update order status to ready_for_pickup
                    const updateData: any = {
                      status: 'ready_for_pickup',
                      sold_at: new Date().toISOString(),
                    };
                    
                    // Set payment status based on payment method type
                    if (paymentMethodType === 'terms' || paymentMethodType === 'invoice') {
                      updateData.payment_status = 'invoiced';
                    } else if (paymentComplete || getAmountDue() === 0) {
                      updateData.payment_status = 'paid';
                      updateData.payment_received_at = new Date().toISOString();
                    }
                    
                    await supabase
                      .from('production_orders')
                      .update(updateData)
                      .eq('id', order.id);

                    // Also update repair items if this is a repair order
                    if (orderDetails?.order_type === 'repair') {
                      const { data: orderItems } = await supabase
                        .from('production_order_items')
                        .select('repair_item_id')
                        .eq('production_order_id', order.id)
                        .not('repair_item_id', 'is', null);
                      
                      const repairItemIds = orderItems?.map(item => item.repair_item_id).filter(Boolean) || [];
                      
                      if (repairItemIds.length > 0) {
                        await supabase
                          .from('repair_items')
                          .update({ status: 'ready_for_pickup' })
                          .in('id', repairItemIds);
                      }
                    }

                    toast({
                      title: 'Order Ready for Pick-Up!',
                      description: `Order ${order.order_number} is ready for customer pickup.`,
                    });
                    onSuccess();
                  } catch (error: any) {
                    console.error('Error completing pick-up order:', error);
                    toast({
                      title: 'Error',
                      description: error.message || 'Failed to complete order',
                      variant: 'destructive',
                    });
                  } finally {
                    setProcessing(false);
                  }
                }}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Mark Ready for Pick-Up
              </Button>
            </div>
          )}

          {step === 'print_label' && labelPath && (
            <div className="space-y-4">
              <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-300">
                    <CheckCircle className="h-5 w-5" />
                    Shipment Created Successfully!
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {trackingNumber && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Tracking Number</p>
                      <p className="font-mono text-lg">{trackingNumber}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Ship To</p>
                    <p>{selectedAddress?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedAddress?.address}, {selectedAddress?.city}, {selectedAddress?.state} {selectedAddress?.zip}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Printer className="h-5 w-5" />
                    Shipping Label
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border rounded-lg overflow-hidden bg-muted/50">
                    {labelLoadError ? (
                      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                        <p>{labelLoadError}</p>
                      </div>
                    ) : labelBlobUrl ? (
                      labelMimeType?.startsWith('image/') ? (
                        <img 
                          src={labelBlobUrl} 
                          alt="Shipping Label" 
                          className="w-full h-[400px] object-contain"
                        />
                      ) : (
                        <object 
                          data={labelBlobUrl} 
                          type="application/pdf" 
                          className="w-full h-[400px]"
                        >
                          <div className="flex items-center justify-center h-full text-muted-foreground p-4">
                            <p>PDF preview not available. Use the buttons below.</p>
                          </div>
                        </object>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-[400px]">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      disabled={!labelBlobUrl}
                      onClick={() => {
                        if (labelBlobUrl) {
                          printThermalLabel(labelBlobUrl, { mimeType: labelMimeType || undefined });
                        }
                      }}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Print Label
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      disabled={!labelBlobUrl}
                      onClick={() => {
                        if (labelBlobUrl && trackingNumber) {
                          const extension = labelMimeType?.includes('png') ? 'png' : 'pdf';
                          downloadLabel(labelBlobUrl, `shipping-label-${trackingNumber}.${extension}`);
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Label
                    </Button>
                    <PrintInstructionsTooltip />
                  </div>
                </CardContent>
              </Card>

              <Button 
                className="w-full" 
                onClick={() => {
                  toast({
                    title: 'Order Shipped!',
                    description: trackingNumber 
                      ? `Tracking: ${trackingNumber}` 
                      : 'Order marked as shipped',
                  });
                  onSuccess();
                }}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Done
              </Button>
            </div>
          )}
        </div>

        {/* Phone Number Dialog */}
        {autoSerialItems.length > 0 && (
          <SerialAssignmentModal
            open={autoSerialModalOpen}
            onOpenChange={setAutoSerialModalOpen}
            orderId={order.id}
            orderNumber={order.order_number}
            items={autoSerialItems}
            onComplete={() => {
              // SerialAssignmentModal persists serials/print state; nothing else needed here.
            }}
          />
        )}

        <CustomerPhoneDialog
          open={showPhoneDialog}
          onClose={() => setShowPhoneDialog(false)}
          customerId={customer?.id || ''}
          customerName={customer?.name || order.customer_name}
          onPhoneSaved={handlePhoneSaved}
        />

        {/* Third-Party Billing Fallback Dialog */}
        <ThirdPartyBillingFallbackDialog
          open={thirdPartyFallbackOpen}
          onClose={() => setThirdPartyFallbackOpen(false)}
          onUseCompanyAccount={() => {
            setThirdPartyFallbackOpen(false);
            if (thirdPartyFallbackRetry) {
              thirdPartyFallbackRetry();
            }
          }}
          carrierName={thirdPartyFallbackCarrier}
          accountNumber={thirdPartyFallbackAccount}
          errorMessage={thirdPartyFallbackError}
        />
      </DialogContent>
    </Dialog>
  );
}
