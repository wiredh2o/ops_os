import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Loader2, 
  Truck, 
  Package, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  CheckCircle, 
  Circle,
  FlaskConical,
  DollarSign,
  Clock,
  Star,
  Zap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, cn } from '@/lib/utils';
import { useEnabledCarriers } from '@/hooks/useSystemSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
}

interface UnifiedRate {
  carrier: 'fedex' | 'ups' | 'usps';
  service_type: string;
  service_name: string;
  total_charge: number;
  account_charge?: number;
  currency: string;
  transit_days: number;
  transit_hours: number;  // High-resolution for sorting/value calculation
  pricing_type?: 'weight_based' | 'flat_rate';
  container_type?: string;
  isMock: boolean;
  // Time-aware fields
  commit_date?: string;  // Actual carrier commit date (e.g., "2025-01-14")
  effective_pickup?: string;
  estimated_delivery?: string;
  delivery_time_display?: string;
  customer_value_hours?: number;
  saturday_delivery?: boolean;
  // Calculated locally
  marginal_cost_per_hour?: number;
  hours_saved?: number;
  price_diff?: number;
  cost_per_value_hour?: number;
}

interface LabelCreationResult {
  tracking_number: string;
  label_path: string;
  shipping_cost: number;
  isMock?: boolean;
}

interface ThirdPartyBillingInfo {
  useThirdPartyBilling: boolean;
  fedexAccountNumber?: string | null;
  upsAccountNumber?: string | null;
  billingZip?: string;
}

interface MultiCarrierRateComparisonProps {
  shipTo: ShippingAddress;
  packageWeight: number;
  packageDimensions: { length: number; width: number; height: number };
  onWeightChange: (weight: number) => void;
  onDimensionsChange: (dims: { length: number; width: number; height: number }) => void;
  /** Called after a label is created (legacy flow). Optional when onRateSelected is provided. */
  onLabelCreated?: (rate: UnifiedRate, result: LabelCreationResult) => void;
  /** Called when a rate is selected without creating a label (new flow). */
  onRateSelected?: (rate: UnifiedRate) => void;
  onBack: () => void;
  shipFrom: {
    name?: string;
    company: string;
    street: string;
    street2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    phone: string;
  };
  shipToDetails: {
    name?: string;
    company: string;
    phone?: string;
  };
  orderId: string;
  thirdPartyBilling?: ThirdPartyBillingInfo;
  onThirdPartyBillingError?: (carrier: string, accountNumber: string, errorMessage: string, retryWithCompanyAccount: () => void) => void;
  /** When true, dims/weight come from the packing algorithm — inputs are read-only and rates auto-fetch */
  autoPackaging?: boolean;
}

const CARRIER_LOGOS: Record<string, string> = {
  fedex: '/carrier-logos/fedex-logo.png',
  ups: '/carrier-logos/ups-logo-new.png',
  usps: '/carrier-logos/usps-logo-new.png',
};

// Carrier badge logos for filter controls
const CARRIER_BADGES: Record<string, string> = {
  fedex: '/carrier-logos/fedex-logo.png',
  ups: '/carrier-logos/ups-logo-new.png',
  usps: '/carrier-logos/usps-logo-new.png',
};

// Service-specific logos for detailed branding
const SERVICE_LOGOS: Record<string, string> = {
  // FedEx Express services
  'FIRST_OVERNIGHT': '/carrier-logos/fedex-express.png',
  'FEDEX_FIRST_OVERNIGHT': '/carrier-logos/fedex-express.png',
  'FEDEX_FIRST_OVERNIGHT_EXTRA_HOURS': '/carrier-logos/fedex-express.png',
  'PRIORITY_OVERNIGHT': '/carrier-logos/fedex-express.png',
  'FEDEX_PRIORITY_OVERNIGHT': '/carrier-logos/fedex-express.png',
  'FEDEX_PRIORITY_OVERNIGHT_EXTRA_HOURS': '/carrier-logos/fedex-express.png',
  'STANDARD_OVERNIGHT': '/carrier-logos/fedex-express.png',
  'FEDEX_STANDARD_OVERNIGHT': '/carrier-logos/fedex-express.png',
  'FEDEX_STANDARD_OVERNIGHT_EXTRA_HOURS': '/carrier-logos/fedex-express.png',
  'FEDEX_EXPRESS_SAVER': '/carrier-logos/fedex-express.png',
  // FedEx 2Day services
  'FEDEX_2_DAY': '/carrier-logos/fedex-express.png',
  'FEDEX_2_DAY_AM': '/carrier-logos/fedex-express.png',
  // FedEx Ground services
  'FEDEX_GROUND': '/carrier-logos/fedex-ground.png',
  'GROUND_HOME_DELIVERY': '/carrier-logos/fedex-ground.png',
  'FEDEX_HOME_DELIVERY': '/carrier-logos/fedex-ground.png',
  'FEDEX_GROUND_ECONOMY': '/carrier-logos/fedex-ground.png',
  'SMART_POST': '/carrier-logos/fedex-ground.png',
  // UPS services - all use the unified UPS logo
  '01': '/carrier-logos/ups-logo-new.png',
  '13': '/carrier-logos/ups-logo-new.png',
  '14': '/carrier-logos/ups-logo-new.png',
  '02': '/carrier-logos/ups-logo-new.png',
  '59': '/carrier-logos/ups-logo-new.png',
  '03': '/carrier-logos/ups-logo-new.png',
  '12': '/carrier-logos/ups-logo-new.png',
  // USPS services - all use the unified USPS logo
  'PRIORITY_MAIL_EXPRESS': '/carrier-logos/usps-logo-new.png',
  'PRIORITY_MAIL': '/carrier-logos/usps-logo-new.png',
  'USPS_GROUND_ADVANTAGE': '/carrier-logos/usps-logo-new.png',
  // USPS Priority Mail Flat Rate variants
  'FLAT_RATE_SMALL_FLAT_RATE_BOX': '/carrier-logos/usps-logo-new.png',
  'FLAT_RATE_MEDIUM_FLAT_RATE_BOX_TOP': '/carrier-logos/usps-logo-new.png',
  'FLAT_RATE_MEDIUM_FLAT_RATE_BOX_SIDE': '/carrier-logos/usps-logo-new.png',
  'FLAT_RATE_LARGE_FLAT_RATE_BOX': '/carrier-logos/usps-logo-new.png',
  'FLAT_RATE_FLAT_RATE_ENVELOPE': '/carrier-logos/usps-logo-new.png',
};

type SortOption = 'value' | 'price' | 'speed' | 'carrier';

// Calculate value scores using customer_value_hours (weekend-weighted) and cost
// Lower customer_value_hours = faster delivery considering weekend value
function calculateValueScores(rates: UnifiedRate[]): UnifiedRate[] {
  if (rates.length === 0) return rates;
  
  // Add cost_per_value_hour to each rate
  const withCPVH = rates.map(rate => {
    const hours = rate.customer_value_hours ?? rate.transit_hours;
    const cost_per_value_hour = hours > 0 ? rate.total_charge / hours : Infinity;
    return { ...rate, cost_per_value_hour };
  });
  
  // Find baseline: lowest total_charge (cheapest option)
  const baseline = withCPVH.reduce((cheapest, opt) =>
    opt.total_charge < cheapest.total_charge ? opt : cheapest,
    withCPVH[0]
  );
  
  const baselineHours = baseline.customer_value_hours ?? baseline.transit_hours;
  
  return withCPVH.map(option => {
    const isBaseline = option.carrier === baseline.carrier && option.service_type === baseline.service_type;
    let marginal_cost_per_hour: number | undefined;
    let hours_saved: number | undefined;
    let price_diff: number | undefined;
    
    if (!isBaseline) {
      price_diff = option.total_charge - baseline.total_charge;
      const optionHours = option.customer_value_hours ?? option.transit_hours;
      const hoursSaved = baselineHours - optionHours;
      marginal_cost_per_hour = hoursSaved > 0 ? price_diff / hoursSaved : 0;
      hours_saved = hoursSaved > 0 ? hoursSaved : 0;
    }
    
    return { ...option, marginal_cost_per_hour, hours_saved, price_diff };
  });
}

/**
 * Format delivery date for display (e.g., "Sat, Jan 11")
 */
function formatDeliveryDate(isoString: string): string {
  const date = new Date(isoString);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

export function MultiCarrierRateComparison({
  shipTo,
  packageWeight,
  packageDimensions,
  onWeightChange,
  onDimensionsChange,
  onLabelCreated,
  onRateSelected,
  onBack,
  shipFrom,
  shipToDetails,
  orderId,
  thirdPartyBilling,
  onThirdPartyBillingError,
  autoPackaging = false,
}: MultiCarrierRateComparisonProps) {
  const enabledCarriers = useEnabledCarriers();
  const [rates, setRates] = useState<UnifiedRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [carrierStatuses, setCarrierStatuses] = useState<Record<string, { available: boolean; error?: string; isMock: boolean }>>({});
  
  const [selectedRate, setSelectedRate] = useState<UnifiedRate | null>(null);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [labelCreated, setLabelCreated] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{ rate: UnifiedRate; result: LabelCreationResult } | null>(null);
  
  const [sortBy, setSortBy] = useState<SortOption>('value');
  // Initialize carrier filters based on enabled carriers
  const [carrierFilters, setCarrierFilters] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (enabledCarriers.fedex) initial.add('fedex');
    if (enabledCarriers.ups) initial.add('ups');
    if (enabledCarriers.usps) initial.add('usps');
    return initial.size > 0 ? initial : new Set(['fedex', 'ups', 'usps']);
  });
  const [pastCutoff, setPastCutoff] = useState(false);
  const [effectivePickupDate, setEffectivePickupDate] = useState<string | null>(null);

  // Auto-fetch rates when autoPackaging is enabled (dims/weight provided by packing algo)
  const autoFetchedRef = useRef(false);
  useEffect(() => {
    if (autoPackaging && !autoFetchedRef.current && packageWeight > 0) {
      autoFetchedRef.current = true;
      fetchRates();
    }
  }, [autoPackaging, packageWeight]);

  // Update carrier filters when enabled carriers change
  useEffect(() => {
    setCarrierFilters(prev => {
      const next = new Set<string>();
      if (enabledCarriers.fedex) next.add('fedex');
      if (enabledCarriers.ups) next.add('ups');
      if (enabledCarriers.usps) next.add('usps');
      // Keep existing filters that are still enabled
      for (const carrier of prev) {
        if ((carrier === 'fedex' && enabledCarriers.fedex) ||
            (carrier === 'ups' && enabledCarriers.ups) ||
            (carrier === 'usps' && enabledCarriers.usps)) {
          next.add(carrier);
        }
      }
      return next.size > 0 ? next : prev;
    });
  }, [enabledCarriers.fedex, enabledCarriers.ups, enabledCarriers.usps]);

  // Toggle carrier filter
  const toggleCarrierFilter = (carrier: string) => {
    setCarrierFilters(prev => {
      const next = new Set(prev);
      if (next.has(carrier)) {
        // Don't allow removing all carriers
        if (next.size > 1) {
          next.delete(carrier);
        }
      } else {
        next.add(carrier);
      }
      return next;
    });
  };

  // Filter rates by selected carriers first
  const filteredRates = useMemo(() => {
    return rates.filter(rate => carrierFilters.has(rate.carrier));
  }, [rates, carrierFilters]);

  // Calculate value scores based on VISIBLE (filtered) rates only
  const processedRates = useMemo(() => {
    const scored = calculateValueScores(filteredRates);
    
    // Find the cheapest rate within visible rates
    const cheapestRate = filteredRates.length > 0 
      ? filteredRates.reduce((min, r) => r.total_charge < min.total_charge ? r : min, filteredRates[0])
      : null;
    
    return scored.map(rate => ({
      ...rate,
      isCheapest: cheapestRate && 
        rate.carrier === cheapestRate.carrier && 
        rate.service_type === cheapestRate.service_type,
    }));
  }, [filteredRates]);

  // Sort visible rates by value (default)
  const sortedRates = useMemo(() => {
    const sorted = [...processedRates];
    
    switch (sortBy) {
      case 'value':
        sorted.sort((a, b) => {
          if (a.marginal_cost_per_hour === undefined && b.marginal_cost_per_hour !== undefined) return -1;
          if (a.marginal_cost_per_hour !== undefined && b.marginal_cost_per_hour === undefined) return 1;
          if (a.marginal_cost_per_hour === undefined && b.marginal_cost_per_hour === undefined) return 0;
          return (a.marginal_cost_per_hour ?? 0) - (b.marginal_cost_per_hour ?? 0);
        });
        break;
      case 'price':
        sorted.sort((a, b) => a.total_charge - b.total_charge);
        break;
      case 'speed':
        // Use customer_value_hours for speed sorting (accounts for weekend weighting)
        sorted.sort((a, b) => (a.customer_value_hours ?? a.transit_hours) - (b.customer_value_hours ?? b.transit_hours));
        break;
      case 'carrier':
        sorted.sort((a, b) => {
          if (a.carrier !== b.carrier) return a.carrier.localeCompare(b.carrier);
          return a.total_charge - b.total_charge;
        });
        break;
    }
    
    return sorted;
  }, [processedRates, sortBy]);

  const fetchRates = async () => {
    setLoading(true);
    setErrorMessage(null);
    setRates([]);
    setLabelError(null);
    setCarrierStatuses({});
    setPastCutoff(false);
    setEffectivePickupDate(null);

    try {
      // Build enabled carriers array from settings
      const enabledCarriersList: string[] = [];
      if (enabledCarriers.fedex) enabledCarriersList.push('fedex');
      if (enabledCarriers.ups) enabledCarriersList.push('ups');
      if (enabledCarriers.usps) enabledCarriersList.push('usps');

      if (enabledCarriersList.length === 0) {
        throw new Error('No shipping carriers are enabled. Please enable at least one carrier in Settings.');
      }

      const { data, error: fetchError } = await supabase.functions.invoke('get-all-carrier-rates', {
        body: {
          ship_from: {
            street: shipFrom.street,
            city: shipFrom.city,
            state: shipFrom.state,
            postal_code: shipFrom.postal_code,
            country: shipFrom.country,
          },
          ship_to: {
            street: shipTo.address,
            city: shipTo.city,
            state: shipTo.state,
            postal_code: shipTo.zip,
            country: shipTo.country || 'US',
            residential: false,
          },
          packages: [{
            weight_lbs: packageWeight,
            dimensions: packageDimensions,
          }],
          enabled_carriers: enabledCarriersList,
        },
      });

      if (fetchError) {
        throw new Error(fetchError.message || 'Failed to get shipping rates');
      }

      if (data?.success === false || data?.error) {
        throw new Error(data.error || 'Unknown error');
      }

      if (data?.rates && data.rates.length > 0) {
        setRates(data.rates);
        setCarrierStatuses(data.carriers || {});
        setPastCutoff(data.past_cutoff || false);
        setEffectivePickupDate(data.effective_pickup || null);
      } else {
        throw new Error('No shipping rates available from any carrier');
      }
    } catch (err: any) {
      console.error('Error fetching rates:', err);
      setErrorMessage(err.message);
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const getLabelFunctionName = (carrier: string) => {
    switch (carrier) {
      case 'ups': return 'create-ups-shipment';
      case 'usps': return 'create-usps-label';
      default: return 'create-fedex-shipment';
    }
  };

  const handleCreateLabel = async (useCompanyAccount: boolean = false) => {
    if (!selectedRate) return;

    setCreatingLabel(true);
    setLabelError(null);

    try {
      const labelBody: any = {
        ship_from: {
          name: shipFrom.name || '',
          company: shipFrom.company,
          street: shipFrom.street,
          street2: shipFrom.street2,
          city: shipFrom.city,
          state: shipFrom.state,
          postal_code: shipFrom.postal_code,
          country: shipFrom.country,
          phone: shipFrom.phone,
        },
        ship_to: {
          name: shipToDetails.name || '',
          company: shipToDetails.company,
          street: shipTo.address,
          city: shipTo.city,
          state: shipTo.state,
          postal_code: shipTo.zip,
          country: shipTo.country || 'US',
          residential: false,
          phone: shipToDetails.phone,
        },
        packages: [{ weight_lbs: packageWeight, dimensions: packageDimensions }],
        service_type: selectedRate.service_type,
        order_id: orderId,
        label_format: 'PNG',
      };

      // Add container type for USPS flat rate
      if (selectedRate.carrier === 'usps' && selectedRate.container_type) {
        labelBody.container_type = selectedRate.container_type;
      }

      // Add third-party billing info if enabled and not forcing company account
      if (!useCompanyAccount && thirdPartyBilling?.useThirdPartyBilling) {
        if (selectedRate.carrier === 'fedex' && thirdPartyBilling.fedexAccountNumber) {
          labelBody.third_party_billing = true;
          labelBody.third_party_fedex_account = thirdPartyBilling.fedexAccountNumber;
          labelBody.third_party_fedex_zip = thirdPartyBilling.billingZip;
        } else if (selectedRate.carrier === 'ups' && thirdPartyBilling.upsAccountNumber) {
          labelBody.third_party_billing = true;
          labelBody.third_party_ups_account = thirdPartyBilling.upsAccountNumber;
          labelBody.third_party_ups_zip = thirdPartyBilling.billingZip;
        }
      }

      const { data: shipmentData, error: shipmentError } = await supabase.functions.invoke(
        getLabelFunctionName(selectedRate.carrier),
        { body: labelBody }
      );

      // Check for third-party billing error
      if (shipmentData?.isThirdPartyError && onThirdPartyBillingError) {
        const accountNumber = selectedRate.carrier === 'fedex' 
          ? thirdPartyBilling?.fedexAccountNumber 
          : thirdPartyBilling?.upsAccountNumber;
        
        onThirdPartyBillingError(
          selectedRate.carrier.toUpperCase(),
          accountNumber || 'Unknown',
          shipmentData.details || shipmentData.error || 'Third-party billing failed',
          () => handleCreateLabel(true) // Retry with company account
        );
        setCreatingLabel(false);
        return;
      }

      if (shipmentError || !shipmentData?.tracking_number) {
        throw new Error(shipmentError?.message || shipmentData?.error || 'Failed to create shipping label');
      }

      // Update order with tracking info and status
      const nowIso = new Date().toISOString();
      await supabase
        .from('production_orders')
        .update({
          status: 'label_staged',
          sold_at: nowIso,
          label_created_at: nowIso,
          shipping_cost: selectedRate.total_charge,
          fedex_tracking_number: shipmentData.tracking_number,
          fedex_label_url: shipmentData.label_path,
          carrier: selectedRate.carrier,
          is_mock_shipment: shipmentData.isMock || selectedRate.isMock,
        })
        .eq('id', orderId);

      const result: LabelCreationResult = {
        tracking_number: shipmentData.tracking_number,
        label_path: shipmentData.label_path,
        shipping_cost: selectedRate.total_charge,
        isMock: shipmentData.isMock || selectedRate.isMock,
      };

      setCreatedResult({ rate: selectedRate, result });
      setLabelCreated(true);
    } catch (error: any) {
      console.error('Error creating shipment:', error);
      setLabelError(error.message || 'Failed to create shipping label');
    } finally {
      setCreatingLabel(false);
    }
  };

  const handleContinue = () => {
    if (createdResult && onLabelCreated) {
      onLabelCreated(createdResult.rate, createdResult.result);
    }
  };

  // If onRateSelected is provided, use the new flow (no label creation in this component)
  const useRateSelectionOnly = !!onRateSelected;

  // Show success state if label was created (legacy flow only)
  if (!useRateSelectionOnly && labelCreated && createdResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <h3 className="font-semibold text-green-700 dark:text-green-400">
            Shipping Label Created
          </h3>
          <img 
            src={CARRIER_LOGOS[createdResult.rate.carrier]} 
            alt={createdResult.rate.carrier.toUpperCase()}
            className="h-6 w-auto object-contain"
          />
          {createdResult.result.isMock && (
            <Badge variant="outline" className="text-xs flex items-center gap-1 border-amber-500 text-amber-600">
              <FlaskConical className="h-3 w-3" />
              Sandbox
            </Badge>
          )}
        </div>

        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardContent className="pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{createdResult.rate.service_name}</p>
                {createdResult.rate.transit_days && (
                  <p className="text-xs text-muted-foreground">{createdResult.rate.transit_days} day{createdResult.rate.transit_days !== 1 ? 's' : ''}</p>
                )}
              </div>
              <span className="font-bold text-primary">{formatCurrency(createdResult.rate.total_charge)}</span>
            </div>
            <div className="pt-2 border-t">
              <p className="text-sm font-medium text-muted-foreground">Tracking Number</p>
              <p className="font-mono text-lg">{createdResult.result.tracking_number}</p>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleContinue}>
          <CheckCircle className="h-4 w-4 mr-2" />
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Truck className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Compare Shipping Rates</h3>
      </div>

      {/* Package Details */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Package Details</span>
            {autoPackaging && (
              <Badge variant="secondary" className="text-[10px]">Auto-packed</Badge>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Weight (lbs)</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={packageWeight}
                onChange={(e) => onWeightChange(parseFloat(e.target.value) || 1)}
                readOnly={autoPackaging}
                className={autoPackaging ? 'bg-muted cursor-default' : ''}
              />
            </div>
            <div>
              <Label className="text-xs">Length (in)</Label>
              <Input
                type="number"
                min="1"
                value={packageDimensions.length}
                onChange={(e) => onDimensionsChange({ ...packageDimensions, length: parseInt(e.target.value) || 1 })}
                readOnly={autoPackaging}
                className={autoPackaging ? 'bg-muted cursor-default' : ''}
              />
            </div>
            <div>
              <Label className="text-xs">Width (in)</Label>
              <Input
                type="number"
                min="1"
                value={packageDimensions.width}
                onChange={(e) => onDimensionsChange({ ...packageDimensions, width: parseInt(e.target.value) || 1 })}
                readOnly={autoPackaging}
                className={autoPackaging ? 'bg-muted cursor-default' : ''}
              />
            </div>
            <div>
              <Label className="text-xs">Height (in)</Label>
              <Input
                type="number"
                min="1"
                value={packageDimensions.height}
                onChange={(e) => onDimensionsChange({ ...packageDimensions, height: parseInt(e.target.value) || 1 })}
                readOnly={autoPackaging}
                className={autoPackaging ? 'bg-muted cursor-default' : ''}
              />
            </div>
          </div>
          {!autoPackaging && (
            <Button variant="default" size="sm" className="mt-3" onClick={fetchRates} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Get All Rates
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Error display for label creation */}
      {labelError && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Label Creation Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{labelError}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={() => setLabelError(null)}
                >
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rates List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Fetching rates from all carriers...</span>
        </div>
      ) : rates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              Enter package details above and click "Get All Rates" to compare shipping options from FedEx, UPS, and USPS.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Cutoff warning banner */}
          {pastCutoff && effectivePickupDate && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Today's pickup cutoff (5pm MT) has passed. Packages will ship {formatDeliveryDate(effectivePickupDate)}.
              </p>
            </div>
          )}
          {/* Sort controls */}
          {(() => {
            const enabledCarrierCount = (['fedex', 'ups', 'usps'] as const).filter(c => enabledCarriers[c]).length;
            return (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground w-16 flex-shrink-0">Sort by:</span>
                <ToggleGroup type="single" value={sortBy} onValueChange={(v) => v && setSortBy(v as SortOption)}>
                  <ToggleGroupItem value="value" size="sm" className="text-xs">
                    <Star className="h-3 w-3 mr-1" />
                    Value
                  </ToggleGroupItem>
                  <ToggleGroupItem value="price" size="sm" className="text-xs">
                    <DollarSign className="h-3 w-3 mr-1" />
                    Price
                  </ToggleGroupItem>
                  <ToggleGroupItem value="speed" size="sm" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Speed
                  </ToggleGroupItem>
                  {enabledCarrierCount > 1 && (
                    <ToggleGroupItem value="carrier" size="sm" className="text-xs">
                      <Truck className="h-3 w-3 mr-1" />
                      Carrier
                    </ToggleGroupItem>
                  )}
                </ToggleGroup>
              </div>
            );
          })()}

          {/* Carrier filter badges - only show when multiple carriers are enabled */}
          {(() => {
            const enabledCarriersList = (['fedex', 'ups', 'usps'] as const).filter(c => enabledCarriers[c]);
            if (enabledCarriersList.length <= 1) return null;
            
            return (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground w-16 flex-shrink-0">Show:</span>
                <div className="flex gap-6">
                  {enabledCarriersList.map((carrier) => {
                    const isActive = carrierFilters.has(carrier);
                    const status = carrierStatuses[carrier];
                    const isAvailable = status?.available !== false;
                    
                    return (
                      <button
                        key={carrier}
                        onClick={() => isAvailable && toggleCarrierFilter(carrier)}
                        disabled={!isAvailable}
                        className={cn(
                          'relative rounded transition-all w-12 flex items-center justify-center',
                          isActive && isAvailable
                            ? 'ring-2 ring-primary ring-offset-2'
                            : 'opacity-40 grayscale',
                          !isAvailable && 'cursor-not-allowed opacity-20'
                        )}
                      >
                        <img 
                          src={CARRIER_BADGES[carrier]} 
                          alt={carrier.toUpperCase()}
                          className="h-6 w-auto object-contain"
                        />
                        {status?.isMock && isActive && (
                          <FlaskConical className="absolute -top-1 -right-1 h-3 w-3 text-amber-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Rates list */}
          <div className="grid gap-2 max-h-[400px] overflow-y-auto">
            {sortedRates.map((rate) => {
              const isSelected = selectedRate?.carrier === rate.carrier && 
                                 selectedRate?.service_type === rate.service_type;

              return (
                <Card
                  key={`${rate.carrier}-${rate.service_type}`}
                  onClick={() => !creatingLabel && setSelectedRate(rate)}
                  className={cn(
                    'transition-all cursor-pointer hover:border-primary/50',
                    isSelected
                      ? 'border-2 border-primary bg-primary/5'
                      : 'hover:bg-muted/50',
                    creatingLabel && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      {/* Selection indicator */}
                      <div className="flex-shrink-0">
                        {isSelected ? (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/50" />
                        )}
                      </div>

                      {/* Carrier/Service logo */}
                      <div className="w-[120px] flex-shrink-0 flex items-center justify-center">
                        <img 
                          src={SERVICE_LOGOS[rate.service_type] || CARRIER_LOGOS[rate.carrier]} 
                          alt={`${rate.carrier.toUpperCase()} ${rate.service_name}`}
                          className="h-10 w-auto object-contain"
                        />
                      </div>

                      {/* Rate details */}
                      <div className="flex-1">
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className="text-sm font-medium whitespace-normal">{rate.service_name}</p>
                          {rate.pricing_type === 'flat_rate' && (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              <Package className="h-3 w-3 mr-1" />
                              Flat Rate
                            </Badge>
                          )}
                        </div>
                        {/* Delivery date/time display */}
                        {rate.estimated_delivery ? (
                          <p className="text-xs text-muted-foreground">
                            Delivers: {formatDeliveryDate(rate.estimated_delivery)} {rate.delivery_time_display || ''}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {rate.transit_days} day{rate.transit_days !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(rate as any).isCheapest && (
                          <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                            <DollarSign className="h-3 w-3" />
                            Cheapest
                          </Badge>
                        )}
                        {rate.isMock && (
                          <FlaskConical className="h-4 w-4 text-amber-500" />
                        )}
                      </div>

                      {/* Price + $/hr metric */}
                      <div className="text-right flex-shrink-0">
                        <span className="font-bold text-primary text-lg">
                          {formatCurrency(rate.total_charge)}
                        </span>
                        {rate.account_charge !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            Our cost: {formatCurrency(rate.account_charge)}
                          </p>
                        )}
                        {/* Marginal cost per hour metric */}
                        {rate.marginal_cost_per_hour === undefined && rate.cost_per_value_hour !== undefined && rate.cost_per_value_hour !== Infinity && (
                          <p className="text-xs text-muted-foreground">
                            ${rate.cost_per_value_hour.toFixed(2)}/hr
                          </p>
                        )}
                        {rate.marginal_cost_per_hour !== undefined && (
                          <p className={cn(
                            "text-xs",
                            rate.hours_saved != null && rate.hours_saved <= 0 && rate.price_diff != null && rate.price_diff > 0
                              ? "text-red-600 dark:text-red-400"
                              : rate.marginal_cost_per_hour <= 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-amber-600 dark:text-amber-400"
                          )}>
                            {`Arrives ${Math.round(rate.hours_saved ?? 0)} business hrs faster at additional cost of ${
                              (rate.hours_saved ?? 0) > 0
                                ? (rate.marginal_cost_per_hour <= 0
                                    ? `-$${Math.abs(rate.marginal_cost_per_hour).toFixed(2)}`
                                    : `$${rate.marginal_cost_per_hour.toFixed(2)}`)
                                : (rate.price_diff != null && rate.price_diff < 0
                                    ? `-$${Math.abs(rate.price_diff).toFixed(2)}`
                                    : `$${Math.abs(rate.price_diff ?? 0).toFixed(2)}`)
                            }/hr`}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {useRateSelectionOnly ? (
            <Button
              className="w-full"
              size="lg"
              disabled={!selectedRate}
              onClick={() => {
                if (selectedRate && onRateSelected) {
                  onRateSelected(selectedRate);
                }
              }}
            >
              <Truck className="h-4 w-4 mr-2" />
              Continue with {selectedRate ? `${selectedRate.carrier.toUpperCase()} ${selectedRate.service_name}` : 'Selected Rate'}
            </Button>
          ) : (
            <>
              <Button
                className="w-full"
                size="lg"
                disabled={!selectedRate || creatingLabel}
                onClick={() => handleCreateLabel()}
              >
                {creatingLabel ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating Label...
                  </>
                ) : (
                  <>
                    <Truck className="h-4 w-4 mr-2" />
                    Create {selectedRate ? `${selectedRate.carrier.toUpperCase()} ` : ''}Label
                  </>
                )}
              </Button>

              {creatingLabel && (
                <div className="space-y-2">
                  <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-primary/30" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Creating shipping label...</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Back Button */}
      <div className="flex gap-2 pt-4">
        <Button variant="outline" onClick={onBack} disabled={creatingLabel}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Error Dialog */}
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Error Fetching Rates
            </AlertDialogTitle>
            <AlertDialogDescription>
              {errorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialogOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
