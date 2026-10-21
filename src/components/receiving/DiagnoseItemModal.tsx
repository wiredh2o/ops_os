import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { X, Package, ShoppingCart, Play, Pause, Clock, Search, Minus, Trash2, Wrench, Box, Calculator as CalculatorIcon, Plus, CheckSquare } from "lucide-react";
import { ActuallyUsedPanel } from "./ActuallyUsedPanel";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calculator } from "@/components/ui/calculator";
import { supabase } from "@/integrations/supabase/client";
import { useRepairTimer } from "@/hooks/useRepairTimer";
import { useCompanies } from "@/hooks/useCompanies";
import { formatCurrency } from "@/lib/utils";
import { isInShippingPhase } from "@/lib/repair-item-status-ui";
import { isScrappedOutcome } from "@/lib/repair-queue-filter";


// Interfaces for estimate functionality
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

interface RepairItem {
  id: string;
  name: string;
  sku?: string;
  price: number;
  type: 'inventory' | 'labor' | 'assembly';
  unit?: string;
}

interface CartItem extends RepairItem {
  quantity: number;
  total: number;
}

interface DiagnoseItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    id: string;
    item_name: string;
    serial_number?: string | null;
    mac_address?: string | null;
    problem_reported?: string | null;
    package_id?: string;
    diagnosis?: string | null;
    repairability?: string | null;
    diagnosis_assessment?: string | null;
    completion_outcome?: string | null;
    estimated_cost?: number | null;
    status?: string | null;
  };
  itemIndex: number;
  totalItems: number;
  trayNumber?: string;
  readOnly?: boolean;
}

export const DiagnoseItemModal: React.FC<DiagnoseItemModalProps> = ({
  isOpen,
  onClose,
  item,
  itemIndex,
  totalItems,
  trayNumber,
  readOnly = false
}) => {
  // Diagnosis state
  const [diagnosis, setDiagnosis] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("logged");
  const [diagnosisAssessment, setDiagnosisAssessment] = useState("unknown");
  const [completionOutcome, setCompletionOutcome] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Estimate state
  const [estimates, setEstimates] = useState<EstimateItem[]>([]);
  const [availableInventory, setAvailableInventory] = useState<InventoryItem[]>([]);
  const [availableLabor, setAvailableLabor] = useState<LaborItem[]>([]);
  const [availableAssemblies, setAvailableAssemblies] = useState<AssemblyItem[]>([]);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorTarget, setCalculatorTarget] = useState<{index: number, field: 'quantity' | 'unit_rate'} | null>(null);
  
  // Drag and drop estimate state
  const [availableItems, setAvailableItems] = useState<RepairItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedItem, setDraggedItem] = useState<RepairItem | null>(null);
  const [showQuantityInput, setShowQuantityInput] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState("1");
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("diagnosis");
  
  const { toast } = useToast();
  const { data: companies } = useCompanies();

  // CRITICAL: Use protected timer hook - DO NOT MODIFY
  const timer = useRepairTimer({
    repairItemId: item.id,
    packageId: item.package_id,
    isModalOpen: isOpen,
    onClose,
    readOnly
  });

  // Get company discount info
  const company = companies?.find(c => c.id === companyId);
  const isDistributor = company?.is_distributor || false;
  const discountRate = isDistributor ? 0.1 : 0; // 10% discount for distributors

  // Load data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Get company ID from package context
        if (item.package_id) {
          const { data } = await supabase
            .from('inbound_packages')
            .select('company_id')
            .eq('id', item.package_id)
            .maybeSingle();
          
          if (data) {
            setCompanyId(data.company_id);
          }
        }

        // Populate diagnosis form values
        setDiagnosis(item.diagnosis || "");
        // Shipping-phase statuses mean the repair is completed - map back for display
        const statusForDisplay = isInShippingPhase(item.status) ? 'completed' : (item.status || 'logged');
        setWorkflowStatus(statusForDisplay);
        setDiagnosisAssessment(item.diagnosis_assessment || "unknown");
        setCompletionOutcome(item.completion_outcome || "");
        setEstimatedCost(item.estimated_cost ? item.estimated_cost.toFixed(2) : "");

        // Load available inventory
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

        setAvailableInventory(inventory || []);
        setAvailableLabor(labor || []);
        setAvailableAssemblies(assemblies || []);

        // Create combined available items for drag and drop
        const items: RepairItem[] = [
          ...(inventory || []).map(item => ({
            id: item.id,
            name: item.sales_description || item.sku,
            sku: item.sku,
            price: Number(item.unit_price),
            type: 'inventory' as const,
            unit: 'each'
          })),
          ...(labor || []).map(item => ({
            id: item.id,
            name: item.name,
            sku: item.item_number,
            price: Number(item.hourly_rate),
            type: 'labor' as const,
            unit: 'hour'
          })),
          ...(assemblies || []).map(item => ({
            id: item.id,
            name: item.sales_description || item.sku,
            sku: item.sku,
            price: Number(item.selling_price),
            type: 'assembly' as const,
            unit: 'each'
          }))
        ];
        setAvailableItems(items);

        // Load existing estimates for the repair item
        const { data: existingEstimates } = await supabase
          .from('repair_item_estimates')
          .select(`
            id, quantity, description, unit_rate, total_amount,
            inventory_item_id, labor_item_id, assembly_id,
            inventory_items (sku, sales_description, eligible_for_distributor_discount),
            labor_items (item_number, name, eligible_for_distributor_discount),
            assemblies (sku, description, eligible_for_distributor_discount)
          `)
          .eq('repair_item_id', item.id);

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
        }

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
  }, [isOpen, item, toast]);

  // Helper function for formatting workflow status display
  const formatStatus = (status: string) => {
    const labels: Record<string, string> = {
      logged: 'Logged',
      diagnosed: 'Diagnosed',
      in_repair: 'In Repair',
      completed: 'Completed',
      // Shipping phase - these should show as "Completed" in repair context
      queued_for_shipping: 'Completed',
      label_created: 'Completed',
      in_transit: 'Completed',
      delivered: 'Completed',
    };
    return labels[status] || status;
  };

  // Get status badge color based on workflow status
  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'logged': return 'secondary';
      case 'diagnosed': return 'outline';
      case 'in_repair': return 'default';
      case 'completed': return 'destructive';
      default: return 'outline';
    }
  };

  // Handle "Mark as Completed" toggle
  const handleCompletedToggle = (checked: boolean) => {
    if (checked) {
      setWorkflowStatus('completed');
    } else {
      // Option B: Revert to "in_repair" (they presumably worked on it)
      setWorkflowStatus('in_repair');
      setCompletionOutcome(''); // Clear outcome when uncompleting
    }
  };

  // Handle Repairability Status change with auto-complete for terminal states
  const handleRepairabilityStatusChange = (value: string) => {
    setDiagnosisAssessment(value);
    
    // Auto-complete when marked as not repairable
    if (value === 'not_repairable') {
      setWorkflowStatus('completed');
      setCompletionOutcome('unrepairable');
    }
    
    // Auto-complete when all tests passed - no repair needed
    if (value === 'all_tests_passed') {
      setWorkflowStatus('completed');
      setCompletionOutcome('no_repair_needed');
    }
  };

  const handleSave = async () => {
    console.log('🔧 DIAGNOSIS SAVE: Starting save operation');
    console.log('🔧 Item ID:', item.id);
    console.log('🔧 Form data:', {
      diagnosis: diagnosis.trim(),
      workflowStatus,
      diagnosisAssessment,
      completionOutcome,
      estimatedCost
    });

    // Validate required fields
    if (!diagnosis.trim()) {
      console.error('❌ DIAGNOSIS SAVE: Missing diagnosis');
      toast({
        title: "Validation Error",
        description: "Diagnosis is required",
        variant: "destructive"
      });
      return;
    }

    // Require completion outcome when status is completed
    if (workflowStatus === 'completed' && !completionOutcome) {
      console.error('❌ DIAGNOSIS SAVE: Missing completion outcome');
      toast({
        title: "Validation Error",
        description: "Completion outcome is required when marking as completed",
        variant: "destructive"
      });
      return;
    }

    // Auto-transition: logged → diagnosed when diagnosis text is saved
    let finalStatus = workflowStatus;
    if (workflowStatus === 'logged' && diagnosis.trim()) {
      finalStatus = 'diagnosed';
      console.log('🔧 DIAGNOSIS SAVE: Auto-transitioning status from "logged" to "diagnosed"');
    }

    try {
      const updateData = {
        diagnosis: diagnosis.trim(),
        status: finalStatus,
        diagnosis_assessment: diagnosisAssessment,
        completion_outcome: finalStatus === 'completed' ? completionOutcome : null,
        estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null
      };

      console.log('🔧 DIAGNOSIS SAVE: Update data prepared:', updateData);
      console.log('🔧 DIAGNOSIS SAVE: Sending update to database...');

      const { data, error } = await supabase
        .from('repair_items')
        .update(updateData)
        .eq('id', item.id)
        .select();

      console.log('🔧 DIAGNOSIS SAVE: Database response:', { data, error });

      if (error) {
        console.error('❌ DIAGNOSIS SAVE: Database error:', error);
        throw error;
      }

      console.log('✅ DIAGNOSIS SAVE: Successfully saved diagnosis');

      // If this is a scrapped outcome, check if we should clear the tray
      const savedOutcome = finalStatus === 'completed' ? completionOutcome : null;
      if (isScrappedOutcome(savedOutcome) && item.package_id) {
        try {
          // Get all repair item IDs linked to this package
          const { data: packageItems } = await supabase
            .from('inbound_package_items')
            .select('repair_item_id')
            .eq('package_id', item.package_id);

          if (packageItems && packageItems.length > 0) {
            const repairItemIds = packageItems
              .map(pi => pi.repair_item_id)
              .filter(Boolean);

            // Fetch all repair items to check their outcomes
            const { data: repairItems } = await supabase
              .from('repair_items')
              .select('completion_outcome')
              .in('id', repairItemIds);

            // Check if ALL items have scrapped outcomes
            const allScrapped = repairItems?.every(ri => 
              isScrappedOutcome(ri.completion_outcome)
            );

            if (allScrapped) {
              await supabase
                .from('inbound_packages')
                .update({ assigned_tray: null })
                .eq('id', item.package_id);

              toast({
                title: "Tray Cleared",
                description: "All items scrapped - tray is now available",
              });
            }
          }
        } catch (trayError) {
          console.error('Error checking tray status:', trayError);
          // Non-blocking error - don't prevent save completion
        }
      }

      toast({
        title: "Diagnosis Saved",
        description: `Diagnosis for ${item.item_name} has been updated.`,
      });
      
      console.log('🔧 DIAGNOSIS SAVE: Dispatching update event');
      // Dispatch custom event to refresh only this specific repair item
      const event = new CustomEvent('repair-item-updated', { 
        detail: { 
          packageId: item.package_id,
          itemId: item.id
        } 
      });
      window.dispatchEvent(event);
      
      console.log('🔧 DIAGNOSIS SAVE: Closing modal');
      handleClose();
    } catch (error) {
      console.error('❌ DIAGNOSIS SAVE: Error saving diagnosis:', error);
      
      let errorMessage = "Failed to save diagnosis. Please try again.";
      
      // Provide more specific error messages
      if (error?.message?.includes('permission')) {
        errorMessage = "You don't have permission to update this item.";
      } else if (error?.message?.includes('network')) {
        errorMessage = "Network error. Please check your connection.";
      } else if (error?.code === 'PGRST116') {
        errorMessage = "Item not found. It may have been deleted.";
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const handleCancel = () => {
    setDiagnosis("");
    setWorkflowStatus("logged");
    setDiagnosisAssessment("unknown");
    setCompletionOutcome("");
    setEstimatedCost("");
    handleClose();
  };

  // CRITICAL: Timer cleanup on modal close - DO NOT MODIFY
  const handleClose = async () => {
    await timer.cleanup();
    onClose();
  };

  // Calculate totals
  const subtotal = estimates.reduce((sum, est) => sum + est.total_amount, 0);
  const laborTotal = estimates
    .filter(est => est.item_type === 'labor')
    .reduce((sum, est) => sum + est.total_amount, 0);
  const grandTotal = subtotal;

  const handleEstimatedCostChange = (value: string) => {
    setEstimatedCost(value);
  };

  const handleEstimatedCostBlur = () => {
    if (estimatedCost && !isNaN(parseFloat(estimatedCost))) {
      setEstimatedCost(parseFloat(estimatedCost).toFixed(2));
    }
  };

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

  // Auto-save when estimates change
  useEffect(() => {
    if (estimates.length > 0) {
      const timeoutId = setTimeout(saveEstimates, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [estimates, saveEstimates]);

  // Estimate functions
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

  const handleCalculatorValue = (value: string) => {
    if (calculatorTarget) {
      updateEstimate(calculatorTarget.index, {
        [calculatorTarget.field]: parseFloat(value) || 0
      });
    }
    setCalculatorOpen(false);
    setCalculatorTarget(null);
  };

  // Drag and drop functions
  const getFilteredItems = (type?: string) => {
    return availableItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = !type || item.type === type;
      return matchesSearch && matchesType;
    });
  };

  const calculateItemPrice = (item: RepairItem) => {
    // No discount on labor items
    const discount = item.type === 'labor' ? 0 : discountRate;
    return item.price * (1 - discount);
  };

  const handleDragStart = (item: RepairItem) => {
    setDraggedItem(item);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedItem) {
      setShowQuantityInput(draggedItem.id);
      setTempQuantity(draggedItem.type === 'labor' ? "60" : "1");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const addToCart = (item: RepairItem, quantity: number) => {
    const discountedPrice = calculateItemPrice(item);
    const total = discountedPrice * quantity;
    
    const existingIndex = cartItems.findIndex(cartItem => cartItem.id === item.id);
    
    if (existingIndex >= 0) {
      const newCartItems = [...cartItems];
      newCartItems[existingIndex].quantity += quantity;
      newCartItems[existingIndex].total = newCartItems[existingIndex].price * newCartItems[existingIndex].quantity;
      setCartItems(newCartItems);
    } else {
      const newCartItem: CartItem = {
        ...item,
        price: discountedPrice,
        quantity,
        total
      };
      setCartItems([...cartItems, newCartItem]);
    }
    
    setShowQuantityInput(null);
    setDraggedItem(null);
  };

  const updateCartQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    
    setCartItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, quantity: newQuantity, total: item.price * newQuantity }
        : item
    ));
  };

  const removeFromCart = (itemId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'inventory': return <Package className="h-4 w-4" />;
      case 'labor': return <Wrench className="h-4 w-4" />;
      case 'assembly': return <Box className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Read-only mode is now handled via prop from parent, no early return needed

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>{readOnly ? 'View' : (item.diagnosis ? 'Edit' : 'Diagnose')} Item {itemIndex} of {totalItems}</span>
                {readOnly && (
                  <Badge variant="secondary" className="text-xs">View Only</Badge>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>{timer.formatTime(timer.elapsedTime)}</span>
                </div>
              </div>
            </DialogTitle>
            <div className="text-sm text-blue-600">
              Tray: {trayNumber || '—'} | Item: {itemIndex} of {totalItems}
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
              <TabsTrigger value="estimate-builder">Estimate Builder</TabsTrigger>
              <TabsTrigger value="actually-used" className="flex items-center gap-1">
                <CheckSquare className="h-3 w-3" />
                Actually Used
              </TabsTrigger>
            </TabsList>

            <TabsContent value="diagnosis" className="space-y-4">

              <div className="space-y-4">
                {/* Item Info */}
                <div className="space-y-2 text-sm">
                  <div className="font-medium text-foreground">{item.item_name}</div>
                {(() => {
                  const hasValidSerial = item.serial_number && item.serial_number !== "0" && item.serial_number.trim() !== "";
                  const hasValidMac = item.mac_address && item.mac_address !== "0" && item.mac_address.trim() !== "";
                  
                  if (!hasValidSerial && !hasValidMac) return null;
                  
                  return (
                    <div className="text-muted-foreground">
                      <FinancialGuard kind="revenue">{hasValidSerial && `SN: ${item.serial_number}`}</FinancialGuard>
                      {hasValidSerial && hasValidMac && " • "}
                      <FinancialGuard kind="revenue">{hasValidMac && `MAC: ${item.mac_address}`}</FinancialGuard>
                    </div>
                  );
                })()}
                  
                  {/* Problem Reported by Customer */}
                  {item.problem_reported && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="text-sm font-medium text-amber-800 mb-1">
                        Problem Reported by Customer:
                      </div>
                      <div className="text-sm text-amber-700">
                        {item.problem_reported}
                      </div>
                    </div>
                  )}
                </div>

                {/* Diagnosis */}
                <div className="space-y-2">
                  <Label htmlFor="diagnosis" className="text-sm font-medium">
                    Diagnosis *
                  </Label>
                  <Textarea
                    id="diagnosis"
                    placeholder="Describe the issue and findings..."
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="min-h-[100px] resize-none"
                    disabled={readOnly}
                  />
                </div>

                {/* Repairability Status */}
                <div className="space-y-2">
                  <Label htmlFor="repairability-status" className="text-sm font-medium">
                    Repairability Status
                  </Label>
                  <Select value={diagnosisAssessment} onValueChange={handleRepairabilityStatusChange} disabled={readOnly}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select repairability status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      <SelectItem value="repairable">Repairable</SelectItem>
                      <SelectItem value="all_tests_passed">All Tests PASSED</SelectItem>
                      <SelectItem value="not_repairable">Not Repairable</SelectItem>
                      <SelectItem value="needs_parts">Needs Parts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Workflow Status - Read-only Badge */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Workflow Status</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusVariant(workflowStatus)} className="text-sm px-3 py-1">
                      {formatStatus(workflowStatus)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Status updates automatically based on diagnosis and repair time
                  </p>
                </div>

                {/* Mark as Completed + Completion Outcome - Same Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 border rounded-lg bg-muted/30">
                  {/* Mark as Completed Toggle */}
                  <div className="flex items-center justify-between gap-4 flex-shrink-0">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Mark as Completed</Label>
                      <p className="text-xs text-muted-foreground">Toggle when finished</p>
                    </div>
                    <Switch
                      checked={workflowStatus === 'completed'}
                      onCheckedChange={handleCompletedToggle}
                      disabled={readOnly}
                    />
                  </div>

                  {/* Completion Outcome - inline when completed */}
                  {workflowStatus === 'completed' && (
                    <div className="flex-1 min-w-[200px] space-y-1">
                      <Label className="text-sm font-medium">Completion Outcome *</Label>
                      <Select value={completionOutcome} onValueChange={setCompletionOutcome} disabled={readOnly}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select outcome" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="repaired">Repaired</SelectItem>
                          <SelectItem value="no_repair_needed">No Repair Needed</SelectItem>
                          <SelectItem value="replaced">Replaced</SelectItem>
                          <SelectItem value="customer_declined_scrapped">Customer Declined - Scrapped</SelectItem>
                          <SelectItem value="customer_declined_returned">Customer Declined - Returned</SelectItem>
                          <SelectItem value="unrepairable_scrapped">Unrepairable - Scrapped</SelectItem>
                          <SelectItem value="unrepairable_returned">Unrepairable - Returned</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Estimated Repair Cost */}
                <div className="space-y-2">
                  <Label htmlFor="cost" className="text-sm font-medium">
                    Estimated Repair Cost
                  </Label>
                  <FinancialGuard kind="revenue"><Input
                    id="cost"
                    type="number"
                    step="0.0001"
                    placeholder="0.00"
                    value={estimatedCost}
                    onChange={(e) => handleEstimatedCostChange(e.target.value)}
                    onBlur={handleEstimatedCostBlur}
                    className="pl-8"
                    disabled={readOnly}
                  /></FinancialGuard>
                  <p className="text-xs text-muted-foreground">
                    Optional - for customer estimates
                  </p>
                </div>

                {/* Footer */}
                <div className="flex gap-3 pt-4 border-t">
                  {!readOnly && (
                    <Button
                      onClick={handleSave}
                      className="flex-1"
                      disabled={!diagnosis || (workflowStatus === 'completed' && !completionOutcome)}
                    >
                      {item.diagnosis ? 'Update Diagnosis' : 'Save Diagnosis'}
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleCancel} className={readOnly ? "flex-1" : ""}>
                    {readOnly ? 'Close' : 'Cancel'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="estimate-builder" className="space-y-4">
              <div className="grid grid-cols-2 gap-4 h-96">
                {/* Available Items Panel */}
                <Card className="flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Available Items
                    </CardTitle>
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 h-8 text-sm"
                        disabled={readOnly}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 p-3 pt-0">
                    <Tabs defaultValue="all" className="h-full flex flex-col">
                      <TabsList className="grid w-full grid-cols-4 h-8">
                        <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                        <TabsTrigger value="inventory" className="text-xs">Parts</TabsTrigger>
                        <TabsTrigger value="labor" className="text-xs">Labor</TabsTrigger>
                        <TabsTrigger value="assembly" className="text-xs">ASYs</TabsTrigger>
                      </TabsList>
                      
                      {['all', 'inventory', 'labor', 'assembly'].map(tab => (
                        <TabsContent key={tab} value={tab} className="flex-1 mt-2 space-y-1 overflow-y-auto">
                          {getFilteredItems(tab === 'all' ? undefined : tab).map(item => (
                            <div
                              key={item.id}
                              draggable={!readOnly}
                              onDragStart={readOnly ? undefined : () => handleDragStart(item)}
                              className={`p-2 border rounded ${readOnly ? 'opacity-60' : 'cursor-grab hover:bg-accent/50 active:cursor-grabbing'}`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {getTypeIcon(item.type)}
                                <span className="text-xs font-medium truncate">{item.name}</span>
                              </div>
                              <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span>{item.sku}</span>
                                <span className="font-medium">
                                  <FinancialGuard kind="revenue">{formatCurrency(calculateItemPrice(item))}</FinancialGuard>
                                </span>
                              </div>
                              {item.type === 'labor' && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  per {item.unit}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Repair Cart Panel */}
                <Card className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        Repair Estimate
                      </CardTitle>
                      {cartItems.length > 0 && !readOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCartItems([])}
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent 
                    className="flex-1 p-3 pt-0 overflow-y-auto"
                    onDrop={readOnly ? undefined : handleDrop}
                    onDragOver={readOnly ? undefined : handleDragOver}
                  >
                    {cartItems.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                        <div>
                          <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs">Drag items here to build repair estimate</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cartItems.map(item => (
                          <div key={item.id} className="p-2 border rounded bg-background">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {getTypeIcon(item.type)}
                                  <span className="text-xs font-medium truncate">{item.name}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">{item.sku}</div>
                              </div>
                              {!readOnly && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFromCart(item.id)}
                                  className="h-4 w-4 p-0 ml-2"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {!readOnly && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                                  className="h-5 w-5 p-0"
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="h-2 w-2" />
                                </Button>
                              )}
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateCartQuantity(item.id, parseInt(e.target.value) || 1)}
                                className="h-5 w-12 text-xs text-center p-0 border-0"
                                min="1"
                                disabled={readOnly}
                              />
                              {!readOnly && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                                  className="h-5 w-5 p-0"
                                >
                                  <Plus className="h-2 w-2" />
                                </Button>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">
                                <FinancialGuard kind="revenue">{formatCurrency(item.total)}</FinancialGuard>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                  
                  {cartItems.length > 0 && (
                    <div className="px-3 py-2 border-t bg-muted/20">
                      <div className="text-xs font-medium text-right">
                        Total: {formatCurrency(cartItems.reduce((sum, item) => sum + item.total, 0))}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="actually-used" className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3 className="text-lg font-semibold">Actually Used</h3>
                  <p className="text-sm text-muted-foreground">
                    Record actual parts, labor, and assemblies used for this repair
                  </p>
                </div>
              </div>
              <ActuallyUsedPanel
                repairItemId={item.id}
                isDistributor={isDistributor}
                discountRate={discountRate}
                customerIsTaxable={company?.is_taxable ?? true}
                readOnly={readOnly}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Quantity Input Modal */}
      {showQuantityInput && draggedItem && (
        <Dialog open={!!showQuantityInput} onOpenChange={() => setShowQuantityInput(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add {draggedItem.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="quantity">Quantity ({draggedItem.unit || 'each'})</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={tempQuantity}
                  onChange={(e) => setTempQuantity(e.target.value)}
                  min="1"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => addToCart(draggedItem, parseInt(tempQuantity) || 1)}
                  className="flex-1"
                >
                  Add to Cart
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowQuantityInput(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Calculator Modal */}
      <Calculator
        isOpen={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
        onValueSelect={handleCalculatorValue}
        initialValue={calculatorTarget ? 
          String(calculatorTarget.field === 'quantity' ? estimates[calculatorTarget.index]?.quantity : estimates[calculatorTarget.index]?.unit_rate) 
          : "0"
        }
      />
    </>
  );
};