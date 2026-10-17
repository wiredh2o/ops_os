import { useState, useEffect } from "react";
import { AlertTriangle, Package, RefreshCw, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BackorderSummary {
  inventoryCount: number;
  assemblyCount: number;
  ordersWaiting: number;
  needsOrderCount: number;
  coveredCount: number;
}

export function BackorderAlertWidget() {
  const [summary, setSummary] = useState<BackorderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchBackorderSummary = async () => {
    try {
      // Fetch backordered inventory items
      const { data: inventoryData, error: invError } = await supabase
        .from("inventory_items")
        .select("id, quantity_ats, quantity_on_order")
        .lt("quantity_ats", 0);

      if (invError) throw invError;

      // Fetch backordered assemblies
      const { data: assemblyData, error: asmError } = await supabase
        .from("assemblies")
        .select("id, quantity_ats, quantity_on_order")
        .lt("quantity_ats", 0);

      if (asmError) throw asmError;

      // Fetch orders waiting on stock
      const { data: ordersData, error: ordError } = await supabase
        .from("production_orders")
        .select(`
          id,
          production_order_items!inner (
            inventory_item_id,
            assembly_id,
            inventory_items!left (quantity_ats),
            assemblies!left (quantity_ats)
          )
        `)
        .not("status", "in", '("shipped","cancelled","completed")');

      if (ordError) throw ordError;

      // Calculate orders waiting on stock
      const ordersWaiting = ordersData?.filter(order => 
        order.production_order_items.some((item: any) => 
          (item.inventory_items?.quantity_ats ?? 0) < 0 || 
          (item.assemblies?.quantity_ats ?? 0) < 0
        )
      ).length || 0;

      // Calculate resolution status
      const needsOrder = [
        ...(inventoryData || []).filter(i => (i.quantity_on_order || 0) < Math.abs(i.quantity_ats)),
        ...(assemblyData || []).filter(a => (a.quantity_on_order || 0) < Math.abs(a.quantity_ats))
      ].length;

      const covered = (inventoryData?.length || 0) + (assemblyData?.length || 0) - needsOrder;

      setSummary({
        inventoryCount: inventoryData?.length || 0,
        assemblyCount: assemblyData?.length || 0,
        ordersWaiting,
        needsOrderCount: needsOrder,
        coveredCount: covered
      });
    } catch (error) {
      console.error("Error fetching backorder summary:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackorderSummary();

    // Subscribe to changes
    const channel = supabase
      .channel("backorder-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, fetchBackorderSummary)
      .on("postgres_changes", { event: "*", schema: "public", table: "assemblies" }, fetchBackorderSummary)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleTriggerReorder = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke("manual-calculation-trigger", {
        body: { triggerTTM: false, triggerReorder: true, triggerConsumption: false }
      });

      if (error) throw error;

      toast.success("Reorder calculation completed", {
        description: `Generated ${data?.calculations?.reorder?.result?.purchaseOrdersGenerated || 0} purchase orders and ${data?.calculations?.reorder?.result?.productionOrdersGenerated || 0} production orders`
      });

      // Refresh the summary
      await fetchBackorderSummary();
    } catch (error: any) {
      console.error("Error triggering reorder:", error);
      toast.error("Failed to run reorder calculation", {
        description: error.message
      });
    } finally {
      setTriggering(false);
    }
  };

  // Don't show widget if no backorders
  if (loading) return null;
  if (!summary || (summary.inventoryCount === 0 && summary.assemblyCount === 0)) return null;

  const totalBackordered = summary.inventoryCount + summary.assemblyCount;

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Backorder Alert</h3>
              <p className="text-xs text-muted-foreground">
                {totalBackordered} item{totalBackordered !== 1 ? "s" : ""} with negative availability
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Package className="h-3 w-3" />
                {summary.inventoryCount} inventory
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Package className="h-3 w-3" />
                {summary.assemblyCount} assembly
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              {summary.needsOrderCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {summary.needsOrderCount} need orders
                </Badge>
              )}
              {summary.coveredCount > 0 && (
                <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
                  <CheckCircle className="h-3 w-3" />
                  {summary.coveredCount} covered
                </Badge>
              )}
            </div>

            {summary.ordersWaiting > 0 && (
              <Badge variant="outline" className="gap-1 border-accent text-accent">
                {summary.ordersWaiting} orders waiting
              </Badge>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={handleTriggerReorder}
              disabled={triggering}
              className="gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${triggering ? "animate-spin" : ""}`} />
              {triggering ? "Running..." : "Run Reorder Now"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
