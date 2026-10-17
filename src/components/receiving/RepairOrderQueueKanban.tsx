import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { InboundPackageCard, InboundPackage, RepairItemSummary } from "./InboundPackageCard";
import { filterRepairQueuePackages } from "@/lib/repair-queue-filter";

const sortItemsByNumber = (items: RepairItemSummary[]) => [...items].sort((a, b) => {
  const orderDifference = (a.unboxing_order ?? Number.MAX_SAFE_INTEGER) - (b.unboxing_order ?? Number.MAX_SAFE_INTEGER);
  return orderDifference !== 0 ? orderDifference : a.id.localeCompare(b.id);
});

const sortPackagesNewestFirst = (packages: InboundPackage[]) => [...packages].sort((a, b) => {
  const dateDifference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  return dateDifference !== 0 ? dateDifference : a.id.localeCompare(b.id);
});

export const RepairOrderQueueKanban: React.FC = () => {
  const [packages, setPackages] = useState<InboundPackage[]>([]);
  const [itemsByPackage, setItemsByPackage] = useState<Record<string, RepairItemSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleNavigateToFullQueue = () => {
    navigate('/repair-queue');
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log("RepairOrderQueueKanban: Starting data fetch at", new Date().toISOString());
      
      const { data: pkgs, error } = await supabase
        .from("inbound_packages")
        .select(`
          id, tracking_number, status, intake_notes, item_count, created_at, received_at, initiated_via, company_id, shipping_preference,
          company:companies(id, name, phone, email, owners_name)
        `)
        .eq("initiated_via", "repair")
        .order("created_at", { ascending: false });

      if (error) throw error;
      console.log("RepairOrderQueueKanban: Packages fetched:", pkgs?.length);

      // Don't set packages here - we'll filter them after fetching items

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
      console.log("RepairOrderQueueKanban: Package items links fetched:", links?.length);

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
        console.log("RepairOrderQueueKanban: Repair items fetched:", repairItems?.length);
        console.log("RepairOrderQueueKanban: Repair items data:", repairItems);

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
          const itemWithOrder = { ...item, unboxing_order: l.unboxing_order };
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
      const relevantPackages = filterRepairQueuePackages(pkgs || [], grouped);


      // Update packages to show those with incomplete items or needing unboxing
      setPackages(sortPackagesNewestFirst(relevantPackages.map(p => ({
        id: p.id as string,
        tracking_number: p.tracking_number as string,
        status: (p.status as string) || "in_transit",
        intake_notes: (p.intake_notes as string | null) ?? null,
        item_count: (p.item_count as number | null) ?? null,
        created_at: p.created_at as string,
        received_at: (p.received_at as string | null) ?? null,
        company_id: (p as any).company_id || null,
        shipping_preference: (p as any).shipping_preference || 'ship_complete',
        company: p.company ? {
          name: p.company.name as string,
          phone: p.company.phone as string | null,
          email: p.company.email as string | null,
          owners_name: p.company.owners_name as string | null,
        } : null,
      }))));

      console.log("RepairOrderQueueKanban: Setting new items by package:", grouped);
      setItemsByPackage(grouped);
      console.log("RepairOrderQueueKanban: Data fetch completed at", new Date().toISOString());
    } catch (e: any) {
      console.error("RepairOrderQueueKanban: Error fetching data:", e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // No more smart refresh - timer updates are handled in modals

    // Listen for custom events from child components
    const handleRepairItemUpdate = async (event: any) => {
      console.log("RepairOrderQueueKanban: Custom event received - repair item updated", event.detail);
      const { packageId, itemId } = event.detail;
      
      if (packageId && itemId) {
        console.log("RepairOrderQueueKanban: Updating specific item", itemId, "in package", packageId);
        
        // Fetch only the updated repair item with total hours
        const { data: itemResult } = await supabase
          .from("repair_items")
          .select("id, item_name, serial_number, mac_address, status, problem_reported, diagnosis, repairability, diagnosis_assessment, completion_outcome, estimated_cost, total_accumulated_hours")
          .eq("id", itemId)
          .maybeSingle();
        
        const updatedItem = itemResult ? {
          ...itemResult,
          total_hours: itemResult.total_accumulated_hours || 0
        } : null;
        const error = itemResult ? null : new Error('Item not found');
        
        console.log(`RepairOrderQueueKanban: Fresh data from DB for item ${itemId}:`, updatedItem);
        console.log(`RepairOrderQueueKanban: Total hours from DB: ${updatedItem?.total_hours}`);
          
        if (!error && updatedItem) {
          console.log("RepairOrderQueueKanban: Updated item data:", updatedItem);
          
          // Update only the specific item in the state
          setItemsByPackage(prev => {
            const packageItems = prev[packageId] || [];
            const oldItem = packageItems.find(item => item.id === itemId);
            console.log(`RepairOrderQueueKanban: Old item total_hours: ${oldItem?.total_hours}, New total_hours: ${updatedItem.total_hours}`);
            
            const updatedItems = sortItemsByNumber(packageItems.map(item =>
              item.id === itemId ? { ...item, ...updatedItem, total_hours: updatedItem.total_hours ?? 0 } : item
            ));
            
            return {
              ...prev,
              [packageId]: updatedItems
            };
          });
          
          // Set expansion for this package
          setExpandedPackageId(packageId);
          console.log("RepairOrderQueueKanban: Updated item and set expansion for package", packageId);
        } else {
          console.error("RepairOrderQueueKanban: Failed to fetch updated item:", error);
          // Fallback to full refresh if individual item fetch fails
          fetchData();
        }
      } else {
        console.log("RepairOrderQueueKanban: Missing packageId or itemId, doing full refresh");
        fetchData();
      }
    };

    // Listen for package update events
    const handlePackageUpdate = async (event: any) => {
      console.log("RepairOrderQueueKanban: Package update event received", event.detail);
      const { packageId } = event.detail;
      
      if (packageId) {
        console.log("RepairOrderQueueKanban: Updating specific package", packageId);
        
        // Fetch only the updated package
        const { data: updatedPackage, error } = await supabase
          .from("inbound_packages")
          .select(`
            id, tracking_number, status, intake_notes, item_count, created_at, received_at, initiated_via,
            company:companies(name, phone, email, owners_name)
          `)
          .eq("id", packageId)
          .eq("initiated_via", "repair")
          .single();
          
        if (!error && updatedPackage) {
          console.log("RepairOrderQueueKanban: Updated package data:", updatedPackage);
          
          // Update only the specific package in the state
          setPackages(prev => sortPackagesNewestFirst(prev.map(pkg =>
            pkg.id === packageId ? {
              id: updatedPackage.id as string,
              tracking_number: updatedPackage.tracking_number as string,
              status: (updatedPackage.status as string) || "in_transit",
              intake_notes: (updatedPackage.intake_notes as string | null) ?? null,
              item_count: (updatedPackage.item_count as number | null) ?? null,
              created_at: updatedPackage.created_at as string,
              received_at: (updatedPackage.received_at as string | null) ?? null,
              company: updatedPackage.company ? {
                name: updatedPackage.company.name as string,
                phone: updatedPackage.company.phone as string | null,
                email: updatedPackage.company.email as string | null,
                owners_name: updatedPackage.company.owners_name as string | null,
              } : null,
            } : pkg
          )));
          
          console.log("RepairOrderQueueKanban: Updated package in state");
        } else {
          console.error("RepairOrderQueueKanban: Failed to fetch updated package:", error);
          // Fallback to full refresh if package fetch fails
          fetchData();
        }
      } else {
        console.log("RepairOrderQueueKanban: Missing packageId, doing full refresh");
        fetchData();
      }
    };

    // Listen for refresh package data events
    const handleRefreshPackageData = async (event: any) => {
      console.log("RepairOrderQueueKanban: Refresh package data event received", event.detail);
      const { packageId, immediate, smartRefresh } = event.detail;
      
      // Skip refresh if modals are open to prevent interference
      const openModals = document.querySelectorAll('[role="dialog"][data-state="open"]');
      const hasOpenModals = openModals.length > 0;
      
      if (hasOpenModals && !smartRefresh) {
        console.log("RepairOrderQueueKanban: Modals are open, skipping refresh to prevent interference");
        return;
      }
      
      if (packageId) {
        console.log("RepairOrderQueueKanban: Refreshing specific package data", packageId);
        
        const refreshData = async () => {
          // Fetch package items links
          const { data: links, error: linkErr } = await supabase
            .from("inbound_package_items")
            .select("package_id, repair_item_id, unboxing_order")
            .eq("package_id", packageId);
          
          if (linkErr) {
            console.error("RepairOrderQueueKanban: Error fetching package links:", linkErr);
            return;
          }

          const itemIds = (links || []).map(l => l.repair_item_id);
          if (itemIds.length === 0) {
            console.log("RepairOrderQueueKanban: No items for package", packageId);
            setItemsByPackage(prev => ({ ...prev, [packageId]: [] }));
            return;
          }

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
          console.log("RepairOrderQueueKanban: Refreshed repair items for package", packageId, ":", repairItems);

          // Create a map to match repair item IDs with their unboxing_order from links
          const linkMap: Record<string, number> = {};
          (links || []).forEach((l: any) => {
            linkMap[l.repair_item_id] = l.unboxing_order;
          });

          const updatedItems: RepairItemSummary[] = repairItems.map((ri: any) => ({
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
            total_hours: ri.total_hours ?? 0,
            unboxing_order: linkMap[ri.id],
          }));

          setItemsByPackage(prev => ({
            ...prev,
            [packageId]: sortItemsByNumber(updatedItems)
          }));
          
          console.log("RepairOrderQueueKanban: Package data refreshed for", packageId);
        };
        
        // If immediate flag is set, refresh immediately, otherwise add delay
        if (immediate) {
          refreshData();
        } else {
          setTimeout(refreshData, 500); // 500ms delay to ensure database consistency
        }
      }
    };

    // Listen for package deletion events
    const handlePackageDeleted = async (event: any) => {
      console.log("RepairOrderQueueKanban: Package deleted event received", event.detail);
      const { packageId } = event.detail;
      
      if (packageId) {
        console.log("RepairOrderQueueKanban: Removing deleted package", packageId);
        
        // Remove the package from state
        setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
        
        // Remove items for this package
        setItemsByPackage(prev => {
          const updated = { ...prev };
          delete updated[packageId];
          return updated;
        });
        
        console.log("RepairOrderQueueKanban: Package removed from state");
      } else {
        console.log("RepairOrderQueueKanban: Missing packageId, doing full refresh");
        fetchData();
      }
    };

    window.addEventListener('repair-item-updated', handleRepairItemUpdate);
    window.addEventListener('repair-item-added', handleRepairItemUpdate); // Use same handler for added items
    window.addEventListener('package-updated', handlePackageUpdate);
    window.addEventListener('refresh-package-data', handleRefreshPackageData);
    window.addEventListener('package-deleted', handlePackageDeleted);

    const channel = supabase
      .channel("repair-order-queue-realtime", {
        config: {
          broadcast: { self: true },
        },
      })
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "inbound_packages",
        filter: "initiated_via=eq.repair"
      }, (payload) => {
        console.log("RepairOrderQueueKanban: Real-time update - inbound_packages changed:", payload);
        fetchData();
      })
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "inbound_package_items" 
      }, (payload) => {
        console.log("RepairOrderQueueKanban: Real-time update - inbound_package_items changed:", payload);
        fetchData();
      })
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "repair_items" 
      }, (payload) => {
        console.log("RepairOrderQueueKanban: Real-time update - repair_items changed:", payload);
        console.log("RepairOrderQueueKanban: Change event type:", payload.eventType);
        console.log("RepairOrderQueueKanban: Changed record:", payload.new || payload.old);
        fetchData();
      })
      .subscribe((status) => {
        console.log("RepairOrderQueueKanban: Subscription status:", status);
      });

    return () => {
      console.log("RepairOrderQueueKanban: Cleaning up subscriptions");
      window.removeEventListener('repair-item-updated', handleRepairItemUpdate);
      window.removeEventListener('repair-item-added', handleRepairItemUpdate);
      window.removeEventListener('package-updated', handlePackageUpdate);
      window.removeEventListener('refresh-package-data', handleRefreshPackageData);
      window.removeEventListener('package-deleted', handlePackageDeleted);
      supabase.removeChannel(channel);
    };
  }, []);

  const count = packages.length;

  return (
    <Card className="min-h-[400px] lg:w-1/5 border-2 border-muted-foreground/40">
      <CardHeader className="pb-4 cursor-pointer hover:bg-muted/20 transition-colors" onClick={handleNavigateToFullQueue}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-primary" />
            Repair Order Queue
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{count} orders</Badge>
            <Button 
              onClick={(e) => {
                e.stopPropagation();
                fetchData();
              }} 
              variant="outline" 
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Repair orders and their items</p>
      </CardHeader>
      <CardContent 
        className="space-y-2 cursor-pointer" 
        onClick={(e) => {
          // Only navigate if clicking on empty areas (not on package cards)
          if (e.target === e.currentTarget) {
            handleNavigateToFullQueue();
          }
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <PackageSearch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No repair orders</h3>
            <p className="text-muted-foreground">Repair orders will appear here</p>
          </div>
        ) : (
          packages.map((pkg) => (
            <div key={pkg.id} onClick={(e) => e.stopPropagation()}>
              <InboundPackageCard 
                pkg={pkg} 
                items={itemsByPackage[pkg.id] || []} 
                shouldExpand={expandedPackageId === pkg.id}
                onExpanded={() => setExpandedPackageId(null)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
