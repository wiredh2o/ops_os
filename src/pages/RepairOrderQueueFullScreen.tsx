import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft, Package, Wrench, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { InboundPackageCard, InboundPackage, RepairItemSummary } from "@/components/receiving/InboundPackageCard";
import { RepairItemCard } from "@/components/receiving/RepairItemCard";
import { RepairItemTable } from "@/components/receiving/RepairItemTable";
import { CreateRepairShipmentModal } from "@/components/receiving/CreateRepairShipmentModal";
import { filterRepairQueuePackages } from "@/lib/repair-queue-filter";
import { useNavigate } from "react-router-dom";

const sortItemsByNumber = (items: RepairItemSummary[]) => [...items].sort((a, b) => {
  const orderDifference = (a.unboxing_order ?? Number.MAX_SAFE_INTEGER) - (b.unboxing_order ?? Number.MAX_SAFE_INTEGER);
  return orderDifference !== 0 ? orderDifference : a.id.localeCompare(b.id);
});

const sortPackagesNewestFirst = (packages: InboundPackage[]) => [...packages].sort((a, b) => {
  const dateDifference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  return dateDifference !== 0 ? dateDifference : a.id.localeCompare(b.id);
});

export const RepairOrderQueueFullScreen: React.FC = () => {
  const [packages, setPackages] = useState<InboundPackage[]>([]);
  const [packagesWithCompletedItems, setPackagesWithCompletedItems] = useState<Set<string>>(new Set());
  const [packageCompanyMap, setPackageCompanyMap] = useState<Record<string, { id: string | null; name: string }>>({});
  const [itemsByPackage, setItemsByPackage] = useState<Record<string, RepairItemSummary[]>>({});
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const selectedPackageItems = useMemo(() => {
    return selectedPackageId ? (itemsByPackage[selectedPackageId] || []) : [];
  }, [selectedPackageId, itemsByPackage]);

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log("RepairOrderQueueFullScreen: Starting data fetch at", new Date().toISOString());
      
      const { data: pkgs, error } = await supabase
        .from("inbound_packages")
        .select(`
          id, tracking_number, status, intake_notes, item_count, created_at, received_at, initiated_via, company_id, shipping_preference,
          company:companies(id, name, phone, email, owners_name)
        `)
        .eq("initiated_via", "repair")
        .order("created_at", { ascending: false });

      if (error) throw error;
      console.log("RepairOrderQueueFullScreen: Packages fetched:", pkgs?.length);

      const formattedPackages = (pkgs || []).map(p => ({
        id: p.id as string,
        tracking_number: p.tracking_number as string,
        status: (p.status as string) || "in_transit",
        intake_notes: (p.intake_notes as string | null) ?? null,
        item_count: (p.item_count as number | null) ?? null,
        created_at: p.created_at as string,
        received_at: (p.received_at as string | null) ?? null,
        shipping_preference: (p.shipping_preference as string) || 'ship_complete',
        company: p.company ? {
          name: p.company.name as string,
          phone: p.company.phone as string | null,
          email: p.company.email as string | null,
          owners_name: p.company.owners_name as string | null,
        } : null,
      }));

      // Build company map for each package
      const companyMap: Record<string, { id: string | null; name: string }> = {};
      (pkgs || []).forEach(p => {
        companyMap[p.id] = {
          id: p.company_id || null,
          name: p.company?.name || 'Unknown Company'
        };
      });

      const pkgIds = (pkgs || []).map(p => p.id);
      if (pkgIds.length === 0) {
        setItemsByPackage({});
        return;
      }

      const { data: links, error: linkErr } = await supabase
        .from("inbound_package_items")
        .select("package_id, repair_item_id, unboxing_order")
        .in("package_id", pkgIds as string[]);
      if (linkErr) throw linkErr;

      const itemIds = Array.from(new Set((links || []).map(l => l.repair_item_id)));
      
      // Initialize grouped items map (will be populated if we have items)
      let grouped: Record<string, RepairItemSummary[]> = {};

      // Only fetch repair items if we have item IDs
      if (itemIds.length > 0) {
        // Fetch repair items with their total hours
        const repairItemPromises = itemIds.map(async (itemId) => {
          const { data: itemResult } = await supabase
            .from("repair_items")
            .select("id, item_name, serial_number, mac_address, status, problem_reported, diagnosis, repairability, diagnosis_assessment, completion_outcome, estimated_cost, total_accumulated_hours")
            .eq("id", itemId)
            .single();
          
          return {
            ...itemResult,
            total_hours: itemResult.total_accumulated_hours || 0
          };
        });

        const repairItems = await Promise.all(repairItemPromises);

        const itemsMap: Record<string, RepairItemSummary> = {};
        (repairItems || []).forEach((ri: any) => {
          if (ri && ri.id) {
            itemsMap[ri.id] = {
              id: ri.id,
              item_name: ri.item_name,
              serial_number: ri.serial_number,
              mac_address: ri.mac_address,
              status: ri.status,
              problem_reported: ri.problem_reported,
              diagnosis: ri.diagnosis,
              repairability: ri.repairability,
              diagnosis_assessment: ri.diagnosis_assessment,
              completion_outcome: ri.completion_outcome,
              estimated_cost: ri.estimated_cost,
              total_hours: ri.total_hours || 0,
            };
          }
        });

        (links || []).forEach((l: any) => {
          const item = itemsMap[l.repair_item_id];
          if (!item) return;
          const itemWithOrder = { ...item, unboxing_order: l.unboxing_order, package_id: l.package_id };
          const arr = grouped[l.package_id] || [];
          arr.push(itemWithOrder);
          grouped[l.package_id] = arr;
        });

        // Sort items by unboxing_order within each package
        Object.keys(grouped).forEach(packageId => {
          grouped[packageId] = sortItemsByNumber(grouped[packageId]);
        });
      }

      // Filter to show packages with incomplete items OR packages that need unboxing
      const relevantPackages = sortPackagesNewestFirst(filterRepairQueuePackages(formattedPackages, grouped));


      // Track which packages have completed items with actuals (for Create Shipment button)
      const completedPackages = new Set<string>();
      for (const pkg of formattedPackages) {
        const items = grouped[pkg.id] || [];
        const hasCompletedItems = items.some(item => item.status === 'completed');
        if (hasCompletedItems) {
          // Check if any completed items have actuals
          const completedItemIds = items.filter(i => i.status === 'completed').map(i => i.id);
          if (completedItemIds.length > 0) {
            const { data: actuals } = await supabase
              .from('repair_item_actuals')
              .select('id')
              .in('repair_item_id', completedItemIds)
              .limit(1);
            if (actuals && actuals.length > 0) {
              completedPackages.add(pkg.id);
            }
          }
        }
      }
      setPackagesWithCompletedItems(completedPackages);

      setPackages(relevantPackages);
      setPackageCompanyMap(companyMap);

      // Auto-select first package if none selected or if current selection is no longer in filtered list
      if ((!selectedPackageId || !relevantPackages.find(p => p.id === selectedPackageId)) && relevantPackages.length > 0) {
        setSelectedPackageId(relevantPackages[0].id);
      }

      setItemsByPackage(grouped);
    } catch (e: any) {
      console.error("RepairOrderQueueFullScreen: Error fetching data:", e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen for custom events from child components
    const handleRepairItemUpdate = async (event: any) => {
      console.log("RepairOrderQueueFullScreen: Custom event received - repair item updated", event.detail);
      fetchData(); // Simple full refresh for now
    };

    const handlePackageUpdate = async (event: any) => {
      console.log("RepairOrderQueueFullScreen: Package update event received", event.detail);
      fetchData(); // Simple full refresh for now
    };

    window.addEventListener('repair-item-updated', handleRepairItemUpdate);
    window.addEventListener('repair-item-added', handleRepairItemUpdate);
    window.addEventListener('package-updated', handlePackageUpdate);
    window.addEventListener('refresh-package-data', handleRepairItemUpdate);
    window.addEventListener('package-deleted', handleRepairItemUpdate);

    const channel = supabase
      .channel("repair-order-queue-fullscreen-realtime", {
        config: {
          broadcast: { self: true },
        },
      })
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "inbound_packages",
        filter: "initiated_via=eq.repair"
      }, () => fetchData())
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "inbound_package_items" 
      }, () => fetchData())
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "repair_items" 
      }, () => fetchData())
      .subscribe();

    return () => {
      window.removeEventListener('repair-item-updated', handleRepairItemUpdate);
      window.removeEventListener('repair-item-added', handleRepairItemUpdate);
      window.removeEventListener('package-updated', handlePackageUpdate);
      window.removeEventListener('refresh-package-data', handleRepairItemUpdate);
      window.removeEventListener('package-deleted', handleRepairItemUpdate);
      supabase.removeChannel(channel);
    };
  }, [toast]);

  const handlePackageSelect = (packageId: string) => {
    setSelectedPackageId(packageId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading repair order queue...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold">Repair Order Queue</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {selectedPackageId && packagesWithCompletedItems.has(selectedPackageId) && (
            <Button
              size="sm"
              onClick={() => setShipmentModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Truck className="h-4 w-4" />
              Create Shipment
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-rows-[40%_60%] gap-6 h-[calc(100vh-80px)]">
        {/* Top Section - Packages */}
        <div className="rounded-t-xl border-2 border-b-0 border-blue-200 dark:border-blue-800 bg-gradient-to-b from-blue-50/60 to-blue-100/40 dark:from-blue-950/40 dark:to-blue-900/60 shadow-lg">
          <div className="p-4">
            <div className="bg-blue-500/10 dark:bg-blue-400/10 backdrop-blur-sm rounded-lg px-4 py-3 mb-4 shadow-sm border border-blue-200 dark:border-blue-700 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200">Packages ({packages.length})</h2>
            </div>
            <div className="overflow-y-auto max-h-[calc(40vh-120px)] space-y-4">
              {packages.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center text-muted-foreground">
                      No repair orders found
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className={`cursor-pointer transition-all ${
                        selectedPackageId === pkg.id 
                          ? 'ring-2 ring-primary ring-offset-2' 
                          : 'hover:shadow-md'
                      }`}
                      onClick={() => handlePackageSelect(pkg.id)}
                    >
                      <InboundPackageCard
                        pkg={pkg}
                        items={itemsByPackage[pkg.id] || []}
                        shouldExpand={false}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section - Selected Package Items */}
        <div className="rounded-b-xl border-2 border-t-0 border-orange-200 dark:border-orange-800 bg-gradient-to-b from-orange-50/30 to-amber-50/20 dark:from-orange-950/20 dark:to-amber-900/30 shadow-xl">
          <div className="p-4">
            <div className="bg-orange-500/10 dark:bg-orange-400/10 backdrop-blur-sm rounded-lg px-4 py-3 mb-4 shadow-sm border border-orange-200 dark:border-orange-700 flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <h2 className="text-lg font-semibold text-orange-800 dark:text-orange-200">
                {selectedPackageId ? (
                  `Items (${selectedPackageItems.length}) - Package ${packages.find(p => p.id === selectedPackageId)?.tracking_number?.slice(-6) || 'Unknown'}`
                ) : (
                  'Items - Select a package above'
                )}
              </h2>
            </div>
            <div className="overflow-y-auto max-h-[calc(60vh-120px)]">
              {!selectedPackageId ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center text-muted-foreground">
                      Select a package above to view its items
                    </div>
                  </CardContent>
                </Card>
              ) : selectedPackageItems.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center text-muted-foreground">
                      No items found for selected package
                    </div>
                  </CardContent>
                </Card>
              ) : (
                // Conditional rendering based on screen size
                isMobile ? (
                  <div className="space-y-4">
                    {selectedPackageItems.map((item) => (
                      <RepairItemCard
                        key={item.id}
                        item={item}
                        packageId={selectedPackageId}
                      />
                    ))}
                  </div>
                ) : (
                  <RepairItemTable
                    items={selectedPackageItems}
                    packageId={selectedPackageId}
                  />
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Shipment Modal */}
      {selectedPackageId && (
        <CreateRepairShipmentModal
          isOpen={shipmentModalOpen}
          onClose={() => setShipmentModalOpen(false)}
          packageId={selectedPackageId}
          companyId={packageCompanyMap[selectedPackageId]?.id || null}
          companyName={packageCompanyMap[selectedPackageId]?.name || 'Unknown'}
          trackingNumber={packages.find(p => p.id === selectedPackageId)?.tracking_number || ''}
        />
      )}
    </div>
  );
};