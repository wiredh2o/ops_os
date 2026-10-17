import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, Circle, Truck, FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CarrierInfo {
  id: string;
  name: string;
  available: boolean;
  isMock: boolean;
}

interface CarrierSelectorProps {
  selectedCarrier: string | null;
  onCarrierSelect: (carrierId: string, isMock: boolean) => void;
  preferredCarrier?: string;
}

const CARRIER_LOGOS: Record<string, { bg: string; text: string }> = {
  fedex: { bg: 'bg-[#4D148C]', text: 'text-white' },
  ups: { bg: 'bg-[#351C15]', text: 'text-[#FFB500]' },
  usps: { bg: 'bg-[#004B87]', text: 'text-white' },
};

export function CarrierSelector({ 
  selectedCarrier, 
  onCarrierSelect,
  preferredCarrier,
}: CarrierSelectorProps) {
  const [carriers, setCarriers] = useState<CarrierInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCarriers();
  }, []);

  // Auto-select preferred carrier or first available
  useEffect(() => {
    if (!selectedCarrier && carriers.length > 0 && !loading) {
      const available = carriers.filter(c => c.available);
      
      // Check for preferred carrier (case-insensitive match)
      if (preferredCarrier) {
        const preferred = available.find(
          c => c.name.toLowerCase() === preferredCarrier.toLowerCase() ||
               c.id.toLowerCase() === preferredCarrier.toLowerCase()
        );
        if (preferred) {
          onCarrierSelect(preferred.id, preferred.isMock);
          return;
        }
      }
      
      // Default to first available (prefer non-mock)
      const realCarrier = available.find(c => !c.isMock);
      if (realCarrier) {
        onCarrierSelect(realCarrier.id, realCarrier.isMock);
      } else if (available.length > 0) {
        onCarrierSelect(available[0].id, available[0].isMock);
      }
    }
  }, [carriers, loading, selectedCarrier, preferredCarrier]);

  const loadCarriers = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.functions.invoke('get-available-carriers');

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (data?.carriers) {
        setCarriers(data.carriers.filter((c: CarrierInfo) => c.available));
      }
    } catch (err: any) {
      console.error('Error loading carriers:', err);
      setError(err.message);
      // Fallback to showing FedEx only if API fails
      setCarriers([{ id: 'fedex', name: 'FedEx', available: true, isMock: false }]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading carriers...</span>
      </div>
    );
  }

  if (carriers.length === 0) {
    return (
      <Card className="border-destructive/50 bg-destructive/10">
        <CardContent className="py-4 text-center">
          <p className="text-destructive">No shipping carriers available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Select Carrier</h3>
      </div>
      
      <div className="grid gap-2">
        {carriers.map((carrier) => {
          const isSelected = selectedCarrier === carrier.id;
          const colors = CARRIER_LOGOS[carrier.id] || { bg: 'bg-muted', text: 'text-foreground' };

          return (
            <Card
              key={carrier.id}
              onClick={() => onCarrierSelect(carrier.id, carrier.isMock)}
              className={cn(
                'transition-all cursor-pointer hover:border-primary/50',
                isSelected 
                  ? 'border-2 border-primary bg-primary/5' 
                  : 'hover:bg-muted/50'
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
                  
                  {/* Carrier logo/badge */}
                  <div className={cn(
                    'px-3 py-1 rounded font-bold text-sm',
                    colors.bg,
                    colors.text
                  )}>
                    {carrier.name}
                  </div>
                  
                  {/* Mock indicator */}
                  {carrier.isMock && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1 border-amber-500 text-amber-600 dark:text-amber-400">
                      <FlaskConical className="h-3 w-3" />
                      Sandbox
                    </Badge>
                  )}

                  {/* Preferred indicator */}
                  {preferredCarrier?.toLowerCase() === carrier.name.toLowerCase() && (
                    <Badge variant="secondary" className="text-xs">
                      Preferred
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-muted-foreground">
          Note: Some carriers may not be available. {error}
        </p>
      )}
    </div>
  );
}
