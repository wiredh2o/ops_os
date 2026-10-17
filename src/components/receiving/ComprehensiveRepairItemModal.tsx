import React, { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Camera, Search, Minus, Trash2, Package, Wrench, Box, Calculator as CalculatorIcon, Play, Pause, Square, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Calculator } from "@/components/ui/calculator";
import { useCompanies } from "@/hooks/useCompanies";
import { useRepairTimer } from "@/hooks/useRepairTimer";
import { PhotoUploader, SelectedPhoto } from "@/components/repairs/PhotoUploader";
import { isRepairComplete } from "@/lib/repair-item-status-ui";
import { removeBackgroundFromFile } from "@/lib/image/backgroundRemoval";

export type RepairItemData = {
  id: string;
  item_name: string;
  serial_number?: string | null;
  mac_address?: string | null;
  problem_reported?: string | null;
  notes?: string | null;
  status?: string;
  package_id?: string;
};

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

interface ComprehensiveRepairItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageId?: string;
  editItem?: RepairItemData;
  onSuccess?: () => void;
  mode: 'add' | 'edit';
  companyId?: string;
  readOnly?: boolean;
}

export const ComprehensiveRepairItemModal: React.FC<ComprehensiveRepairItemModalProps> = ({
  isOpen,
  onClose,
  packageId,
  editItem,
  onSuccess,
  mode,
  companyId,
  readOnly = false
}) => {
  // Item details state
  const [itemDescription, setItemDescription] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [problemReported, setProblemReported] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInProgressRef = useRef(false);
  
  // Estimate state
  const [estimates, setEstimates] = useState<EstimateItem[]>([]);
  const [availableInventory, setAvailableInventory] = useState<InventoryItem[]>([]);
  const [availableLabor, setAvailableLabor] = useState<LaborItem[]>([]);
  const [availableAssemblies, setAvailableAssemblies] = useState<AssemblyItem[]>([]);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorTarget, setCalculatorTarget] = useState<{index: number, field: 'quantity' | 'unit_rate'} | null>(null);
  const [isRepairCompleted, setIsRepairCompleted] = useState(false);
  
  // Drag and drop estimate state
  const [availableItems, setAvailableItems] = useState<RepairItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedItem, setDraggedItem] = useState<RepairItem | null>(null);
  const [showQuantityInput, setShowQuantityInput] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState("1");
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const { toast } = useToast();
  const { data: companies } = useCompanies();

  // Timer hook (only for edit mode when item exists)
  const timer = useRepairTimer({
    repairItemId: editItem?.id || '',
    packageId: editItem?.package_id || packageId || '',
    isModalOpen: isOpen && mode === 'edit' && !!editItem,
    onClose
  });

  // Get company discount info
  const company = companies?.find(c => c.id === companyId);
  const isDistributor = company?.is_distributor || false;
  const discountRate = isDistributor ? 0.1 : 0; // 10% discount for distributors

  // Initialize form based on mode
  useEffect(() => {
    if (mode === 'edit' && editItem) {
      setItemDescription(editItem.item_name || "");
      setSerialNumber(editItem.serial_number || "");
      setMacAddress(editItem.mac_address || "");
      setProblemReported(editItem.problem_reported || "");
      setNotes(editItem.notes || "");
      // Recognize completed, repaired (legacy), and shipping-phase statuses as complete
      setIsRepairCompleted(isRepairComplete(editItem.status));
      setPhotos([]); // TODO: Load existing photos
    } else {
      // Clear form for add mode
      setItemDescription("");
      setSerialNumber("");
      setMacAddress("");
      setProblemReported("");
      setNotes("");
      setPhotos([]);
      setIsRepairCompleted(false);
    }
  }, [mode, editItem, isOpen]);

  // Load data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      try {
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

        // Load existing estimates if in edit mode
        if (mode === 'edit' && editItem) {
          const { data: existingEstimates } = await supabase
            .from('repair_item_estimates')
            .select(`
              id, quantity, description, unit_rate, total_amount,
              inventory_item_id, labor_item_id, assembly_id,
              inventory_items (sku, sales_description, eligible_for_distributor_discount),
              labor_items (item_number, name, eligible_for_distributor_discount),
              assemblies (sku, description, eligible_for_distributor_discount)
            `)
            .eq('repair_item_id', editItem.id);

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
  }, [isOpen, mode, editItem, toast]);

  // Auto-save estimates
  const saveEstimates = useCallback(async () => {
    if (!editItem || estimates.length === 0) return;

    try {
      // Delete existing estimates for this repair item
      await supabase
        .from('repair_item_estimates')
        .delete()
        .eq('repair_item_id', editItem.id);

      // Insert new estimates
      const estimateData = estimates.map(est => ({
        repair_item_id: editItem.id,
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
  }, [estimates, editItem]);

  // Auto-save when estimates change
  useEffect(() => {
    if (estimates.length > 0 && mode === 'edit') {
      const timeoutId = setTimeout(saveEstimates, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [estimates, saveEstimates, mode]);

  const formatMacAddress = (value: string) => {
    const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    const formatted = hex.match(/.{1,2}/g)?.join(':') || hex;
    return formatted.substring(0, 8); // Limit to XX:XX:XX format
  };

  const handleMacAddressChange = (value: string) => {
    const formatted = formatMacAddress(value);
    setMacAddress(formatted);
  };


  const uploadPhotos = async (repairItemId: string) => {
    if (!packageId) return;
    
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const shouldRemove = photo.removeBg;
      const toUpload: Blob = shouldRemove ? await removeBackgroundFromFile(photo.file) : photo.file;

      const ext = shouldRemove ? 'png' : (photo.file.name.split('.').pop()?.toLowerCase() || 'jpg');
      const path = `repair-items/${packageId}/${repairItemId}/${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('repairs-intake')
        .upload(path, toUpload, { 
          contentType: shouldRemove ? 'image/png' : (photo.file.type || 'image/jpeg'), 
          upsert: false 
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('repair_item_photos')
        .insert({ 
          repair_item_id: repairItemId, 
          file_path: path 
        });

      if (insertError) throw insertError;
    }
  };

  const handleSubmit = async () => {
    // Prevent rapid double-clicks with synchronous ref check
    if (submissionInProgressRef.current) {
      console.log('ComprehensiveRepairItemModal: Submission already in progress, ignoring');
      return;
    }
    submissionInProgressRef.current = true;

    if (!itemDescription.trim()) {
      toast({
        title: "Missing Information",
        description: "Item description is required.",
        variant: "destructive"
      });
      submissionInProgressRef.current = false;
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'edit' && editItem) {
        // Update existing item
        const { error } = await supabase
          .from('repair_items')
          .update({
            item_name: itemDescription.trim(),
            serial_number: serialNumber.trim() || null,
            mac_address: macAddress.trim() || null,
            problem_reported: problemReported.trim() || null,
            notes: notes.trim() || null,
          })
          .eq('id', editItem.id);

        if (error) throw error;

        toast({
          title: "Item Updated",
          description: "Repair item has been successfully updated.",
        });

        // Dispatch event to refresh UI
        const event = new CustomEvent('repair-item-updated', { 
          detail: { 
            packageId: editItem.package_id || packageId,
            itemId: editItem.id
          } 
        });
        window.dispatchEvent(event);

        onSuccess?.();
        onClose();
      } else {
        // Add new item
        if (!packageId) {
          throw new Error("Package ID is required for adding items");
        }

        // Create repair item; junction row gets unboxing_order assigned atomically by DB trigger
        let repairItemId: string | null = null;
        {
          const { data: repairItem, error } = await supabase
            .from('repair_items')
            .insert({
              package_id: packageId,
              item_name: itemDescription.trim(),
              serial_number: serialNumber.trim() || null,
              mac_address: macAddress.trim() || null,
              problem_reported: problemReported.trim() || null,
              notes: notes.trim() || null,
            })
            .select('id')
            .single();

          if (error || !repairItem) throw error;
          repairItemId = repairItem.id;

          const { error: linkError } = await supabase
            .from('inbound_package_items')
            .insert({
              package_id: packageId,
              repair_item_id: repairItem.id,
              // unboxing_order intentionally omitted — assigned by BEFORE INSERT trigger
            } as any);


          if (linkError) {
            // Roll back the repair item if linking failed
            await supabase.from('repair_items').delete().eq('id', repairItemId);
            repairItemId = null;
            throw linkError;
          }
        }



        // Upload photos if any
        if (photos.length > 0 && repairItemId) {
          await uploadPhotos(repairItemId);
        }

        toast({
          title: "Item Added",
          description: "Repair item has been successfully added.",
        });

        // Dispatch event to refresh UI
        const event = new CustomEvent('repair-item-added', { 
          detail: { 
            packageId: packageId,
            itemId: repairItemId
          } 
        });
        window.dispatchEvent(event);

        // Clear form for next item
        setItemDescription("");
        setSerialNumber("");
        setMacAddress("");
        setProblemReported("");
        setNotes("");
        setPhotos([]);
        
        onSuccess?.();
      }
    } catch (error) {
      console.error('Error saving repair item:', error);
      toast({
        title: "Error",
        description: `Failed to ${mode === 'edit' ? 'update' : 'add'} repair item. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
      submissionInProgressRef.current = false;
    }
  };

  const handleRepairCompletedToggle = async (checked: boolean) => {
    if (!editItem) return;
    
    try {
      await supabase
        .from('repair_items')
        .update({
          status: checked ? 'repaired' : 'in_repair'
        })
        .eq('id', editItem.id);

      setIsRepairCompleted(checked);
      
      // Dispatch event to refresh the UI
      const event = new CustomEvent('repair-item-updated', { 
        detail: { 
          packageId: editItem.package_id,
          itemId: editItem.id
        } 
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Error updating repair status:', error);
    }
  };

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

  // Timer cleanup on modal close
  const handleClose = async () => {
    if (mode === 'edit' && timer) {
      await timer.cleanup();
    }
    onClose();
  };

  const subtotal = estimates.reduce((sum, est) => sum + est.total_amount, 0);
  const laborTotal = estimates
    .filter(est => est.item_type === 'labor')
    .reduce((sum, est) => sum + est.total_amount, 0);
  const grandTotal = subtotal;

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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span>{readOnly ? 'View' : (mode === 'edit' ? 'Edit' : 'Add')} Repair Item</span>
                {readOnly && (
                  <Badge variant="secondary" className="text-xs">View Only</Badge>
                )}
                {mode === 'edit' && timer && !readOnly && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{timer.formatTime(timer.elapsedTime)}</span>
                  </div>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Item name *</Label>
              <Input 
                id="itemName" 
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial number</Label>
              <Input 
                id="serialNumber" 
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="macAddress">MAC address</Label>
              <Input 
                id="macAddress" 
                value={macAddress}
                onChange={(e) => handleMacAddressChange(e.target.value)}
                placeholder="XX:XX:XX"
                maxLength={8}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="problemReported">Problem reported</Label>
              <Textarea 
                id="problemReported" 
                rows={3} 
                value={problemReported}
                onChange={(e) => setProblemReported(e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                rows={3} 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>

          {!readOnly && (
            <div className="space-y-2 md:col-span-2">
              <Label>Photos</Label>
              <PhotoUploader 
                onChange={setPhotos}
                multiple={true}
                allowCamera={true}
                enableBgRemovalToggle={true}
              />
            </div>
          )}

          {mode === 'edit' && editItem && !readOnly && (
            <div className="flex items-center space-x-2 p-4 border rounded">
              <Switch
                id="repair-completed"
                checked={isRepairCompleted}
                onCheckedChange={handleRepairCompletedToggle}
              />
              <Label htmlFor="repair-completed">Mark repair as completed</Label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              {readOnly ? 'Close' : (mode === 'add' ? 'Close' : 'Cancel')}
            </Button>
            {!readOnly && (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : mode === 'edit' ? 'Update Item' : 'Save Item'}
              </Button>
            )}
          </div>
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