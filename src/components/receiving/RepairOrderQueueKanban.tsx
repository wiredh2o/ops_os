import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, PackageSearch, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { InboundPackageCard, InboundPackage, RepairItemSummary } from "./InboundPackageCard";
import { filterRepairQueuePackages } from "@/lib/repair-queue-filter";
import { isRepairPackageArchived, matchesArchiveFilter } from '@/lib/queue-lifecycle';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const sortItemsByNumber = (items: RepairItemSummary[]) => [...items].sort((a, b) => {
  const orderDifference = (a.unboxing_order ?? Number.MAX_SAFE_INTEGER) - (b.unboxing_order ?? Number.MAX_SAFE_INTEGER);
  return orderDifference !== 0 ? orderDifference : a.id.localeCompare(b.id);
});

const sortPackagesNewestFirst = (packages: InboundPackage[]) => [...packages].sort((a, b) => {
  const dateDifference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  return dateDifference !== 0 ? dateDifference : a.id.localeCompare(b.id);
});

export const RepairOrderQueueKanban: React.FC<{ fullWidth?: boolean }> = ({ fullWidth = false }) => {
  const [packages, setPackages] = useState<InboundPackage[]>([]);
  const [itemsByPackage, setItemsByPackage] = useState<Record<string, RepairItemSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(null);
  const [view, setView] = useState('active');
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('all');
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
          id, tracking_number, status, intake_notes, item_count, created_at, received_at, initiated_via, company_id, shipping_preference, assigned_tray,
          company:companies(id, name, phone, email, owners_name)
        `)
        .eq("initiated_via", "repair")
        .not("company_id", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      console.log("RepairOrderQueueKanban: Packages fetched:", pkgs?.length);

      // Don't set packages here - we'll filter them after fetching items

      const pkgIds = (pkgs || []).map(p => p.id);
      if (pkgIds.length === 0) {
        setItemsByPackage({});
        setPackages([]);
        return;
      }

      const { data: links, error: linkErr } = await supabase
        .from("inbound_package_items")
        .select("package_id, repair_item_id, unboxing_order")
        .in("package_id", pkgIds as string[]);
      if (linkErr) throw linkErr;
      console.log("RepairOrderQueueKanban: Package items links fetched:", links?.length);

      const itemIds = Array.from(new Set((links || []).map(link => link.repair_item_id).filter((id): id is string => Boolean(id))));
      const grouped: Record<string, RepairItemSummary[]> = {};
      const [directResult, linkedResult] = await Promise.all([
        supabase.from('repair_items').select('*').in('package_id', pkgIds),
        itemIds.length ? supabase.from('repair_items').select('*').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (directResult.error) throw directResult.error;
      if (linkedResult.error) throw linkedResult.error;
      const allItems = [...new Map([...(directResult.data || []), ...(linkedResult.data || [])].map(item => [item.id, item])).values()];
      for (const pkg of pkgs || []) {
        const packageLinks = (links || []).filter(link => link.package_id === pkg.id);
        grouped[pkg.id] = sortItemsByNumber(allItems.filter(item => item.package_id === pkg.id || packageLinks.some(link => link.repair_item_id === item.id)).map(item => ({
          ...item,
          total_hours: item.total_accumulated_hours || 0,
          unboxing_order: packageLinks.find(link => link.repair_item_id === item.id)?.unboxing_order ?? undefined,
        })));
      }
      setPackages(sortPackagesNewestFirst((pkgs || []).map(pkg => ({ ...pkg, status: pkg.status || 'in_transit' }))));

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
    
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.packageId) setExpandedPackageId(detail.packageId);
      fetchData();
    };
    const events = ['repair-item-updated', 'repair-item-added', 'repair-item-deleted', 'package-updated', 'refresh-package-data', 'package-deleted', 'items-added-to-package'];
    events.forEach(name => window.addEventListener(name, handleRefresh));

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
      events.forEach(name => window.removeEventListener(name, handleRefresh));
      supabase.removeChannel(channel);
    };
  }, []);

  const activePackages = filterRepairQueuePackages(packages, itemsByPackage);
  const archivedPackages = packages.filter(pkg => isRepairPackageArchived(pkg, itemsByPackage[pkg.id] || []));
  const customers = [...new Map(archivedPackages.map(pkg => [pkg.company_id, pkg.company?.name || 'Unknown customer'])).entries()];
  const displayedPackages = view === 'active' ? activePackages : archivedPackages.filter(pkg => matchesArchiveFilter(pkg.company_id, customer, search, [pkg.company?.name, pkg.tracking_number, pkg.intake_notes, ...(itemsByPackage[pkg.id] || []).flatMap(item => [item.item_name, item.serial_number, item.mac_address])]));
  const count = displayedPackages.length;

  return (
    <Card className={`min-h-[400px] ${fullWidth ? "w-full" : "lg:w-1/5"} border-2 border-muted-foreground/40`}>
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
        <Tabs value={view} onValueChange={setView}><TabsList className="w-full"><TabsTrigger value="active">Active</TabsTrigger><TabsTrigger value="archive"><Archive className="mr-1 h-4 w-4" />Archive</TabsTrigger></TabsList></Tabs>
        {view === 'archive' && <div className="space-y-2">
          <Input aria-label="Search repair archive" placeholder="Search archive…" value={search} onChange={event => setSearch(event.target.value)} />
          <Select value={customer} onValueChange={setCustomer}><SelectTrigger aria-label="Repair archive customer"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All customers</SelectItem>{customers.map(([id, name]) => id && <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
        </div>}
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <PackageSearch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{view === 'archive' ? 'No matching archived packages' : 'No repair orders'}</h3>
            <p className="text-muted-foreground">Repair orders will appear here</p>
          </div>
        ) : (
          displayedPackages.map((pkg) => (
            <div key={pkg.id} onClick={(e) => e.stopPropagation()}>
              <InboundPackageCard 
                pkg={pkg}
                archived={view === 'archive'} 
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
