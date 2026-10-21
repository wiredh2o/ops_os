import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Trash2, Plus, Check, ChevronsUpDown, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { sortDimensions, calculateVolumeFromDimensions, formatDimensionsDisplay } from "@/lib/dimension-utils";
import { PhotoUploader, SelectedPhoto } from "@/components/repairs/PhotoUploader";
import { uploadInventoryImages, formatExistingImages, combineImageUrls } from "@/lib/image-upload-utils";
import { formatCurrency, cn } from "@/lib/utils";
import { AssemblySalesUomEditor, AssemblySalesUom, saveAssemblySalesUoms, loadAssemblySalesUoms } from "@/components/inventory/AssemblySalesUomEditor";
import { AssemblyPurchaseUomEditor, AssemblyPurchaseUom, saveAssemblyPurchaseUoms, loadAssemblyPurchaseUoms } from "@/components/inventory/AssemblyPurchaseUomEditor";
import { SerialTrackingSection, SerialTrackingType } from "./SerialTrackingSection";
import { PackedShapeEditor } from "./PackedShapeEditor";
import { type PackedShape, type PaperThicknesses } from "@/lib/shape-volume-utils";

interface Supplier {
  id: string;
  name: string;
  is_active: boolean;
}

interface InventoryItem {
  id: string;
  sku: string;
  unit_price: number;
  quantity_on_hand: number;
}

interface Assembly {
  id: string;
  sku: string;
  sales_description?: string;
  purchase_description?: string;
  selling_price: number;
  markup_percentage: number;
  lead_time_days?: number;
  dimension_l?: number;
  dimension_w?: number;
  dimension_h?: number;
  packed_dimension_l?: number;
  packed_dimension_w?: number;
  packed_dimension_h?: number;
  weight_oz?: number;
  volume_cubic_inches?: number;
  packed_volume_cubic_inches?: number;
  density?: number;
  packed_density?: number;
  quantity_on_hand?: number;
  quantity_allocated?: number;
  quantity_on_order?: number;
  quantity_atp?: number;
  quantity_ats?: number;
  reorder_point?: number;
  eligible_for_distributor_discount?: boolean;
  visible_for_sale?: boolean;
  is_subassembly?: boolean;
  active?: boolean;
  taxable?: boolean;
  consumption_last_12_months?: number;
  consumption_start_date?: string;
  daily_consumption_rate?: number;
  image_urls?: string[];
  // Make vs. Buy fields
  is_externally_sourced?: boolean;
  is_consigned?: boolean;
  external_supplier_id?: string;
  manufacturer_part_number?: string;
  // Serial tracking fields
  serial_tracking_type?: 'none' | 'manual' | 'auto_date';
  serial_prefix?: string;
  // Shipping fields
  ships_in_own_packaging?: boolean;
  always_ship_stacked?: boolean;
  max_stack_quantity?: number | null;
}

interface AssemblyComponent {
  id?: string;
  inventory_item_id: string;
  quantity_needed: number;
  inventory_item?: InventoryItem;
}

interface AssemblyFormProps {
  assembly?: Assembly | null;
  inventoryItems: InventoryItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export const AssemblyForm = ({ assembly, inventoryItems, onClose, onSuccess }: AssemblyFormProps) => {
  const [formData, setFormData] = useState({
    sku: assembly?.sku || '',
    sales_description: assembly?.sales_description || '',
    purchase_description: assembly?.purchase_description || '',
    selling_price: assembly?.selling_price?.toString() || '',
    markup_percentage: assembly?.markup_percentage?.toString() || '0',
    lead_time_days: assembly?.lead_time_days?.toString() || '30',
    width: assembly?.dimension_w?.toString() || '', // Load from database
    length: assembly?.dimension_l?.toString() || '', // Load from database
    depth: assembly?.dimension_h?.toString() || '', // Load from database
    packed_width: assembly?.packed_dimension_w?.toString() || '', // Load from database
    packed_length: assembly?.packed_dimension_l?.toString() || '', // Load from database
    packed_depth: assembly?.packed_dimension_h?.toString() || '', // Load from database
    weight_oz: assembly?.weight_oz?.toString() || '',
    // Volume fields are auto-calculated and read-only
    quantity_on_hand: assembly?.quantity_on_hand?.toString() || '0',
    quantity_allocated: assembly?.quantity_allocated?.toString() || '0',
    // quantity_on_order is auto-calculated, not user-editable
    quantity_atp: assembly?.quantity_atp?.toString() || '0',
    quantity_ats: assembly?.quantity_ats?.toString() || '0',
    eligible_for_distributor_discount: assembly?.eligible_for_distributor_discount ?? true,
    visible_for_sale: assembly?.visible_for_sale ?? true,
    is_subassembly: assembly?.is_subassembly ?? false,
    active: assembly?.active ?? true,
    taxable: assembly?.taxable ?? true,
    consumption_last_12_months: assembly?.consumption_last_12_months?.toString() || '0',
    consumption_start_date: assembly?.consumption_start_date || '',
    daily_consumption_rate: assembly?.daily_consumption_rate?.toString() || '0',
    // Make vs. Buy fields
    is_externally_sourced: assembly?.is_externally_sourced ?? false,
    is_consigned: assembly?.is_consigned ?? false,
    external_supplier_id: assembly?.external_supplier_id || '',
    manufacturer_part_number: assembly?.manufacturer_part_number || '',
    // Serial tracking fields
    serial_tracking_type: (assembly?.serial_tracking_type || 'none') as SerialTrackingType,
    serial_prefix: assembly?.serial_prefix || '',
    // Shipping fields
    ships_in_own_packaging: assembly?.ships_in_own_packaging ?? false,
    always_ship_stacked: assembly?.always_ship_stacked ?? false,
    max_stack_quantity: assembly?.max_stack_quantity?.toString() ?? '',
    // Shape & packing paper fields
    packed_shape: ((assembly as any)?.packed_shape || 'box') as PackedShape,
    packed_diameter: (assembly as any)?.packed_diameter?.toString() || '',
    actual_packed_volume_cubic_inches: (assembly as any)?.actual_packed_volume_cubic_inches?.toString() || '',
    paper_thickness_top: (assembly as any)?.paper_thickness_top?.toString() || '0',
    paper_thickness_bottom: (assembly as any)?.paper_thickness_bottom?.toString() || '0',
    paper_thickness_left: (assembly as any)?.paper_thickness_left?.toString() || '0',
    paper_thickness_right: (assembly as any)?.paper_thickness_right?.toString() || '0',
    paper_thickness_front: (assembly as any)?.paper_thickness_front?.toString() || '0',
    paper_thickness_back: (assembly as any)?.paper_thickness_back?.toString() || '0',
    paper_thickness_side: (assembly as any)?.paper_thickness_side?.toString() || '0',
    paper_thickness_uniform: (assembly as any)?.paper_thickness_uniform?.toString() || '0',
  });
  const [components, setComponents] = useState<AssemblyComponent[]>([]);
  const [loading, setLoading] = useState(false);
  // modelerOpen state removed - handled by PackedShapeEditor
  const [safetyStock, setSafetyStock] = useState<number | null>(null);
  const [safetyStockLoading, setSafetyStockLoading] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [salesUoms, setSalesUoms] = useState<AssemblySalesUom[]>([]);
  const [purchaseUoms, setPurchaseUoms] = useState<AssemblyPurchaseUom[]>([]);
  // Vendor dropdown state
  const [vendors, setVendors] = useState<Supplier[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState("");
  const { toast } = useToast();

  // Load sales UOMs when editing
  useEffect(() => {
    if (assembly?.id) {
      loadAssemblySalesUoms(assembly.id).then(uoms => {
        if (uoms.length > 0) {
          setSalesUoms(uoms);
        } else {
          // Initialize with default UOM from current selling price
          setSalesUoms([{
            description: '1pc Lot',
            quantity: 1,
            unit_price: assembly.selling_price || 0,
            is_default: true,
            sort_order: 0,
            isNew: true,
          }]);
        }
      }).catch(console.error);
    } else {
      // New assembly - start with empty UOM list
      setSalesUoms([]);
    }
  }, [assembly?.id]);

  // Load purchase UOMs when editing
  useEffect(() => {
    if (assembly?.id) {
      loadAssemblyPurchaseUoms(assembly.id).then(uoms => {
        setPurchaseUoms(uoms);
      }).catch(console.error);
    } else {
      setPurchaseUoms([]);
    }
  }, [assembly?.id]);

  // Load vendors on mount
  useEffect(() => {
    const fetchVendors = async () => {
      setVendorsLoading(true);
      try {
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true });
        
        if (error) throw error;
        setVendors(data || []);
      } catch (error) {
        console.error('Error fetching vendors:', error);
      } finally {
        setVendorsLoading(false);
      }
    };
    fetchVendors();
  }, []);

  useEffect(() => {
    if (assembly) {
      fetchAssemblyComponents();
    }
  }, [assembly]);

  // Calculate safety stock when lead time or assembly changes
  useEffect(() => {
    if (assembly?.id && formData.lead_time_days) {
      calculateSafetyStock();
    }
  }, [assembly?.id, formData.lead_time_days]);

  const calculateSafetyStock = async () => {
    if (!assembly?.id || !formData.lead_time_days) return;
    
    setSafetyStockLoading(true);
    try {
      const { data, error } = await supabase.rpc('calculate_assembly_statistical_safety_stock', {
        assembly_id_param: assembly.id,
        lead_time_days: parseInt(formData.lead_time_days),
        analysis_period_days: 365
      });
      
      if (error) throw error;
      setSafetyStock(data || 0);
    } catch (error) {
      console.error('Error calculating safety stock:', error);
      setSafetyStock(null);
    } finally {
      setSafetyStockLoading(false);
    }
  };

  const calculateDaysOfSupply = (quantity: string, dailyRate: string) => {
    const qty = parseFloat(quantity) || 0;
    const rate = parseFloat(dailyRate) || 0;
    if (rate <= 0) return null;
    return (qty / rate).toFixed(1);
  };

  const formatQuantityWithDays = (quantity: string, dailyRate: string) => {
    const days = calculateDaysOfSupply(quantity, dailyRate);
    return days ? `${quantity} units (${days} days)` : `${quantity} units`;
  };

  const fetchAssemblyComponents = async () => {
    if (!assembly) return;

    try {
      const { data, error } = await supabase
        .from('assembly_components')
        .select(`
          *,
          inventory_item:inventory_items(*)
        `)
        .eq('assembly_id', assembly.id);

      if (error) throw error;

      setComponents(data.map(comp => ({
        id: comp.id,
        inventory_item_id: comp.inventory_item_id,
        quantity_needed: comp.quantity_needed,
        inventory_item: comp.inventory_item
      })));
    } catch (error) {
      console.error('Error fetching assembly components:', error);
    }
  };

  const addComponent = () => {
    setComponents(prev => [...prev, {
      inventory_item_id: '',
      quantity_needed: 1
    }]);
  };

  const removeComponent = (index: number) => {
    setComponents(prev => prev.filter((_, i) => i !== index));
  };

  const updateComponent = (index: number, field: keyof AssemblyComponent, value: any) => {
    setComponents(prev => prev.map((comp, i) => {
      if (i === index) {
        const updated = { ...comp, [field]: value };
        if (field === 'inventory_item_id') {
          updated.inventory_item = inventoryItems.find(item => item.id === value);
        }
        return updated;
      }
      return comp;
    }));
  };

  const calculateTotalCost = () => {
    return components.reduce((total, comp) => {
      const item = inventoryItems.find(item => item.id === comp.inventory_item_id);
      return total + (item ? item.unit_price * comp.quantity_needed : 0);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate max_stack_quantity is required when always_ship_stacked is checked
    if (formData.always_ship_stacked && (!formData.max_stack_quantity || parseInt(formData.max_stack_quantity as string) <= 0)) {
      toast({ title: 'Validation Error', description: 'Max units per stack is required when "Always ship stacked" is enabled.', variant: 'destructive' });
      return;
    }

    if (!formData.sku.trim()) {
      toast({
        title: 'Error',
        description: 'SKU is required',
        variant: 'destructive',
      });
      return;
    }

    // Validate at least one UOM exists
    const activeUoms = salesUoms.filter(u => !u.isDeleted);
    if (activeUoms.length === 0) {
      toast({
        title: 'Error',
        description: 'At least one sales price (UOM) is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.markup_percentage || parseFloat(formData.markup_percentage) < 0) {
      toast({
        title: 'Error',
        description: 'Markup percentage must be 0 or greater',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.lead_time_days || parseInt(formData.lead_time_days) < 1) {
      toast({
        title: 'Error',
        description: 'Lead time must be at least 1 day',
        variant: 'destructive',
      });
      return;
    }

    if (components.length === 0) {
      toast({
        title: 'Error',
        description: 'Assembly must have at least one component',
        variant: 'destructive',
      });
      return;
    }

    const invalidComponents = components.filter(comp => 
      !comp.inventory_item_id || comp.quantity_needed <= 0
    );
    if (invalidComponents.length > 0) {
      toast({
        title: 'Error',
        description: 'All components must have a valid item and quantity greater than 0',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Sort dimensions automatically before saving
      const sortedDimensions = sortDimensions(formData.width, formData.length, formData.depth);
      const sortedPackedDimensions = formData.packed_shape === 'box'
        ? sortDimensions(formData.packed_width, formData.packed_length, formData.packed_depth)
        : {
            dimension_l: formData.packed_length ? parseFloat(formData.packed_length) : null,
            dimension_w: formData.packed_width ? parseFloat(formData.packed_width) : null,
            dimension_h: formData.packed_depth ? parseFloat(formData.packed_depth) : null,
          };
      
      // Auto-calculate volume from dimensions
      const finalVolume = calculateVolumeFromDimensions(sortedDimensions);
      const finalPackedVolume = calculateVolumeFromDimensions(sortedPackedDimensions);

      // Get default UOM price for backward compatibility
      const defaultUom = salesUoms.filter(u => !u.isDeleted).find(u => u.is_default) 
        || salesUoms.filter(u => !u.isDeleted)[0];
      const sellingPrice = defaultUom ? defaultUom.unit_price : 0;

      const assemblyData = {
        sku: formData.sku.trim(),
        sales_description: formData.sales_description.trim() || null,
        purchase_description: formData.purchase_description.trim() || null,
        selling_price: sellingPrice,
        markup_percentage: parseFloat(formData.markup_percentage) || 0,
        lead_time_days: parseInt(formData.lead_time_days) || 30,
        dimension_l: sortedDimensions.dimension_l,
        dimension_w: sortedDimensions.dimension_w,
        dimension_h: sortedDimensions.dimension_h,
        packed_dimension_l: sortedPackedDimensions.dimension_l,
        packed_dimension_w: sortedPackedDimensions.dimension_w,
        packed_dimension_h: sortedPackedDimensions.dimension_h,
        volume_cubic_inches: finalVolume,
        packed_volume_cubic_inches: finalPackedVolume,
        quantity_on_hand: parseInt(formData.quantity_on_hand),
        quantity_allocated: parseInt(formData.quantity_allocated),
        // quantity_on_order, ATP and ATS are calculated fields - don't save user input
        eligible_for_distributor_discount: formData.eligible_for_distributor_discount,
        visible_for_sale: formData.visible_for_sale,
        is_subassembly: formData.is_subassembly,
        active: formData.active,
        taxable: formData.taxable,
        consumption_last_12_months: parseInt(formData.consumption_last_12_months),
        consumption_start_date: formData.consumption_start_date || null,
        // Make vs. Buy fields
        is_externally_sourced: formData.is_externally_sourced,
        is_consigned: formData.is_externally_sourced ? formData.is_consigned : false,
        external_supplier_id: formData.is_externally_sourced && formData.external_supplier_id ? formData.external_supplier_id : null,
        manufacturer_part_number: formData.manufacturer_part_number ? formData.manufacturer_part_number.trim() : null,
        // Serial tracking fields
        serial_tracking_type: formData.serial_tracking_type,
        serial_prefix: formData.serial_tracking_type === 'auto_date' ? formData.serial_prefix.trim() : null,
        // Shipping fields
        ships_in_own_packaging: formData.ships_in_own_packaging,
        always_ship_stacked: formData.always_ship_stacked,
        max_stack_quantity: formData.max_stack_quantity !== '' ? parseInt(formData.max_stack_quantity as string) : null,
        // Shape & packing paper fields
        packed_shape: formData.packed_shape,
        packed_diameter: formData.packed_diameter ? parseFloat(formData.packed_diameter) : null,
        actual_packed_volume_cubic_inches: formData.actual_packed_volume_cubic_inches ? parseFloat(formData.actual_packed_volume_cubic_inches) : null,
        paper_thickness_top: parseFloat(formData.paper_thickness_top) || 0,
        paper_thickness_bottom: parseFloat(formData.paper_thickness_bottom) || 0,
        paper_thickness_left: parseFloat(formData.paper_thickness_left) || 0,
        paper_thickness_right: parseFloat(formData.paper_thickness_right) || 0,
        paper_thickness_front: parseFloat(formData.paper_thickness_front) || 0,
        paper_thickness_back: parseFloat(formData.paper_thickness_back) || 0,
        paper_thickness_side: parseFloat(formData.paper_thickness_side) || 0,
        paper_thickness_uniform: parseFloat(formData.paper_thickness_uniform) || 0,
        created_by: user.id,
      };

      // Handle image uploads  
      let finalImageUrls = assembly?.image_urls || [];
      if (selectedPhotos.length > 0) {
        const newImageUrls = await uploadInventoryImages(selectedPhotos, assembly?.id || 'temp', 'assemblies');
        finalImageUrls = combineImageUrls(finalImageUrls, newImageUrls);
      }

      // Add image URLs to data
      const assemblyDataWithImages = {
        ...assemblyData,
        image_urls: finalImageUrls
      };

      let assemblyId: string;

      if (assembly) {
        // Update existing assembly
        const { error } = await supabase
          .from('assemblies')
          .update(assemblyDataWithImages)
          .eq('id', assembly.id);

        if (error) throw error;
        assemblyId = assembly.id;

        // Delete existing components
        const { error: deleteError } = await supabase
          .from('assembly_components')
          .delete()
          .eq('assembly_id', assembly.id);

        if (deleteError) throw deleteError;
      } else {
        // Create new assembly
        const { data: newAssembly, error } = await supabase
          .from('assemblies')
          .insert([assemblyDataWithImages])
          .select()
          .single();

        if (error) throw error;
        assemblyId = newAssembly.id;
        
        // If we have photos to upload for a new assembly, upload them now with the real ID
        if (selectedPhotos.length > 0) {
          const newImageUrls = await uploadInventoryImages(selectedPhotos, newAssembly.id, 'assemblies');
          await supabase
            .from('assemblies')
            .update({ image_urls: newImageUrls })
            .eq('id', newAssembly.id);
        }
      }

      // Insert components
      const componentData = components.map(comp => ({
        assembly_id: assemblyId,
        inventory_item_id: comp.inventory_item_id,
        quantity_needed: comp.quantity_needed
      }));

      const { error: componentError } = await supabase
        .from('assembly_components')
        .insert(componentData);

      if (componentError) throw componentError;

      // Save sales UOMs
      await saveAssemblySalesUoms(assemblyId, salesUoms);

      // Save purchase UOMs if outsourced
      if (formData.is_externally_sourced) {
        await saveAssemblyPurchaseUoms(assemblyId, purchaseUoms);
      }

      toast({
        title: "Success",
        description: `Assembly ${assembly ? 'updated' : 'created'} successfully`,
      });

      onSuccess();
    } catch (error: any) {
      console.error('Error saving assembly:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save assembly",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalCost = calculateTotalCost();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {assembly ? 'Edit Assembly' : 'Add Assembly'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="basic-info" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="basic-info">Basic Info</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="components">Production BOM</TabsTrigger>
            <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
            <TabsTrigger value="packed-dimensions">Packed Dims</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
          </TabsList>

            <TabsContent value="basic-info" className="space-y-4">
              {/* First Row: SKU, Outsourced, Consigned, Vendor */}
              <div className="grid grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="Enter assembly SKU"
                    required
                  />
                </div>

                {/* Outsourced Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label>Outsourced</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p><strong>Off (Insourced):</strong> When stock is low, a Production Order will be generated for internal manufacturing.</p>
                          <p className="mt-1"><strong>On (Outsourced):</strong> A Purchase Order will be generated to buy from the selected vendor.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center h-10">
                    <Switch
                      checked={formData.is_externally_sourced}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        is_externally_sourced: checked,
                        is_consigned: checked ? prev.is_consigned : false 
                      }))}
                    />
                  </div>
                </div>

                {/* Consigned Toggle - only visible when externally sourced */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label>Consigned Materials</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p><strong>Off:</strong> Vendor supplies all materials - no component consumption on receiving.</p>
                          <p className="mt-1"><strong>On:</strong> We consign materials to vendor - components will be consumed from inventory when finished assemblies are received.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center h-10">
                    <Switch
                      checked={formData.is_consigned}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_consigned: checked }))}
                      disabled={!formData.is_externally_sourced}
                      className={cn(!formData.is_externally_sourced && "opacity-50")}
                    />
                  </div>
                </div>

                {/* Vendor Dropdown */}
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={vendorOpen}
                        className={cn(
                          "w-full justify-between",
                          !formData.is_externally_sourced && "opacity-50"
                        )}
                        disabled={!formData.is_externally_sourced || vendorsLoading}
                      >
                        {formData.external_supplier_id
                          ? vendors.find((v) => v.id === formData.external_supplier_id)?.name
                          : vendorsLoading
                            ? "Loading vendors..."
                            : "Select vendor..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search vendors..."
                          value={vendorSearchTerm}
                          onValueChange={setVendorSearchTerm}
                        />
                        <CommandList className="max-h-[200px]">
                          <CommandEmpty>No vendor found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => {
                                setFormData(prev => ({ ...prev, external_supplier_id: null }));
                                setVendorOpen(false);
                                setVendorSearchTerm("");
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  !formData.external_supplier_id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="text-muted-foreground">None</span>
                            </CommandItem>
                            {vendors
                              .filter(v => v.name.toLowerCase().includes(vendorSearchTerm.toLowerCase()))
                              .map((vendor) => (
                                <CommandItem
                                  key={vendor.id}
                                  value={vendor.name}
                                  onSelect={() => {
                                    setFormData(prev => ({ ...prev, external_supplier_id: vendor.id }));
                                    setVendorOpen(false);
                                    setVendorSearchTerm("");
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.external_supplier_id === vendor.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {vendor.name}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Second Row: Manufacturer Part Number (positioned below Vendor) */}
              <div className="grid grid-cols-4 gap-4 items-end">
                <div className={`col-start-4 space-y-2 ${!formData.is_externally_sourced ? 'opacity-50' : ''}`}>
                  <Label htmlFor="manufacturer_part_number">Manufacturer Part Number</Label>
                  <Input
                    id="manufacturer_part_number"
                    value={formData.manufacturer_part_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, manufacturer_part_number: e.target.value }))}
                    placeholder="MPN (optional)"
                    disabled={!formData.is_externally_sourced}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sales_description">Sales Description</Label>
                <Textarea
                  id="sales_description"
                  value={formData.sales_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, sales_description: e.target.value }))}
                  placeholder="Customer-facing description"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_description">Purchase Description</Label>
                <Textarea
                  id="purchase_description"
                  value={formData.purchase_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, purchase_description: e.target.value }))}
                  placeholder="Internal purchasing description"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="markup_percentage">Markup %</Label>
                  <FinancialGuard kind="margin"><Input
                    id="markup_percentage"
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.markup_percentage}
                    onChange={(e) => setFormData(prev => ({ ...prev, markup_percentage: e.target.value }))}
                    placeholder="0"
                  /></FinancialGuard>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lead_time_days">Lead Time (Days) *</Label>
                  <Input
                    id="lead_time_days"
                    type="number"
                    min="1"
                    max="365"
                    value={formData.lead_time_days}
                    onChange={(e) => setFormData(prev => ({ ...prev, lead_time_days: e.target.value }))}
                    placeholder="30"
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Time needed to produce this assembly (affects reorder point calculation)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Row 1 */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_subassembly"
                    checked={formData.is_subassembly}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        is_subassembly: checked === true 
                      }))
                    }
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="is_subassembly" className="flex items-center gap-1 cursor-help">
                          Is subassembly
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p>When enabled, this assembly can be used as a component within other assemblies. Subassemblies are built separately and consumed during parent assembly production.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="visible_for_sale"
                    checked={formData.visible_for_sale}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        visible_for_sale: checked === true 
                      }))
                    }
                  />
                  <Label htmlFor="visible_for_sale">
                    Visible for sale
                  </Label>
                </div>

                {/* Row 2 */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="eligible_for_distributor_discount"
                    checked={formData.eligible_for_distributor_discount}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        eligible_for_distributor_discount: checked === true 
                      }))
                    }
                  />
                  <Label htmlFor="eligible_for_distributor_discount">
                    Eligible for distributor discount
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="active"
                    checked={formData.active}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        active: checked === true 
                      }))
                    }
                  />
                  <Label htmlFor="active">
                    Active
                  </Label>
                </div>

                {/* Row 3 */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="taxable"
                    checked={formData.taxable}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        taxable: checked === true 
                      }))
                    }
                  />
                  <Label htmlFor="taxable">
                    Taxable
                  </Label>
                </div>
              </div>

              {/* Serial Tracking Section */}
              <SerialTrackingSection
                serialTrackingType={formData.serial_tracking_type}
                serialPrefix={formData.serial_prefix}
                onSerialTrackingTypeChange={(value) => setFormData(prev => ({ ...prev, serial_tracking_type: value }))}
                onSerialPrefixChange={(value) => setFormData(prev => ({ ...prev, serial_prefix: value }))}
              />
            </TabsContent>

            <TabsContent value="pricing" className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-2">Units of Measure Configuration</h4>
                <p className="text-xs text-muted-foreground">
                  Configure sales and purchase pricing for this assembly. You can define multiple pricing tiers for different quantities.
                </p>
              </div>

              <AssemblyPurchaseUomEditor
                assemblyId={assembly?.id || null}
                uoms={purchaseUoms}
                onChange={setPurchaseUoms}
                disabled={!formData.is_externally_sourced}
              />

              <AssemblySalesUomEditor
                assemblyId={assembly?.id}
                uoms={salesUoms}
                onUomsChange={setSalesUoms}
              />
            </TabsContent>

            <TabsContent value="dimensions" className="space-y-4">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium mb-2">Physical Dimensions (inches)</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Enter Width, Length, and Depth. They will be automatically sorted as L × W × H (largest to smallest) for shipping optimization.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="width">Width</Label>
                    <Input
                      id="width"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.width}
                      onChange={(e) => setFormData(prev => ({ ...prev, width: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="length">Length</Label>
                    <Input
                      id="length"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.length}
                      onChange={(e) => setFormData(prev => ({ ...prev, length: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="depth">Depth</Label>
                    <Input
                      id="depth"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.depth}
                      onChange={(e) => setFormData(prev => ({ ...prev, depth: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Preview sorted dimensions */}
                {(formData.width || formData.length || formData.depth) && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Will be stored as:</p>
                    <p className="text-sm font-mono">
                      {formatDimensionsDisplay(
                        sortDimensions(formData.width, formData.length, formData.depth)
                      )}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight_oz">Weight (oz)</Label>
                    <Input
                      id="weight_oz"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.weight_oz}
                      onChange={(e) => setFormData(prev => ({ ...prev, weight_oz: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>

                   <div className="space-y-2">
                     <Label>Volume (cubic inches)</Label>
                     <div className="p-3 rounded-md border bg-background">
                       <div className="text-sm font-medium">
                         {calculateVolumeFromDimensions(
                           sortDimensions(formData.width, formData.length, formData.depth)
                         )?.toFixed(2) || assembly?.volume_cubic_inches?.toFixed(2) || 'N/A'} in³
                       </div>
                       <p className="text-xs text-muted-foreground mt-1">
                         Auto-calculated from dimensions
                       </p>
                     </div>
                   </div>
                </div>

                 <div className="space-y-2">
                   <Label>Density (oz/in³)</Label>
                   <div className="p-3 rounded-md border bg-background">
                     <div className="text-sm font-medium">
                       {assembly?.density ? `${assembly.density.toFixed(3)} oz/in³` : 'N/A'}
                     </div>
                     <p className="text-xs text-muted-foreground mt-1">
                       Auto-calculated: Weight ÷ Volume
                     </p>
                   </div>
                 </div>
              </div>
            </TabsContent>

            <TabsContent value="packed-dimensions" className="space-y-4">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium mb-2">Packed Dimensions (inches)</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Dimensions when packaged for shipping. Enter Width, Length, and Depth. They will be automatically sorted as L × W × H.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="packed_width">Packed Width</Label>
                    <Input
                      id="packed_width"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.packed_width}
                      onChange={(e) => setFormData(prev => ({ ...prev, packed_width: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="packed_length">Packed Length</Label>
                    <Input
                      id="packed_length"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.packed_length}
                      onChange={(e) => setFormData(prev => ({ ...prev, packed_length: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="packed_depth">Packed Depth</Label>
                    <Input
                      id="packed_depth"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.packed_depth}
                      onChange={(e) => setFormData(prev => ({ ...prev, packed_depth: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Preview sorted packed dimensions */}
                {(formData.packed_width || formData.packed_length || formData.packed_depth) && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Packed dimensions will be stored as:</p>
                    <p className="text-sm font-mono">
                      {formatDimensionsDisplay(
                        formData.packed_shape === 'box'
                          ? sortDimensions(formData.packed_width, formData.packed_length, formData.packed_depth)
                          : {
                              dimension_l: formData.packed_length ? parseFloat(formData.packed_length) : null,
                              dimension_w: formData.packed_width ? parseFloat(formData.packed_width) : null,
                              dimension_h: formData.packed_depth ? parseFloat(formData.packed_depth) : null,
                            }
                      )}
                    </p>
                  </div>
                )}

                 <div className="space-y-2">
                   <Label>Packed Volume (cubic inches)</Label>
                   <div className="p-3 rounded-md border bg-background">
                     <div className="text-sm font-medium">
                       {calculateVolumeFromDimensions(
                         sortDimensions(formData.packed_width, formData.packed_length, formData.packed_depth)
                       )?.toFixed(2) || assembly?.packed_volume_cubic_inches?.toFixed(2) || 'N/A'} in³
                     </div>
                     <p className="text-xs text-muted-foreground mt-1">
                       Auto-calculated from packed dimensions
                     </p>
                   </div>
                   </div>

                  <div className="space-y-2">
                    <Label>Packed Density (oz/in³)</Label>
                    <div className="p-3 rounded-md border bg-background">
                      <div className="text-sm font-medium">
                        {assembly?.packed_density ? `${assembly.packed_density.toFixed(3)} oz/in³` : 'N/A'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-calculated: Weight ÷ Packed Volume
                      </p>
                    </div>
                  </div>

                  {/* Shape Selection & Packing Paper */}
                  <div className="pt-4 border-t">
                    <PackedShapeEditor
                      shape={formData.packed_shape}
                      packedL={formData.packed_length}
                      packedW={formData.packed_width}
                      packedH={formData.packed_depth}
                      packedDiameter={formData.packed_diameter}
                      actualPackedVolume={formData.actual_packed_volume_cubic_inches}
                      paperValues={{
                        paper_thickness_top: parseFloat(formData.paper_thickness_top) || 0,
                        paper_thickness_bottom: parseFloat(formData.paper_thickness_bottom) || 0,
                        paper_thickness_left: parseFloat(formData.paper_thickness_left) || 0,
                        paper_thickness_right: parseFloat(formData.paper_thickness_right) || 0,
                        paper_thickness_front: parseFloat(formData.paper_thickness_front) || 0,
                        paper_thickness_back: parseFloat(formData.paper_thickness_back) || 0,
                        paper_thickness_side: parseFloat(formData.paper_thickness_side) || 0,
                        paper_thickness_uniform: parseFloat(formData.paper_thickness_uniform) || 0,
                      }}
                      onShapeChange={(v) => setFormData(prev => ({ ...prev, packed_shape: v }))}
                      onDimensionChange={(field, value) => {
                        if (field === 'packed_diameter') {
                          setFormData(prev => ({ ...prev, packed_diameter: value }));
                        } else if (field === 'packed_length') {
                          setFormData(prev => ({ ...prev, packed_length: value }));
                        } else if (field === 'packed_width') {
                          setFormData(prev => ({ ...prev, packed_width: value }));
                        } else if (field === 'packed_depth') {
                          setFormData(prev => ({ ...prev, packed_depth: value }));
                        }
                      }}
                      onVolumeOverrideChange={(v) => setFormData(prev => ({ ...prev, actual_packed_volume_cubic_inches: v }))}
                      onPaperChange={(field, value) => setFormData(prev => ({ ...prev, [field]: value.toString() }))}
                    />
                  </div>

                 {/* Ships in Own Packaging */}
                 <div className="pt-4 border-t space-y-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="ships_in_own_packaging"
                        checked={formData.ships_in_own_packaging}
                        onCheckedChange={(checked) => 
                          setFormData(prev => ({ 
                            ...prev, 
                            ships_in_own_packaging: checked === true 
                          }))
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor="ships_in_own_packaging" className="text-sm font-medium cursor-pointer">
                          Ships in own packaging
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When checked, a single unit ships without an outer box. Multiple units will be consolidated into a larger box when cost-effective.
                        </p>
                      </div>
                    </div>

                    {/* Always Ship Stacked */}
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="always_ship_stacked"
                        checked={formData.always_ship_stacked}
                        onCheckedChange={(checked) =>
                          setFormData(prev => ({
                            ...prev,
                            always_ship_stacked: checked === true
                          }))
                        }
                      />
                      <div className="space-y-1">
                        <Label htmlFor="always_ship_stacked" className="text-sm font-medium cursor-pointer">
                          Always ship stacked
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When checked, all units of this item are always packed in a single vertical stack regardless of what other items are in the order. Ideal for sequentially-numbered items.
                        </p>
                      </div>
                    </div>

                    {/* Max Stack Quantity */}
                    <div className="space-y-2">
                      <Label htmlFor="max_stack_quantity" className="text-sm font-medium">
                        Max units per stack
                        {formData.always_ship_stacked && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      <Input
                        id="max_stack_quantity"
                        type="number"
                        min={1}
                        step={1}
                        value={formData.max_stack_quantity as string}
                        onChange={(e) => setFormData(prev => ({ ...prev, max_stack_quantity: e.target.value }))}
                        placeholder={formData.always_ship_stacked ? "Required" : "No limit"}
                        className={`max-w-[160px] ${formData.always_ship_stacked && (!formData.max_stack_quantity || parseInt(formData.max_stack_quantity as string) <= 0) ? 'border-destructive' : ''}`}
                      />
                      <p className={`text-xs ${formData.always_ship_stacked && (!formData.max_stack_quantity || parseInt(formData.max_stack_quantity as string) <= 0) ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {formData.always_ship_stacked
                          ? 'Required. Sets the maximum number of units per vertical stack.'
                          : 'Limits how many units are stacked on top of each other. Leave blank for no limit.'}
                      </p>
                    </div>
                  </div>
               </div>
             </TabsContent>

            <TabsContent value="inventory" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Inventory Management</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Track current assembly levels and allocation status.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column - Input Fields */}
                  <div className="space-y-4">
                    <h5 className="text-sm font-medium text-muted-foreground">Input Fields</h5>
                    
                    <div className="space-y-2">
                      <Label htmlFor="quantity_on_hand">Quantity on Hand</Label>
                      <Input
                        id="quantity_on_hand"
                        type="number"
                        value={formData.quantity_on_hand}
                        onChange={(e) => setFormData(prev => ({ ...prev, quantity_on_hand: e.target.value }))}
                        placeholder="0"
                      />
                      {calculateDaysOfSupply(formData.quantity_on_hand, formData.daily_consumption_rate) && (
                        <p className="text-xs text-muted-foreground">
                          {calculateDaysOfSupply(formData.quantity_on_hand, formData.daily_consumption_rate)} days of supply
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="consumption_last_12_months">Last 12 Months Usage</Label>
                      <Input
                        id="consumption_last_12_months"
                        type="number"
                        value={formData.consumption_last_12_months}
                        onChange={(e) => setFormData(prev => ({ ...prev, consumption_last_12_months: e.target.value }))}
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="consumption_start_date">Consumption Start Date</Label>
                      <Input
                        id="consumption_start_date"
                        type="date"
                        value={formData.consumption_start_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, consumption_start_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Right Column - Calculated Fields */}
                  <div className="space-y-4">
                    <h5 className="text-sm font-medium text-muted-foreground">Calculated Fields</h5>
                    
                    <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                Available to Sell (ATS) ℹ️
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Formula: On Hand - Allocated</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">
                          {(parseInt(formData.quantity_on_hand || '0') - parseInt(formData.quantity_allocated || '0'))} units
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                Available to Promise (ATP) ℹ️
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Formula: On Hand + On Order - Allocated</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">
                          {(parseInt(formData.quantity_on_hand || '0') + (assembly?.quantity_on_order || 0) - parseInt(formData.quantity_allocated || '0'))} units
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                On Hand ℹ️
                              </span>
                            </TooltipTrigger>
                             <TooltipContent>
                               <p>Physical Inventory</p>
                             </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">{formData.quantity_on_hand} units</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                Quantity Allocated ℹ️
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Sum of allocations from active production orders and commitments</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">{formData.quantity_allocated} units</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                Quantity on Order ℹ️
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Auto-calculated from active production orders</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">{assembly?.quantity_on_order || 0} units</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                Reorder Point ℹ️
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Formula: (Assembly Demand Rate × Lead Time) + Safety Stock</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">{assembly?.reorder_point?.toString() || '0'} units</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                Safety Stock ℹ️
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Formula: Z-score (3.09) × Assembly Demand StdDev × √(Lead Time Days)</p>
                              <p className="text-xs mt-1">Provides 99.9% service level protection</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">
                          {safetyStockLoading ? "Calculating..." : 
                           safetyStock !== null ? 
                           `${Math.ceil(safetyStock)} units${calculateDaysOfSupply(Math.ceil(safetyStock).toString(), formData.daily_consumption_rate) ? ` (${calculateDaysOfSupply(Math.ceil(safetyStock).toString(), formData.daily_consumption_rate)} days)` : ''}` : 
                           "N/A"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm cursor-help flex items-center gap-1">
                                Daily Consumption Rate ℹ️
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Auto-calculated from production demand data</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium text-muted-foreground">
                          {formData.daily_consumption_rate || 'N/A'} units/day
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="components" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Production BOM</CardTitle>
                    <Button type="button" onClick={addComponent} size="sm" className="gap-2">
                      <Plus size={16} />
                      Add Component
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {components.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      No components added yet. Click "Add Component" to get started.
                    </p>
                  ) : (
                    components.map((component, index) => (
                      <div key={index} className="flex gap-4 items-end p-4 border rounded-lg">
                        <div className="flex-1 space-y-2">
                          <Label>Inventory Item *</Label>
                          <Select
                            value={component.inventory_item_id}
                            onValueChange={(value) => updateComponent(index, 'inventory_item_id', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                               {inventoryItems.map((item) => (
                                 <SelectItem key={item.id} value={item.id}>
                                   {item.sku} <FinancialGuard kind="supplier_price">(${item.unit_price})</FinancialGuard>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-32 space-y-2">
                          <Label>Quantity *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={component.quantity_needed}
                            onChange={(e) => updateComponent(index, 'quantity_needed', parseInt(e.target.value) || 1)}
                            placeholder="1"
                          />
                        </div>

                        <div className="w-24 space-y-2">
                          <Label>Subtotal</Label>
                          <div className="h-10 flex items-center">
                            {component.inventory_item ? (
                              <Badge variant="secondary">
                                <FinancialGuard kind="supplier_price">{formatCurrency(component.inventory_item.unit_price * component.quantity_needed)}</FinancialGuard>
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeComponent(index)}
                          className="h-10"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))
                  )}

                  {components.length > 0 && (
                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center text-lg font-semibold">
                        <span>Total Component Cost:</span>
                        <Badge variant="outline" className="text-lg px-3 py-1">
                          <FinancialGuard kind="supplier_price">{formatCurrency(totalCost)}</FinancialGuard>
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="media" className="space-y-4">
              <div className="space-y-2">
                <Label>Images (Up to 10)</Label>
                <PhotoUploader
                  onChange={setSelectedPhotos}
                  multiple={true}
                  allowCamera={true}
                  enableBgRemovalToggle={true}
                  existingPhotos={formatExistingImages(assembly?.image_urls)}
                  existingImageCount={assembly?.image_urls?.length || 0}
                  isEditMode={!!assembly}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || components.length === 0}>
              {loading ? "Saving..." : assembly ? "Update Assembly" : "Create Assembly"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};