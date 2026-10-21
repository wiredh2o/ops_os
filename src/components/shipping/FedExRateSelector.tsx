import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Truck, Package, ArrowLeft, Check, AlertCircle, RefreshCw, CheckCircle, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/utils';
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

interface FedExRate {
  service_type: string;
  service_name: string;
  total_charge: number;
  currency: string;
  transit_days?: number;
  delivery_date?: string;
}

interface FedExError {
  error: string;
  error_code: string;
  hint: string;
  environment: 'production' | 'sandbox' | 'unknown';
  details?: any;
}

interface LabelCreationResult {
  tracking_number: string;
  label_path: string;
  shipping_cost: number;
}

interface FedExRateSelectorProps {
  shipTo: ShippingAddress;
  packageWeight: number;
  packageDimensions: { length: number; width: number; height: number };
  onWeightChange: (weight: number) => void;
  onDimensionsChange: (dims: { length: number; width: number; height: number }) => void;
  onLabelCreated: (rate: FedExRate, result: LabelCreationResult) => void;
  onBack: () => void;
  // Props for label creation
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
}

export function FedExRateSelector({
  shipTo,
  packageWeight,
  packageDimensions,
  onWeightChange,
  onDimensionsChange,
  onLabelCreated,
  onBack,
  shipFrom,
  shipToDetails,
  orderId,
}: FedExRateSelectorProps) {
  const [rates, setRates] = useState<FedExRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [fedexError, setFedexError] = useState<FedExError | null>(null);
  
  // Rate selection state
  const [selectedRate, setSelectedRate] = useState<FedExRate | null>(null);
  
  // Label creation states
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [labelCreated, setLabelCreated] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{ rate: FedExRate; result: LabelCreationResult } | null>(null);

  const fetchRates = async () => {
    setLoading(true);
    setFedexError(null);
    setRates([]);
    setLabelError(null);

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('get-fedex-rates', {
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
        },
      });

      if (fetchError) {
        throw { 
          error: fetchError.message || 'Failed to connect to shipping service',
          error_code: 'CONNECTION_ERROR',
          hint: 'Please check your internet connection and try again.',
          environment: 'unknown' as const,
        };
      }
      
      // Check if the response indicates an error
      if (data?.success === false || data?.error) {
        throw {
          error: data.error || 'Unknown error',
          error_code: data.error_code || 'UNKNOWN_ERROR',
          hint: data.hint || 'Please try again.',
          environment: data.environment || 'unknown',
          details: data.details,
        };
      }
      
      if (data?.rates && data.rates.length > 0) {
        setRates(data.rates);
      } else {
        // No rates returned but no error either
        throw {
          error: 'No shipping rates available',
          error_code: 'NO_RATES',
          hint: 'FedEx did not return any rates for this shipment. Please verify the address details.',
          environment: data?.environment || 'unknown',
        };
      }
    } catch (err: any) {
      console.error('Error fetching FedEx rates:', err);
      
      // Set the error and show dialog
      const fedexErr: FedExError = {
        error: err.error || err.message || 'Failed to get shipping rates',
        error_code: err.error_code || 'UNKNOWN_ERROR',
        hint: err.hint || 'Please try again or contact support.',
        environment: err.environment || 'unknown',
        details: err.details,
      };
      
      setFedexError(fedexErr);
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setErrorDialogOpen(false);
    fetchRates();
  };

  const handleCloseDialog = () => {
    setErrorDialogOpen(false);
  };

  const handleCreateLabel = async () => {
    if (!selectedRate) return;
    
    setCreatingLabel(true);
    setLabelError(null);
    
    try {
      const { data: shipmentData, error: shipmentError } = await supabase.functions.invoke('create-fedex-shipment', {
        body: {
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
        },
      });

      if (shipmentError || !shipmentData?.tracking_number) {
        throw new Error(shipmentError?.message || 'Failed to create shipping label');
      }

      // Update order with tracking info and status
      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('production_orders')
        .update({
          status: 'label_staged',
          sold_at: nowIso,
          label_created_at: nowIso,
          shipping_cost: selectedRate.total_charge,
          fedex_tracking_number: shipmentData.tracking_number,
          fedex_label_url: shipmentData.label_path,
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      const result: LabelCreationResult = {
        tracking_number: shipmentData.tracking_number,
        label_path: shipmentData.label_path,
        shipping_cost: selectedRate.total_charge,
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
    if (createdResult) {
      onLabelCreated(createdResult.rate, createdResult.result);
    }
  };

  // Show success state if label was created
  if (labelCreated && createdResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <h3 className="font-semibold text-green-700 dark:text-green-400">Shipping Label Created</h3>
        </div>

        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardContent className="pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{createdResult.rate.service_name || createdResult.rate.service_type}</p>
                {createdResult.rate.transit_days && (
                  <p className="text-xs text-muted-foreground">{createdResult.rate.transit_days} business days</p>
                )}
              </div>
              <span className="font-bold text-primary"><FinancialGuard kind="revenue">{formatCurrency(createdResult.rate.total_charge)}</FinancialGuard></span>
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
        <h3 className="font-semibold">Create Shipping Label</h3>
      </div>

      {/* Package Details */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Package Details</span>
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
              />
            </div>
            <div>
              <Label className="text-xs">Length (in)</Label>
              <Input
                type="number"
                min="1"
                value={packageDimensions.length}
                onChange={(e) => onDimensionsChange({ ...packageDimensions, length: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <Label className="text-xs">Width (in)</Label>
              <Input
                type="number"
                min="1"
                value={packageDimensions.width}
                onChange={(e) => onDimensionsChange({ ...packageDimensions, width: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <Label className="text-xs">Height (in)</Label>
              <Input
                type="number"
                min="1"
                value={packageDimensions.height}
                onChange={(e) => onDimensionsChange({ ...packageDimensions, height: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>
          <Button variant="default" size="sm" className="mt-3" onClick={fetchRates} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Calculate Rates
          </Button>
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
          <span className="ml-2 text-muted-foreground">Fetching shipping rates...</span>
        </div>
      ) : rates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">Enter package details above and click "Calculate Rates" to see available shipping options.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select a shipping service:
          </p>
          <div className="grid gap-2">
            {[...rates].sort((a, b) => a.total_charge - b.total_charge).map((rate) => {
              const isSelected = selectedRate?.service_type === rate.service_type;
              
              return (
                <Card
                  key={rate.service_type}
                  onClick={() => !creatingLabel && setSelectedRate(rate)}
                  className={`transition-all cursor-pointer hover:border-primary/50 ${
                    isSelected 
                      ? 'border-2 border-primary bg-primary/5' 
                      : 'hover:bg-muted/50'
                  } ${creatingLabel ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                      
                      {/* Rate details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{rate.service_name || rate.service_type}</p>
                        {rate.transit_days && (
                          <p className="text-xs text-muted-foreground">{rate.transit_days} business days</p>
                        )}
                      </div>
                      
                      {/* Price */}
                      <span className="font-bold text-primary flex-shrink-0">
                        <FinancialGuard kind="revenue">{formatCurrency(rate.total_charge)}</FinancialGuard>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          
          {/* Create Label Button */}
          <Button 
            className="w-full" 
            size="lg"
            disabled={!selectedRate || creatingLabel}
            onClick={handleCreateLabel}
          >
            {creatingLabel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating Label...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4 mr-2" />
                Create Label
              </>
            )}
          </Button>
          
          {/* Progress indicator when creating */}
          {creatingLabel && (
            <div className="space-y-2">
              <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="absolute inset-0 bg-primary/30" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
              </div>
              <p className="text-xs text-muted-foreground text-center">Creating shipping label...</p>
            </div>
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
              Unable to Get Shipping Rates
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>We couldn't retrieve shipping rates from FedEx.</p>
                
                {fedexError && (
                  <div className="bg-muted p-3 rounded-md text-sm space-y-2">
                    <p><strong>Error:</strong> {fedexError.error}</p>
                    {fedexError.error_code && fedexError.error_code !== 'UNKNOWN_ERROR' && (
                      <p><strong>Code:</strong> {fedexError.error_code}</p>
                    )}
                    <p><strong>Suggestion:</strong> {fedexError.hint}</p>
                    {fedexError.environment && fedexError.environment !== 'unknown' && (
                      <p className="text-xs text-muted-foreground">
                        Environment: {fedexError.environment.toUpperCase()}
                      </p>
                    )}
                  </div>
                )}
                
                <p className="text-sm text-muted-foreground">
                  This could be due to invalid address information, FedEx service temporarily unavailable, or network connectivity issues.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDialog}>
              Try Again Later
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
