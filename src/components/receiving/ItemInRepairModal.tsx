import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Calculator as CalculatorIcon, Play, Pause, Square, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calculator } from "@/components/ui/calculator";
import { useCompanies } from "@/hooks/useCompanies";
import { useRepairTimer } from "@/hooks/useRepairTimer";
import { formatCurrency } from "@/lib/utils";

interface RepairItem {
  id: string;
  item_name: string;
  status: string;
  package_id: string;
}

interface EstimateItem {
  id?: string;
  inventory_item_id?: string;
  labor_item_id?: string;
  assembly_id?: string;
  item_type: 'inventory' | 'labor' | 'assembly';
  sku: string;
  quantity: number;
  description: string;
  unit_rate: number;
  total_amount: number;
  eligible_for_distributor_discount?: boolean;
}

interface InventoryItem {
  id: string;
  sku: string;
  sales_description?: string;
  unit_price: number;
  eligible_for_distributor_discount?: boolean;
}

interface LaborItem {
  id: string;
  item_number: string;
  name: string;
  hourly_rate: number;
  eligible_for_distributor_discount?: boolean;
}

interface AssemblyItem {
  id: string;
  sku: string;
  description?: string;
  selling_price: number;
  eligible_for_distributor_discount?: boolean;
}

interface ItemInRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: RepairItem;
  companyId?: string;
}

export const ItemInRepairModal: React.FC<ItemInRepairModalProps> = ({
  isOpen,
  onClose,
  item,
  companyId
}) => {
  const [estimates, setEstimates] = useState<EstimateItem[]>([]);
  const [availableInventory, setAvailableInventory] = useState<InventoryItem[]>([]);
  const [availableLabor, setAvailableLabor] = useState<LaborItem[]>([]);
  const [availableAssemblies, setAvailableAssemblies] = useState<AssemblyItem[]>([]);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorTarget, setCalculatorTarget] = useState<{index: number, field: 'quantity' | 'unit_rate'} | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRepairCompleted, setIsRepairCompleted] = useState(false);

  const { toast } = useToast();

  // CRITICAL: Use protected timer hook - DO NOT MODIFY
  const timer = useRepairTimer({
    repairItemId: item.id,
    packageId: item.package_id,
    isModalOpen: isOpen,
    onClose
  });
  const { data: companies } = useCompanies();

  // Get company discount info
  const company = companies?.find(c => c.id === companyId);
  const isDistributor = company?.is_distributor || false;
  const discountRate = isDistributor ? 0.1 : 0; // 10% discount for distributors

  // Auto-save estimates
  const saveEstimates = useCallback(async () => {
    if (estimates.length === 0) return;

    try {
      // Delete existing estimates for this repair item
      await supabase
        .from('repair_item_estimates')
        .delete()
        .eq('repair_item_id', item.id);

      // Insert new estimates
      const estimateData = estimates.map(est => ({
        repair_item_id: item.id,
        inventory_item_id: est.item_type === 'inventory' ? est.inventory_item_id : null,
        labor_item_id: est.item_type === 'labor' ? est.labor_item_id : null,
        assembly_id: est.item_type === 'assembly' ? est.assembly_id : null,
        quantity: est.quantity,
        description: est.description,
        unit_rate: est.unit_rate,
        total_amount: est.total_amount
      }));

      await supabase
        .from('repair_item_estimates')
        .insert(estimateData);

    } catch (error) {
      console.error('Error saving estimates:', error);
    }
  }, [estimates, item.id]);

  // Load existing data when modal opens  
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load available inventory (non-inventory items like "Component")
        const { data: inventory } = await supabase
          .from('inventory_items')
          .select('id, sku, sales_description, unit_price, eligible_for_distributor_discount')
          .order('sku');

        // Load available labor
        const { data: labor } = await supabase
          .from('labor_items')
          .select('id, item_number, name, hourly_rate, eligible_for_distributor_discount')
          .order('item_number');

        // Load available assemblies
        const { data: assemblies } = await supabase
          .from('assemblies')
          .select('id, sku, sales_description, selling_price, eligible_for_distributor_discount')
          .order('sku');

        // Load existing estimates (pre-populated from diagnosis)
        const { data: existingEstimates } = await supabase
          .from('repair_item_estimates')
          .select(`
            id, quantity, description, unit_rate, total_amount,
            inventory_item_id, labor_item_id, assembly_id,
            inventory_items (sku, sales_description, eligible_for_distributor_discount),
            labor_items (item_number, name, eligible_for_distributor_discount),
            assemblies (sku, sales_description, eligible_for_distributor_discount)
          `)
          .eq('repair_item_id', item.id);

        setAvailableInventory(inventory || []);
        setAvailableLabor(labor || []);
        setAvailableAssemblies(assemblies || []);

        // Convert existing estimates to component format
        if (existingEstimates) {
          const formattedEstimates: EstimateItem[] = existingEstimates.map(est => {
            let item_type: 'inventory' | 'labor' | 'assembly';
            let sku: string;
            let eligible_for_distributor_discount: boolean | undefined;

            if (est.inventory_item_id) {
              item_type = 'inventory';
              sku = (est.inventory_items as any)?.sku || '';
              eligible_for_distributor_discount = (est.inventory_items as any)?.eligible_for_distributor_discount;
            } else if (est.labor_item_id) {
              item_type = 'labor';
              sku = (est.labor_items as any)?.item_number || '';
              eligible_for_distributor_discount = (est.labor_items as any)?.eligible_for_distributor_discount;
            } else {
              item_type = 'assembly';
              sku = (est.assemblies as any)?.sku || '';
              eligible_for_distributor_discount = (est.assemblies as any)?.eligible_for_distributor_discount;
            }

            return {
              id: est.id,
              inventory_item_id: est.inventory_item_id || undefined,
              labor_item_id: est.labor_item_id || undefined,
              assembly_id: est.assembly_id || undefined,
              item_type,
              sku,
              quantity: est.quantity,
              description: est.description || '',
              unit_rate: est.unit_rate,
              total_amount: est.total_amount,
              eligible_for_distributor_discount
            };
          });
          setEstimates(formattedEstimates);
        } else {
          setEstimates([]);
        }

        // Set repair completed status - check both legacy 'repaired' and modern statuses
        setIsRepairCompleted(['repaired', 'completed', 'queued_for_shipping', 'label_created', 'in_transit', 'delivered'].includes(item.status));

      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: "Error",
          description: "Failed to load repair data",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, item.id, toast]);

  // Auto-save when estimates change
  useEffect(() => {
    if (estimates.length > 0) {
      const timeoutId = setTimeout(saveEstimates, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [estimates, saveEstimates]);

  // CRITICAL: Timer cleanup on modal close - DO NOT MODIFY
  const handleClose = async () => {
    await timer.cleanup();
    onClose();
  };

  const handleRepairCompletedToggle = async (checked: boolean) => {
    try {
      await supabase
        .from('repair_items')
        .update({
          status: checked ? 'completed' : 'in_repair'
        })
        .eq('id', item.id);

      setIsRepairCompleted(checked);
      
      // Dispatch event to refresh the UI
      const event = new CustomEvent('repair-item-updated', { 
        detail: { 
          packageId: item.package_id,
          itemId: item.id
        } 
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Error updating repair status:', error);
    }
  };

  const addNewItem = () => {
    const newItem: EstimateItem = {
      item_type: 'inventory',
      sku: '',
      quantity: 1,
      description: '',
      unit_rate: 0,
      total_amount: 0
    };
    setEstimates([...estimates, newItem]);
  };

  const updateEstimate = (index: number, updates: Partial<EstimateItem>) => {
    const updated = [...estimates];
    updated[index] = { ...updated[index], ...updates };
    
    // Recalculate total
    const quantity = updated[index].quantity;
    const rate = updated[index].unit_rate;
    // No discount on labor items, regardless of eligible_for_distributor_discount flag
    const isLabor = updated[index].item_type === 'labor';
    const discount = !isLabor && updated[index].eligible_for_distributor_discount && isDistributor ? discountRate : 0;
    const discountedRate = rate * (1 - discount);
    updated[index].total_amount = quantity * discountedRate;
    
    setEstimates(updated);
  };

  const removeEstimate = (index: number) => {
    setEstimates(estimates.filter((_, i) => i !== index));
  };

  const handleItemSelect = (index: number, itemId: string, itemType: 'inventory' | 'labor' | 'assembly') => {
    if (itemType === 'inventory') {
      const selected = availableInventory.find(item => item.id === itemId);
      if (selected) {
        updateEstimate(index, {
          item_type: 'inventory',
          inventory_item_id: selected.id,
          labor_item_id: undefined,
          assembly_id: undefined,
          sku: selected.sku,
          description: selected.sales_description || selected.sku,
          unit_rate: selected.unit_price,
          eligible_for_distributor_discount: selected.eligible_for_distributor_discount
        });
      }
    } else if (itemType === 'labor') {
      const selected = availableLabor.find(item => item.id === itemId);
      if (selected) {
        updateEstimate(index, {
          item_type: 'labor',
          labor_item_id: selected.id,
          inventory_item_id: undefined,
          assembly_id: undefined,
          sku: selected.item_number,
          description: selected.name,
          unit_rate: selected.hourly_rate,
          eligible_for_distributor_discount: selected.eligible_for_distributor_discount
        });
      }
    } else {
      const selected = availableAssemblies.find(item => item.id === itemId);
      if (selected) {
        updateEstimate(index, {
          item_type: 'assembly',
          assembly_id: selected.id,
          inventory_item_id: undefined,
          labor_item_id: undefined,
          sku: selected.sku,
          description: selected.description || selected.sku,
          unit_rate: selected.selling_price,
          eligible_for_distributor_discount: selected.eligible_for_distributor_discount
        });
      }
    }
  };

  const openCalculator = (index: number, field: 'quantity' | 'unit_rate') => {
    setCalculatorTarget({ index, field });
    setCalculatorOpen(true);
  };

  const handleCalculatorValue = (value: number) => {
    if (calculatorTarget) {
      updateEstimate(calculatorTarget.index, {
        [calculatorTarget.field]: value
      });
    }
    setCalculatorOpen(false);
    setCalculatorTarget(null);
  };


  const subtotal = estimates.reduce((sum, est) => sum + est.total_amount, 0);
  const laborTotal = estimates
    .filter(est => est.item_type === 'labor')
    .reduce((sum, est) => sum + est.total_amount, 0);
  const grandTotal = subtotal;


  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>Item In Repair: {item.item_name}</span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{timer.formatTime(timer.elapsedTime)}</span>
              </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
              <div className="col-span-2">SKU</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-4">Description</div>
              <div className="col-span-2">Rate</div>
              <div className="col-span-2">Total</div>
              <div className="col-span-1">Actions</div>
            </div>

            {/* Estimate Rows */}
            <div className="space-y-1">
              {estimates.map((estimate, index) => (
                <div 
                  key={index} 
                  className={`grid grid-cols-12 gap-2 p-2 rounded ${
                    index % 2 === 0 ? 'bg-blue-50' : 'bg-white'
                  }`}
                >
                  {/* SKU Selector */}
                  <div className="col-span-2">
                    <Select
                      value={estimate.item_type === 'inventory' ? estimate.inventory_item_id : 
                             estimate.item_type === 'labor' ? estimate.labor_item_id : estimate.assembly_id}
                      onValueChange={(value) => {
                        const isInventory = availableInventory.some(item => item.id === value);
                        const isLabor = availableLabor.some(item => item.id === value);
                        const isAssembly = availableAssemblies.some(item => item.id === value);
                        
                        if (isInventory) {
                          handleItemSelect(index, value, 'inventory');
                        } else if (isLabor) {
                          handleItemSelect(index, value, 'labor');
                        } else if (isAssembly) {
                          handleItemSelect(index, value, 'assembly');
                        }
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select SKU" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inventory-header" disabled>
                          <span className="font-medium">Inventory Items</span>
                        </SelectItem>
                        {availableInventory.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.sku}
                          </SelectItem>
                        ))}
                        <SelectItem value="assembly-header" disabled>
                          <span className="font-medium">Assembly Items</span>
                        </SelectItem>
                        {availableAssemblies.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.sku}
                          </SelectItem>
                        ))}
                        <SelectItem value="labor-header" disabled>
                          <span className="font-medium">Labor Items</span>
                        </SelectItem>
                        {availableLabor.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.item_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1">
                    <Input
                      type="number"
                      value={estimate.quantity}
                      onChange={(e) => updateEstimate(index, { quantity: parseFloat(e.target.value) || 0 })}
                      className="h-8"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  {/* Description */}
                  <div className="col-span-4">
                    <Input
                      value={estimate.description}
                      onChange={(e) => updateEstimate(index, { description: e.target.value })}
                      className="h-8"
                      placeholder="Description"
                    />
                  </div>

                  {/* Rate */}
                  <div className="col-span-2">
                    <div className="flex">
                      <Input
                        type="number"
                        value={estimate.unit_rate}
                        onChange={(e) => updateEstimate(index, { unit_rate: parseFloat(e.target.value) || 0 })}
                        className="h-8"
                        min="0"
                        step="0.0001"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 h-8 w-8"
                        onClick={() => openCalculator(index, 'unit_rate')}
                      >
                        <CalculatorIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="col-span-2">
                    <div className="h-8 flex items-center px-3 bg-muted rounded text-sm">
                      <FinancialGuard kind="revenue">{formatCurrency(estimate.total_amount)}</FinancialGuard>
                      {estimate.eligible_for_distributor_discount && isDistributor && (
                        <Badge variant="secondary" className="ml-2 text-xs">10% OFF</Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEstimate(index)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Button */}
            <Button onClick={addNewItem} variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-end space-x-8 text-sm">
                <div>Subtotal: <FinancialGuard kind="revenue">{formatCurrency(subtotal)}</FinancialGuard></div>
                <div>Labor: <FinancialGuard kind="revenue">{formatCurrency(laborTotal)}</FinancialGuard></div>
                <div className="font-semibold">Grand Total: <FinancialGuard kind="revenue">{formatCurrency(grandTotal)}</FinancialGuard></div>
              </div>
            </div>

            {/* Repair Completed Toggle */}
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="repair-completed-modal"
                    checked={isRepairCompleted}
                    onCheckedChange={handleRepairCompletedToggle}
                  />
                  <Label htmlFor="repair-completed-modal" className="text-sm font-medium">
                    Mark as Repair Completed
                  </Label>
                </div>
                <div className="text-sm text-muted-foreground">
                  Timer: {timer.formatTime(timer.elapsedTime)}
                </div>
              </div>
              <Button onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Calculator
        isOpen={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
        onValueSelect={(value) => handleCalculatorValue(parseFloat(value) || 0)}
        initialValue={calculatorTarget && estimates[calculatorTarget.index] 
          ? (estimates[calculatorTarget.index][calculatorTarget.field] || 0).toString() 
          : "0"}
      />
    </>
  );
};