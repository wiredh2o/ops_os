import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanies, Company } from "@/hooks/useCompanies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { PackageX, RefreshCw, Building2, ChevronDown, ChevronUp, Package, Check, ChevronsUpDown } from "lucide-react";
import { BulkPackageAssignmentDialog } from "./BulkPackageAssignmentDialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface RepairItemSummary {
  id: string;
  item_name: string;
  serial_number: string | null;
  mac_address: string | null;
  problem_reported: string | null;
  status: string;
  diagnosis: string | null;
}

interface OrphanedPackage {
  id: string;
  tracking_number: string;
  status: string;
  received_at: string | null;
  created_at: string;
  item_count: number | null;
  intake_notes: string | null;
  category: string | null;
  initiated_via: string | null;
  return_shipping_address: string | null;
  assigned_tray: string | null;
  suggested_company_id: string | null;
  suggested_company_name: string | null;
  repair_items: RepairItemSummary[];
}

export function OrphanedPackagesManager() {
  const [packages, setPackages] = useState<OrphanedPackage[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [individualSearchOpen, setIndividualSearchOpen] = useState<string | null>(null);
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const { toast } = useToast();

  const toggleExpand = (packageId: string) => {
    setExpandedPackages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(packageId)) {
        newSet.delete(packageId);
      } else {
        newSet.add(packageId);
      }
      return newSet;
    });
  };

  const fetchOrphanedPackages = async () => {
    setLoading(true);
    
    // First fetch orphaned packages
    const { data: packageData, error: packageError } = await supabase
      .from("inbound_packages")
      .select(`
        id, 
        tracking_number, 
        status, 
        received_at, 
        created_at, 
        item_count, 
        intake_notes, 
        category, 
        initiated_via, 
        return_shipping_address, 
        assigned_tray
      `)
      .is("company_id", null)
      .order("created_at", { ascending: false });

    if (packageError) {
      toast({
        title: "Error",
        description: "Failed to load orphaned packages",
        variant: "destructive",
      });
      console.error("Error fetching orphaned packages:", packageError);
      setLoading(false);
      return;
    }

    const packageIds = (packageData || []).map(pkg => pkg.id);
    
    // If there are packages, fetch their repair items via junction table
    let repairItemsMap: Record<string, RepairItemSummary[]> = {};
    
    if (packageIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from("inbound_package_items")
        .select(`
          package_id,
          repair_items (
            id, 
            item_name, 
            serial_number, 
            mac_address, 
            problem_reported, 
            status, 
            diagnosis
          )
        `)
        .in("package_id", packageIds);

      if (itemsError) {
        console.error("Error fetching repair items:", itemsError);
      } else if (itemsData) {
        // Group repair items by package_id
        itemsData.forEach((item: any) => {
          if (item.repair_items) {
            if (!repairItemsMap[item.package_id]) {
              repairItemsMap[item.package_id] = [];
            }
            repairItemsMap[item.package_id].push(item.repair_items);
          }
        });
      }
    }

    // Combine packages with their repair items
    const packagesWithItems = (packageData || []).map(pkg => ({
      ...pkg,
      suggested_company_id: null,
      suggested_company_name: null,
      repair_items: repairItemsMap[pkg.id] || [],
    }));
    
    setPackages(packagesWithItems);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrphanedPackages();

    // Real-time subscription
    const channel = supabase
      .channel("orphaned-packages-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbound_packages",
          filter: "company_id=is.null",
        },
        () => {
          fetchOrphanedPackages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredPackages = packages.filter((pkg) => {
    const query = searchQuery.toLowerCase();
    // Match tracking number
    if (pkg.tracking_number.toLowerCase().includes(query)) return true;
    // Match repair item fields
    return pkg.repair_items.some(item => 
      item.item_name?.toLowerCase().includes(query) ||
      item.serial_number?.toLowerCase().includes(query) ||
      item.mac_address?.toLowerCase().includes(query)
    );
  });

  const togglePackageSelection = (packageId: string) => {
    setSelectedPackages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(packageId)) {
        newSet.delete(packageId);
      } else {
        newSet.add(packageId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPackages.size === filteredPackages.length) {
      setSelectedPackages(new Set());
    } else {
      setSelectedPackages(new Set(filteredPackages.map((p) => p.id)));
    }
  };

  const handleBulkAssign = async () => {
    if (!selectedCompanyId || selectedPackages.size === 0) return;

    const { error } = await supabase
      .from("inbound_packages")
      .update({ company_id: selectedCompanyId })
      .in("id", Array.from(selectedPackages));

    if (error) {
      toast({
        title: "Error",
        description: "Failed to assign packages to company",
        variant: "destructive",
      });
      console.error("Error assigning packages:", error);
    } else {
      toast({
        title: "Success",
        description: `Assigned ${selectedPackages.size} package(s) to company`,
      });
      setSelectedPackages(new Set());
      setSelectedCompanyId("");
      setShowBulkDialog(false);
      fetchOrphanedPackages();
    }
  };

  const handleIndividualAssign = async (packageId: string, companyId: string) => {
    const { error } = await supabase
      .from("inbound_packages")
      .update({ company_id: companyId })
      .eq("id", packageId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to assign package",
        variant: "destructive",
      });
      console.error("Error assigning package:", error);
    } else {
      toast({
        title: "Success",
        description: "Package assigned to company",
      });
      fetchOrphanedPackages();
    }
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  if (loading || companiesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center">
                <PackageX className="h-6 w-6 text-warning" />
              </div>
              <div>
                <CardTitle>Orphaned Packages</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {packages.length} package(s) need company assignment
                </p>
              </div>
            </div>
            <Button onClick={fetchOrphanedPackages} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Bulk Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search by tracking, serial, MAC, or item name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Popover open={companySearchOpen} onOpenChange={setCompanySearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={companySearchOpen}
                    className="w-[240px] justify-between"
                  >
                    {selectedCompany?.name || "Select company..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search companies..." />
                    <CommandList>
                      <CommandEmpty>No company found.</CommandEmpty>
                      <CommandGroup>
                        {companies.map((company) => (
                          <CommandItem
                            key={company.id}
                            value={company.name}
                            onSelect={() => {
                              setSelectedCompanyId(company.id);
                              setCompanySearchOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCompanyId === company.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {company.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                onClick={() => setShowBulkDialog(true)}
                disabled={selectedPackages.size === 0 || !selectedCompanyId}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Assign ({selectedPackages.size})
              </Button>
            </div>
          </div>

          {/* Packages Table */}
          {filteredPackages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PackageX className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No orphaned packages found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedPackages.size === filteredPackages.length && filteredPackages.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Tracking Number</TableHead>
                    <TableHead>Contents</TableHead>
                    <TableHead>Suggested Company</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Initiated Via</TableHead>
                    <TableHead>Tray</TableHead>
                    <TableHead>Return Address</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPackages.map((pkg) => (
                    <>
                      <TableRow key={pkg.id} className="border-l-4 border-l-warning">
                        <TableCell>
                          <Checkbox
                            checked={selectedPackages.has(pkg.id)}
                            onCheckedChange={() => togglePackageSelection(pkg.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{pkg.tracking_number}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpand(pkg.id)}
                            className="gap-2 h-8"
                            disabled={pkg.repair_items.length === 0}
                          >
                            <Package className="h-4 w-4" />
                            {pkg.repair_items.length} item(s)
                            {pkg.repair_items.length > 0 && (
                              expandedPackages.has(pkg.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {pkg.suggested_company_name ? (
                            <Badge variant="secondary" className="cursor-pointer" 
                              onClick={() => pkg.suggested_company_id && handleIndividualAssign(pkg.id, pkg.suggested_company_id)}>
                              {pkg.suggested_company_name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {pkg.category ? (
                            <Badge variant="outline" className="capitalize">
                              {pkg.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={pkg.status === "received" ? "secondary" : "outline"}>
                            {pkg.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {pkg.received_at
                            ? format(new Date(pkg.received_at), "PP p")
                            : format(new Date(pkg.created_at), "PP p")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {pkg.initiated_via || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {pkg.assigned_tray || "—"}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">
                          {pkg.return_shipping_address || "—"}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">
                          {pkg.intake_notes || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Popover 
                            open={individualSearchOpen === pkg.id} 
                            onOpenChange={(open) => setIndividualSearchOpen(open ? pkg.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-[160px] justify-between ml-auto"
                              >
                                Assign...
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[250px] p-0" align="end">
                              <Command>
                                <CommandInput placeholder="Search companies..." />
                                <CommandList>
                                  <CommandEmpty>No company found.</CommandEmpty>
                                  <CommandGroup>
                                    {companies.map((company) => (
                                      <CommandItem
                                        key={company.id}
                                        value={company.name}
                                        onSelect={() => {
                                          handleIndividualAssign(pkg.id, company.id);
                                          setIndividualSearchOpen(null);
                                        }}
                                      >
                                        {company.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                      </TableRow>
                      
                      {/* Expandable Row for Repair Items */}
                      {expandedPackages.has(pkg.id) && pkg.repair_items.length > 0 && (
                        <TableRow key={`${pkg.id}-expanded`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={12} className="p-0">
                            <div className="p-4 space-y-2">
                              {pkg.repair_items.map(item => (
                                <div key={item.id} className="flex flex-wrap items-center gap-3 text-sm bg-background p-3 rounded-md border">
                                  <Badge variant="outline" className="capitalize">
                                    {item.status}
                                  </Badge>
                                  <span className="font-medium">{item.item_name}</span>
                                  {item.serial_number && (
                                    <span className="text-muted-foreground">
                                      SN: <code className="bg-muted px-1 rounded">{item.serial_number}</code>
                                    </span>
                                  )}
                                  {item.mac_address && (
                                    <span className="text-muted-foreground">
                                      MAC: <code className="bg-muted px-1 rounded">{item.mac_address}</code>
                                    </span>
                                  )}
                                  {item.problem_reported && (
                                    <span className="text-muted-foreground truncate max-w-[300px]" title={item.problem_reported}>
                                      Problem: {item.problem_reported}
                                    </span>
                                  )}
                                  {item.diagnosis && (
                                    <span className="text-muted-foreground truncate max-w-[300px]" title={item.diagnosis}>
                                      Diagnosis: {item.diagnosis}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <BulkPackageAssignmentDialog
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        packageCount={selectedPackages.size}
        companyName={selectedCompany?.name || ""}
        onConfirm={handleBulkAssign}
      />
    </div>
  );
}
