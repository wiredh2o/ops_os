import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatCurrencyPrecise } from "@/lib/utils";
import { Package, Truck, CheckCircle2, Wrench, Loader2, ChevronDown, ChevronRight } from "lucide-react";

interface RepairItemWithActuals {
  id: string;
  item_name: string;
  serial_number?: string | null;
  diagnosis?: string | null;
  completion_outcome?: string | null;
  status: string;
  priority_order?: number | null;
  actuals: ActualItem[];
  actualsTotal: number;
}

interface ActualItem {
  id: string;
  inventory_item_id?: string;
  labor_item_id?: string;
  assembly_id?: string;
  quantity: number;
  description: string;
  unit_rate: number;
  total_amount: number;
  is_taxable: boolean;
  item_name?: string;
  item_sku?: string;
  item_type: 'inventory' | 'labor' | 'assembly';
}

interface PackageWithRepairItems {
  packageId: string;
  trackingNumber: string;
  assignedTray: string | null;
  repairItems: RepairItemWithActuals[];
}

interface CreateRepairShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageId: string;
  companyId: string | null;
  companyName: string;
  trackingNumber: string;
}

export const CreateRepairShipmentModal: React.FC<CreateRepairShipmentModalProps> = ({
  isOpen,
  onClose,
  packageId,
  companyId,
  companyName,
  trackingNumber
}) => {
  const [packagesWithItems, setPackagesWithItems] = useState<PackageWithRepairItems[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [customerIsTaxable, setCustomerIsTaxable] = useState<boolean>(true);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Load completed repair items with their actuals from ALL packages for this customer
  useEffect(() => {
    if (!isOpen || !companyId) return;

    const loadData = async () => {
      setLoading(true);
      try {

        // Fetch customer taxability
        const { data: company } = await supabase
          .from('companies')
          .select('is_taxable')
          .eq('id', companyId)
          .single();
        setCustomerIsTaxable(company?.is_taxable ?? true);

        // Get ALL inbound packages for this customer
        const { data: packages, error: pkgError } = await supabase
          .from('inbound_packages')
          .select('id, tracking_number, assigned_tray')
          .eq('company_id', companyId)
          .order('assigned_tray', { ascending: true, nullsFirst: false });

        if (pkgError) throw pkgError;
        if (!packages || packages.length === 0) {
          setPackagesWithItems([]);
          setLoading(false);
          return;
        }

        const packageIds = packages.map(p => p.id);

        // Get all repair item links for these packages
        const { data: packageItems, error: linkError } = await supabase
          .from('inbound_package_items')
          .select('package_id, repair_item_id')
          .in('package_id', packageIds);

        if (linkError) throw linkError;
        if (!packageItems || packageItems.length === 0) {
          setPackagesWithItems([]);
          setLoading(false);
          return;
        }

        const repairItemIds = packageItems.map(pi => pi.repair_item_id);

        // Fetch repair items that are completed
        const { data: items, error: itemsError } = await supabase
          .from('repair_items')
          .select('id, item_name, serial_number, diagnosis, completion_outcome, status, priority_order')
          .in('id', repairItemIds)
          .eq('status', 'completed');

        if (itemsError) throw itemsError;
        if (!items || items.length === 0) {
          setPackagesWithItems([]);
          setLoading(false);
          return;
        }

        // For each item, fetch its actuals
        const itemsWithActuals: RepairItemWithActuals[] = await Promise.all(
          items.map(async (item) => {
            const { data: actuals } = await supabase
              .from('repair_item_actuals')
              .select(`
                id, quantity, description, unit_rate, total_amount, is_taxable,
                inventory_item_id, labor_item_id, assembly_id,
                inventory_items(sku, sales_description),
                labor_items(item_number, name),
                assemblies(sku, sales_description)
              `)
              .eq('repair_item_id', item.id);

            const formattedActuals: ActualItem[] = (actuals || []).map(actual => {
              let item_type: 'inventory' | 'labor' | 'assembly' = 'inventory';
              let item_name = '';
              let item_sku = '';

              if (actual.inventory_item_id && actual.inventory_items) {
                item_type = 'inventory';
                item_name = (actual.inventory_items as any).sales_description || (actual.inventory_items as any).sku;
                item_sku = (actual.inventory_items as any).sku;
              } else if (actual.labor_item_id && actual.labor_items) {
                item_type = 'labor';
                item_name = (actual.labor_items as any).name;
                item_sku = (actual.labor_items as any).item_number;
              } else if (actual.assembly_id && actual.assemblies) {
                item_type = 'assembly';
                item_name = (actual.assemblies as any).sales_description || (actual.assemblies as any).sku;
                item_sku = (actual.assemblies as any).sku;
              }

              return {
                id: actual.id,
                inventory_item_id: actual.inventory_item_id || undefined,
                labor_item_id: actual.labor_item_id || undefined,
                assembly_id: actual.assembly_id || undefined,
                quantity: actual.quantity,
                description: actual.description || item_name,
                unit_rate: actual.unit_rate,
                total_amount: actual.total_amount,
                is_taxable: actual.is_taxable,
                item_name,
                item_sku,
                item_type
              };
            });

            return {
              ...item,
              actuals: formattedActuals,
              actualsTotal: formattedActuals.reduce((sum, a) => sum + a.total_amount, 0)
            };
          })
        );

        // Include all completed items (with or without actuals)
        const validItems = itemsWithActuals;

        // Build a map of repair_item_id -> package_id
        const itemToPackageMap = new Map<string, string>();
        packageItems.forEach(pi => {
          itemToPackageMap.set(pi.repair_item_id, pi.package_id);
        });

        // Group items by package
        const packageMap = new Map<string, PackageWithRepairItems>();
        packages.forEach(pkg => {
          packageMap.set(pkg.id, {
            packageId: pkg.id,
            trackingNumber: pkg.tracking_number,
            assignedTray: pkg.assigned_tray,
            repairItems: []
          });
        });

        validItems.forEach(item => {
          const pkgId = itemToPackageMap.get(item.id);
          if (pkgId && packageMap.has(pkgId)) {
            packageMap.get(pkgId)!.repairItems.push(item);
          }
        });

        // Filter to only packages that have completed items
        const packagesWithValidItems = Array.from(packageMap.values())
          .filter(pkg => pkg.repairItems.length > 0)
          .map(pkg => ({
            ...pkg,
            repairItems: pkg.repairItems.sort((a, b) => {
              if (a.priority_order == null && b.priority_order == null) return 0;
              if (a.priority_order == null) return 1;
              if (b.priority_order == null) return -1;
              return a.priority_order - b.priority_order;
            })
          }));

        setPackagesWithItems(packagesWithValidItems);
        
        // Auto-select all items and expand all packages
        const allItemIds = packagesWithValidItems.flatMap(p => p.repairItems.map(i => i.id));
        setSelectedItems(new Set(allItemIds));
        setExpandedPackages(new Set(packagesWithValidItems.map(p => p.packageId)));
      } catch (error: any) {
        console.error('Error loading repair items:', error);
        toast({
          title: "Error",
          description: "Failed to load repair items",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, companyId, toast]);

  // Get all repair items flattened for calculations
  const allRepairItems = useMemo(() => {
    return packagesWithItems.flatMap(pkg => pkg.repairItems);
  }, [packagesWithItems]);

  // Calculate totals for selected items
  const totals = useMemo(() => {
    const selected = allRepairItems.filter(item => selectedItems.has(item.id));
    const subtotal = selected.reduce((sum, item) => sum + item.actualsTotal, 0);
    
    // Jurisdiction sales tax is calculated by the server on the saved invoice.
    const tax = 0;
    
    return { subtotal, tax, total: subtotal + tax };
  }, [allRepairItems, selectedItems]);

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const togglePackageItems = (pkg: PackageWithRepairItems) => {
    const pkgItemIds = pkg.repairItems.map(i => i.id);
    const allSelected = pkgItemIds.every(id => selectedItems.has(id));
    
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pkgItemIds.forEach(id => next.delete(id));
      } else {
        pkgItemIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const togglePackageExpanded = (pkgId: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev);
      if (next.has(pkgId)) {
        next.delete(pkgId);
      } else {
        next.add(pkgId);
      }
      return next;
    });
  };

  const handleCreateShipment = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: "No items selected",
        description: "Please select at least one repair item to create a shipment",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      // Verify items haven't been invoiced by another user (prevent duplicates)
      const { data: freshItems, error: verifyError } = await supabase
        .from('repair_items')
        .select('id, status')
        .in('id', Array.from(selectedItems))
        .eq('status', 'completed');

      if (verifyError) throw verifyError;

      const freshItemIds = new Set(freshItems?.map(i => i.id) || []);
      const alreadyInvoiced = Array.from(selectedItems).filter(id => !freshItemIds.has(id));

      if (alreadyInvoiced.length > 0) {
        toast({
          title: "Some items already shipped",
          description: `${alreadyInvoiced.length} item(s) were already added to a shipment order. Please refresh and try again.`,
          variant: "destructive"
        });
        setCreating(false);
        return;
      }

      // Check if any selected items are already in a production order (belt-and-suspenders check)
      const { data: existingOrderItems, error: existingError } = await supabase
        .from('production_order_items')
        .select('repair_item_id')
        .in('repair_item_id', Array.from(selectedItems));

      if (existingError) throw existingError;

      if (existingOrderItems && existingOrderItems.length > 0) {
        const duplicateIds = new Set(existingOrderItems.map(i => i.repair_item_id));
        toast({
          title: "Items already in shipment orders",
          description: `${duplicateIds.size} item(s) are already part of a shipment order. Please refresh and try again.`,
          variant: "destructive"
        });
        setCreating(false);
        return;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get sequential order number from database
      const { data: orderNumber, error: orderNumberError } = await supabase
        .rpc('get_next_repair_order_number');
      if (orderNumberError) throw orderNumberError;

      // Get selected repair items
      const selectedRepairItems = allRepairItems.filter(item => selectedItems.has(item.id));

      // Calculate order totals
      const subtotal = selectedRepairItems.reduce((sum, item) => sum + item.actualsTotal, 0);

      // Determine the primary package (first package that has selected items)
      const primaryPackageId = packagesWithItems.find(pkg => 
        pkg.repairItems.some(item => selectedItems.has(item.id))
      )?.packageId || packageId;

      // Create production order
      const { data: order, error: orderError } = await supabase
        .from('production_orders')
        .insert({
          order_number: orderNumber,
          order_type: 'repair',
          status: 'completed',
          customer_company_id: companyId,
          customer_name: companyName,
          total_amount: subtotal,
          inbound_package_id: primaryPackageId,
          created_by: user.id
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create production order items from actuals
      const orderItems = selectedRepairItems.flatMap(repairItem =>
        repairItem.actuals.map(actual => ({
          production_order_id: order.id,
          repair_item_id: repairItem.id,
          item_name: actual.description || actual.item_name || 'Unknown Item',
          item_sku: actual.item_sku,
          item_type: actual.item_type,
          quantity: actual.quantity,
          unit_price: actual.unit_rate,
          total_price: actual.total_amount,
          is_taxable: actual.is_taxable,
          inventory_item_id: actual.inventory_item_id || null,
          labor_item_id: actual.labor_item_id || null,
          assembly_id: actual.assembly_id || null,
          status: 'pending'
        }))
      );

      const { error: itemsError } = await supabase
        .from('production_order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Update repair items status to 'queued_for_shipping'
      const { error: updateError } = await supabase
        .from('repair_items')
        .update({ status: 'queued_for_shipping' })
        .in('id', Array.from(selectedItems));

      if (updateError) throw updateError;

      toast({
        title: "Shipment Created",
        description: `Order ${orderNumber} created with ${selectedItems.size} repair item(s)`,
      });

      // Dispatch event to refresh data for all affected packages
      const affectedPackageIds = new Set<string>();
      packagesWithItems.forEach(pkg => {
        if (pkg.repairItems.some(item => selectedItems.has(item.id))) {
          affectedPackageIds.add(pkg.packageId);
        }
      });
      affectedPackageIds.forEach(pkgId => {
        window.dispatchEvent(new CustomEvent('repair-item-updated', { 
          detail: { packageId: pkgId } 
        }));
      });

      // Dispatch event to refresh shipping queue
      window.dispatchEvent(new CustomEvent('shipping-order-created', {
        detail: { orderId: order.id, orderNumber: orderNumber }
      }));

      onClose();
    } catch (error: any) {
      console.error('Error creating shipment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create shipment",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const formatOutcome = (outcome: string | null) => {
    const labels: Record<string, string> = {
      repaired: 'Repaired',
      no_repair_needed: 'No Repair Needed',
      replaced: 'Replaced',
      customer_declined_scrapped: 'Customer Declined - Scrapped',
      customer_declined_returned: 'Customer Declined - Returned',
      unrepairable_scrapped: 'Unrepairable - Scrapped',
      unrepairable_returned: 'Unrepairable - Returned',
      // Legacy support
      customer_declined: 'Customer Declined - Scrapped',
      unrepairable: 'Unrepairable - Scrapped',
      scrapped: 'Unrepairable - Scrapped'
    };
    return outcome ? labels[outcome] || outcome : 'Unknown';
  };

  const getOutcomeBadgeVariant = (outcome: string | null): "default" | "secondary" | "destructive" | "outline" => {
    switch (outcome) {
      case 'repaired': return 'default';
      case 'no_repair_needed': return 'secondary';
      case 'replaced': return 'default';
      // Returned outcomes - secondary (item ships with charges)
      case 'customer_declined_returned': return 'secondary';
      case 'unrepairable_returned': return 'secondary';
      // Scrapped outcomes - destructive (item disposed)
      case 'customer_declined_scrapped': return 'destructive';
      case 'unrepairable_scrapped': return 'destructive';
      // Legacy support
      case 'customer_declined': return 'destructive';
      case 'unrepairable': return 'destructive';
      case 'scrapped': return 'destructive';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const totalItemCount = packagesWithItems.reduce((sum, pkg) => sum + pkg.repairItems.length, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Truck className="h-6 w-6" />
            Create Repair Shipment
          </DialogTitle>
          <div className="text-base font-medium mt-2">
            <span className="text-foreground">Customer: {companyName}</span>
          </div>
          {packagesWithItems.length > 1 && (
            <p className="text-sm text-muted-foreground mt-1">
              Showing completed items from {packagesWithItems.length} packages/trays
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            {totalItemCount === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No completed repair items with actuals found.</p>
                  <p className="text-sm mt-2">
                    Complete repairs and add "Actually Used" items before creating a shipment.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4 pb-4">
                {packagesWithItems.map((pkg) => {
                  const pkgItemIds = pkg.repairItems.map(i => i.id);
                  const allSelected = pkgItemIds.every(id => selectedItems.has(id));
                  const someSelected = pkgItemIds.some(id => selectedItems.has(id));
                  const isExpanded = expandedPackages.has(pkg.packageId);

                  return (
                    <Card key={pkg.packageId} className="overflow-hidden">
                      <Collapsible open={isExpanded} onOpenChange={() => togglePackageExpanded(pkg.packageId)}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <Package className="h-5 w-5 text-primary" />
                                <div>
                                  <CardTitle className="text-base">
                                    <FinancialGuard kind="revenue">{pkg.assignedTray ? `Tray ${pkg.assignedTray}` : 'Unassigned Tray'}</FinancialGuard>
                                  </CardTitle>
                                  <p className="text-sm text-muted-foreground font-normal">
                                    {pkg.trackingNumber} • {pkg.repairItems.length} item{pkg.repairItems.length !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                              <div 
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Checkbox
                                  checked={allSelected}
                                  ref={(el) => {
                                    if (el) {
                                      (el as any).indeterminate = someSelected && !allSelected;
                                    }
                                  }}
                                  onCheckedChange={() => togglePackageItems(pkg)}
                                />
                                <span className="text-sm text-muted-foreground">Select All</span>
                              </div>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-3">
                            {pkg.repairItems.map((item) => (
                              <Card 
                                key={item.id}
                                className={`transition-all relative ${
                                  selectedItems.has(item.id) 
                                    ? 'ring-2 ring-primary' 
                                    : 'opacity-60'
                                }`}
                              >
                                {item.priority_order != null && (
                                  <Badge 
                                    variant="outline" 
                                    className="absolute top-2 right-2 bg-background text-orange-600 border-orange-500 dark:text-orange-400"
                                  >
                                    Priority {item.priority_order}
                                  </Badge>
                                )}
                                <CardHeader className="pb-2">
                                  <div className="flex items-start gap-3">
                                    <Checkbox
                                      checked={selectedItems.has(item.id)}
                                      onCheckedChange={() => toggleItem(item.id)}
                                      className="mt-1"
                                    />
                                    <div className="flex-1">
                                      <CardTitle className="text-base flex items-center gap-2">
                                        <Wrench className="h-4 w-4" />
                                        {item.item_name}
                                        <Badge variant={getOutcomeBadgeVariant(item.completion_outcome)}>
                                          {formatOutcome(item.completion_outcome)}
                                        </Badge>
                                      </CardTitle>
                                      {item.serial_number && (
                                        <p className="text-sm text-muted-foreground">
                                          S/N: {item.serial_number}
                                        </p>
                                      )}
                                      {item.diagnosis && (
                                        <p className="text-sm text-muted-foreground mt-1 italic">
                                          Diagnosis: {item.diagnosis}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                  <div className="ml-7 space-y-1">
                                    {item.actuals.map((actual) => (
                                      <div key={actual.id} className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">
                                          <FinancialGuard kind="revenue">{actual.item_sku && `${actual.item_sku} - `}</FinancialGuard>
                                          {actual.description}
                                          {actual.quantity > 1 && ` (×${actual.quantity})`}
                                        </span>
                                        <span><FinancialGuard kind="revenue">{formatCurrencyPrecise(actual.total_amount)}</FinancialGuard></span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex justify-between items-center mt-4 pt-3 border-t ml-7">
                                    <span className="text-sm font-medium">
                                      Repair Item Total
                                      <span className="text-xs font-normal text-muted-foreground ml-2 italic">
                                        Before taxes & shipping
                                      </span>
                                    </span>
                                    <span className="font-bold text-lg">
                                      <FinancialGuard kind="revenue">{formatCurrency(item.actualsTotal)}</FinancialGuard>
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <Separator className="my-4" />

        {/* Totals */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal - {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}</span>
            <span><FinancialGuard kind="revenue">{formatCurrency(totals.subtotal)}</FinancialGuard></span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>
              Sales tax
              {!customerIsTaxable && <span className="ml-1 text-xs italic">Non-taxable customer</span>}
            </span>
            <span className="text-muted-foreground italic">Calculated on invoice by jurisdiction</span>
          </div>
          <div className="flex justify-between font-semibold text-lg items-baseline">
            <div>
              <span>Total</span>
              <span className="text-xs font-normal text-muted-foreground ml-2 italic">
                Before taxes & shipping
              </span>
            </div>
            <span><FinancialGuard kind="revenue">{formatCurrency(totals.total)}</FinancialGuard></span>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateShipment} 
            disabled={creating || selectedItems.size === 0}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4 mr-2" />
                Create Shipment Order
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
