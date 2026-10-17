import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, RefreshCw, Package, Zap, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InventoryItem {
  id: string;
  sku: string;
  quantity_on_hand: number;
  reorder_point: number;
  lead_time_days: number;
  minimum_order_quantity: number;
}

interface LeanPullAnalytics {
  item_id: string;
  reorder_point: number;
  demand_rate: number;
  safety_stock: number;
  recommended_order_qty: number;
  moq_coverage_days?: number;
  sku: string;
  quantity_on_hand: number;
  lead_time_days: number;
  minimum_order_quantity: number;
}

interface DemandAnalyticsProps {
  inventoryItemId?: string;
}

export const DemandAnalytics: React.FC<DemandAnalyticsProps> = ({ inventoryItemId }) => {
  const [analytics, setAnalytics] = useState<LeanPullAnalytics[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const { toast } = useToast();

  const fetchLeanPullAnalytics = async () => {
    setLoading(true);
    try {
      // Get all inventory items with their current LEAN pull calculations
      let query = supabase
        .from('inventory_items')
        .select('id, sku, quantity_on_hand, reorder_point, lead_time_days, minimum_order_quantity')
        .order('sku');

      if (inventoryItemId) {
        query = query.eq('id', inventoryItemId);
      }

      const { data: items, error: itemsError } = await query;

      if (itemsError) throw itemsError;

      const analyticsData: LeanPullAnalytics[] = [];

      for (const item of items || []) {
        const { data: analysisData, error: analysisError } = await supabase
          .rpc('calculate_lean_pull_reorder_point', {
            item_id: item.id,
            lead_time_days: item.lead_time_days || 30,
            minimum_order_quantity: item.minimum_order_quantity || 1
          });

        if (analysisError) {
          console.error(`Error calculating for ${item.sku}:`, analysisError);
          continue;
        }

        if (analysisData && analysisData.length > 0) {
          const analysis = analysisData[0];
          analyticsData.push({
            item_id: item.id,
            sku: item.sku,
            quantity_on_hand: item.quantity_on_hand,
            lead_time_days: item.lead_time_days || 30,
            minimum_order_quantity: item.minimum_order_quantity || 1,
            reorder_point: analysis.reorder_point,
            demand_rate: analysis.demand_rate,
            safety_stock: analysis.safety_stock,
            recommended_order_qty: analysis.recommended_order_qty,
            moq_coverage_days: analysis.moq_coverage_days
          });
        }
      }

      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error fetching LEAN pull analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load LEAN pull analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const runLeanPullCalculation = async () => {
    setCalculating(true);
    try {
      const { data, error } = await supabase.rpc('calculate_lean_pull_reorder_points');
      
      if (error) throw error;
      
      toast({
        title: "Calculation Complete",
        description: data,
      });
      
      // Refresh the analytics after calculation
      await fetchLeanPullAnalytics();
    } catch (error) {
      console.error('Error running LEAN pull calculation:', error);
      toast({
        title: "Error",
        description: "Failed to run LEAN pull calculation",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  };

  useEffect(() => {
    fetchLeanPullAnalytics();
  }, [inventoryItemId]);

  const getPullStatus = (onHand: number, reorderPoint: number) => {
    if (onHand <= 0) {
      return { status: 'Out of Stock', color: 'destructive', icon: Package };
    } else if (onHand <= reorderPoint) {
      return { status: 'Pull Triggered', color: 'secondary', icon: Zap };
    } else {
      return { status: 'Stock OK', color: 'default', icon: Package };
    }
  };

  const getMOQStatus = (recommendedQty: number, moq: number, moqCoverage?: number) => {
    if (recommendedQty > moq) {
      return { status: 'Natural Order Qty', color: 'default', coverage: false };
    } else {
      const coverageDays = moqCoverage || 0;
      if (coverageDays > 180) {
        return { status: `MOQ Applied (${Math.round(coverageDays)} days)`, color: 'secondary', coverage: true };
      } else {
        return { status: `MOQ Applied (${Math.round(coverageDays)} days)`, color: 'default', coverage: true };
      }
    }
    return { status: 'Natural Order Qty', color: 'default', coverage: false };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">LEAN Pull Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Statistical safety stock and demand-driven reorder points
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchLeanPullAnalytics}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={runLeanPullCalculation}
            disabled={calculating}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {calculating ? 'Calculating...' : 'Run Calculation'}
          </Button>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {analytics.map((item) => {
          const pullStatus = getPullStatus(item.quantity_on_hand, item.reorder_point);
          const moqStatus = getMOQStatus(
            item.recommended_order_qty, 
            item.minimum_order_quantity, 
            item.moq_coverage_days
          );
          const StatusIcon = pullStatus.icon;

          return (
            <Card key={item.item_id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{item.sku}</CardTitle>
                    <CardDescription>
                      Lead Time: {item.lead_time_days} days | MOQ: {item.minimum_order_quantity}
                    </CardDescription>
                  </div>
                  <StatusIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Demand Rate */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Daily Demand Rate:</span>
                  <Badge variant="outline">{item.demand_rate.toFixed(2)}/day</Badge>
                </div>

                {/* Safety Stock */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Safety Stock:</span>
                  <span className="text-sm">{Math.round(item.safety_stock)}</span>
                </div>

                {/* Current Status */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">On Hand:</span>
                    <Badge variant={pullStatus.color as any}>
                      {item.quantity_on_hand}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Reorder Point:</span>
                    <span className="text-sm">{item.reorder_point}</span>
                  </div>
                </div>

                {/* Pull Status */}
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Pull Status:</span>
                    <Badge variant={pullStatus.color as any}>
                      {pullStatus.status}
                    </Badge>
                  </div>
                  
                  {item.quantity_on_hand <= item.reorder_point && (
                    <Alert className="mt-2">
                      <ShoppingCart className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          <div className="font-medium">Recommended Order: {item.recommended_order_qty} units</div>
                          <div className="text-sm">
                            <Badge variant={moqStatus.color as any} className="mr-2">
                              {moqStatus.status}
                            </Badge>
                            {moqStatus.coverage && item.moq_coverage_days && item.moq_coverage_days > 90 && (
                              <span className="text-xs text-muted-foreground">
                                (Extended coverage due to MOQ)
                              </span>
                            )}
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading LEAN pull analytics...</p>
        </div>
      )}

      {!loading && analytics.length === 0 && (
        <div className="text-center py-8">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No inventory items found</p>
        </div>
      )}
    </div>
  );
};