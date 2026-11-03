import { useAuth } from "@/hooks/useAuth";
import { InventoryAdjustmentDialog, AdjustableItem } from "./InventoryAdjustmentDialog";
import { canManageVendorBills } from "@/lib/vendor-bill-rules";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { sortDimensions, calculateVolumeFromDimensions, formatDimensionsDisplay } from "@/lib/dimension-utils";
import { PhotoUploader, SelectedPhoto } from "@/components/repairs/PhotoUploader";
import { uploadInventoryImages, formatExistingImages, combineImageUrls } from "@/lib/image-upload-utils";
import { SalesUomEditor, SalesUom, saveSalesUoms, loadSalesUoms } from "./SalesUomEditor";
import { PurchaseUomEditor, PurchaseUom, savePurchaseUoms, loadPurchaseUoms } from "./PurchaseUomEditor";
import { InventoryItemBomEditor, BomComponent, saveBomComponents, loadBomComponents } from "./InventoryItemBomEditor";
import { SerialTrackingSection, SerialTrackingType } from "./SerialTrackingSection";
import { PackedShapeEditor } from "./PackedShapeEditor";
import { Check, ChevronsUpDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
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
  unit_cost?: number;
  quantity_on_hand: number;
  quantity_allocated?: number;
  quantity_on_order?: number;
  quantity_atp?: number;
  quantity_ats?: number;
  reorder_point: number;
  eligible_for_distributor_discount?: boolean;
  visible_for_sale?: boolean;
  is_active?: boolean;
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
  image_urls?: string[];
  video_url?: string;
  lead_time_days?: number;
  minimum_order_quantity?: number;
  vendor?: string;
  purchase_description?: string;
  sales_description?: string;
  is_taxable?: boolean;
  manufacturer_part_number?: string;
  consumption_last_12_months?: number;
  consumption_start_date?: string;
  daily_consumption_rate?: number;
  // Outsourcing fields
  is_externally_sourced?: boolean;
  external_supplier_id?: string;
  external_part_number?: string;
  // Manufacturing fields
  made_from_raw_materials?: boolean;
  is_consigned?: boolean;
  // UOM fields
  stocking_uom?: string;
  has_purchase_conversion?: boolean;
  purchase_uom?: string;
  purchase_uom_quantity?: number;
  purchase_unit_cost?: number;
  has_sales_conversion?: boolean;
  sales_uom?: string;
  sales_uom_quantity?: number;
  sales_unit_price?: number;
  // Serial tracking fields
  serial_tracking_type?: 'none' | 'manual' | 'auto_date';
  serial_prefix?: string;
  // Shipping fields
  ships_in_own_packaging?: boolean;
  always_ship_stacked?: boolean;
  max_stack_quantity?: number | null;
}

interface InventoryItemFormProps {
  item?: InventoryItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const InventoryItemForm = ({ item, onClose, onSuccess }: InventoryItemFormProps) => {
  const [showAdjust, setShowAdjust] = useState(false);
  const { roles } = useAuth();
  const canAdjust = canManageVendorBills(roles);
  const [formData, setFormData] = useState({
    sku: item?.sku || '',
    sales_description: item?.sales_description || '',
    unit_price: item?.unit_price?.toString() || '',
    unit_cost: item?.unit_cost?.toString() || '',
    quantity_on_hand: item?.quantity_on_hand?.toString() || '0',
    quantity_allocated: item?.quantity_allocated?.toString() || '0',
    // quantity_on_order is auto-calculated, not user-editable
    quantity_atp: item?.quantity_atp?.toString() || '0',
    quantity_ats: item?.quantity_ats?.toString() || '0',
    reorder_point: item?.reorder_point?.toString() || '0',
    eligible_for_distributor_discount: item?.eligible_for_distributor_discount ?? true,
    width: item?.dimension_w?.toString() || '', // Load from database
    length: item?.dimension_l?.toString() || '', // Load from database
    depth: item?.dimension_h?.toString() || '', // Load from database
    packed_width: item?.packed_dimension_w?.toString() || '', // Load from database
    packed_length: item?.packed_dimension_l?.toString() || '', // Load from database
    packed_depth: item?.packed_dimension_h?.toString() || '', // Load from database
    weight_oz: item?.weight_oz?.toString() || '',
    // Volume fields are auto-calculated and read-only
    video_url: item?.video_url || '',
    lead_time_days: item?.lead_time_days?.toString() || '',
    minimum_order_quantity: item?.minimum_order_quantity?.toString() || '1',
    vendor: item?.vendor || '',
    purchase_description: item?.purchase_description || '',
    is_taxable: item?.is_taxable ?? true,
    manufacturer_part_number: item?.manufacturer_part_number || '',
    consumption_last_12_months: item?.consumption_last_12_months?.toString() || '0',
    consumption_start_date: item?.consumption_start_date || '',
    daily_consumption_rate: item?.daily_consumption_rate?.toString() || '0',
    visible_for_sale: item?.visible_for_sale ?? true,
    is_active: item?.is_active ?? true,
    // Outsourcing fields
    is_externally_sourced: item?.is_externally_sourced ?? false,
    external_supplier_id: item?.external_supplier_id || '',
    external_part_number: item?.external_part_number || '',
    // Manufacturing fields
    is_consigned: item?.is_consigned ?? false,
    // UOM fields
    stocking_uom: item?.stocking_uom || 'each',
    has_purchase_conversion: item?.has_purchase_conversion ?? false,
    purchase_uom: item?.purchase_uom || '',
    purchase_uom_quantity: item?.purchase_uom_quantity?.toString() || '',
    purchase_unit_cost: item?.purchase_unit_cost?.toString() || '',
    has_sales_conversion: item?.has_sales_conversion ?? false,
    sales_uom: item?.sales_uom || '',
    sales_uom_quantity: item?.sales_uom_quantity?.toString() || '',
    sales_unit_price: item?.sales_unit_price?.toString() || '',
    // Serial tracking fields
    serial_tracking_type: (item?.serial_tracking_type || 'none') as SerialTrackingType,
    serial_prefix: item?.serial_prefix || '',
    // Shipping fields
    ships_in_own_packaging: item?.ships_in_own_packaging ?? false,
    always_ship_stacked: item?.always_ship_stacked ?? false,
    max_stack_quantity: item?.max_stack_quantity?.toString() ?? '',
    // Shape & packing paper fields
    packed_shape: ((item as any)?.packed_shape || 'box') as PackedShape,
    packed_diameter: (item as any)?.packed_diameter?.toString() || '',
    actual_packed_volume_cubic_inches: (item as any)?.actual_packed_volume_cubic_inches?.toString() || '',
    paper_thickness_top: (item as any)?.paper_thickness_top?.toString() || '0',
    paper_thickness_bottom: (item as any)?.paper_thickness_bottom?.toString() || '0',
    paper_thickness_left: (item as any)?.paper_thickness_left?.toString() || '0',
    paper_thickness_right: (item as any)?.paper_thickness_right?.toString() || '0',
    paper_thickness_front: (item as any)?.paper_thickness_front?.toString() || '0',
    paper_thickness_back: (item as any)?.paper_thickness_back?.toString() || '0',
    paper_thickness_side: (item as any)?.paper_thickness_side?.toString() || '0',
    paper_thickness_uniform: (item as any)?.paper_thickness_uniform?.toString() || '0',
  });
  // modelerOpen state removed - handled by PackedShapeEditor
  const [loading, setLoading] = useState(false);
  const [safetyStock, setSafetyStock] = useState<number | null>(null);
  const [safetyStockLoading, setSafetyStockLoading] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [salesUoms, setSalesUoms] = useState<SalesUom[]>([]);
  const [purchaseUoms, setPurchaseUoms] = useState<PurchaseUom[]>([]);
  const [bomComponents, setBomComponents] = useState<BomComponent[]>([]);
  const [vendors, setVendors] = useState<Supplier[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');
  const { toast } = useToast();

  // Fetch vendors on mount
  useEffect(() => {
    const fetchVendors = async () => {
      setVendorsLoading(true);
      try {
        const { data } = await supabase
          .from('suppliers')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('name');
        setVendors(data || []);
      } catch (error) {
        console.error('Error fetching vendors:', error);
      } finally {
        setVendorsLoading(false);
      }
    };
    fetchVendors();
  }, []);

  // Load existing UOMs and BOM components when editing an item
  useEffect(() => {
    if (item?.id) {
      loadSalesUoms(item.id).then(setSalesUoms);
      loadPurchaseUoms(item.id).then(setPurchaseUoms);
      loadBomComponents(item.id).then(setBomComponents);
    }
  }, [item?.id]);

  // Calculate safety stock when lead time or item changes
  useEffect(() => {
    if (item?.id && formData.lead_time_days) {
      calculateSafetyStock();
    }
  }, [item?.id, formData.lead_time_days]);

  const calculateSafetyStock = async () => {
    if (!item?.id || !formData.lead_time_days) return;
    
    setSafetyStockLoading(true);
    try {
      const { data, error } = await supabase.rpc('calculate_statistical_safety_stock', {
        item_id: item.id,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate max_stack_quantity is required when always_ship_stacked is checked
    if (formData.always_ship_stacked && (!formData.max_stack_quantity || parseInt(formData.max_stack_quantity as string) <= 0)) {
      toast({ title: 'Validation Error', description: 'Max units per stack is required when "Always ship stacked" is enabled.', variant: 'destructive' });
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

      // Get unit cost from default purchase UOM if available
      const defaultPurchaseUom = purchaseUoms.find(u => u.is_default && !u.isDeleted);
      let finalUnitCost = formData.unit_cost ? parseFloat(formData.unit_cost) : null;
      if (defaultPurchaseUom && defaultPurchaseUom.quantity > 0) {
        finalUnitCost = defaultPurchaseUom.unit_cost / defaultPurchaseUom.quantity;
      }

      // Get unit price from default sales UOM if available
      const defaultSalesUom = salesUoms.find(u => u.is_default && !u.isDeleted);
      let finalUnitPrice = parseFloat(formData.unit_price);
      if (defaultSalesUom && defaultSalesUom.quantity > 0) {
        finalUnitPrice = defaultSalesUom.unit_price / defaultSalesUom.quantity;
      }

      const data = {
        sku: formData.sku.trim(),
        sales_description: formData.sales_description.trim() || null,
        unit_price: finalUnitPrice,
        unit_cost: finalUnitCost,
        quantity_on_hand: parseInt(formData.quantity_on_hand),
        quantity_allocated: parseInt(formData.quantity_allocated),
        eligible_for_distributor_discount: formData.eligible_for_distributor_discount,
        dimension_l: sortedDimensions.dimension_l,
        dimension_w: sortedDimensions.dimension_w,
        dimension_h: sortedDimensions.dimension_h,
        packed_dimension_l: sortedPackedDimensions.dimension_l,
        packed_dimension_w: sortedPackedDimensions.dimension_w,
        packed_dimension_h: sortedPackedDimensions.dimension_h,
        weight_oz: formData.weight_oz ? parseFloat(formData.weight_oz) : null,
        volume_cubic_inches: finalVolume,
        packed_volume_cubic_inches: finalPackedVolume,
        video_url: formData.video_url.trim() || null,
        lead_time_days: formData.lead_time_days ? parseInt(formData.lead_time_days) : null,
        minimum_order_quantity: formData.minimum_order_quantity ? parseInt(formData.minimum_order_quantity) : 1,
        vendor: formData.vendor.trim() || null,
        purchase_description: formData.purchase_description.trim() || null,
        is_taxable: formData.is_taxable,
        manufacturer_part_number: formData.manufacturer_part_number.trim() || null,
        consumption_last_12_months: parseInt(formData.consumption_last_12_months),
        consumption_start_date: formData.consumption_start_date || null,
        visible_for_sale: formData.visible_for_sale,
        is_active: formData.is_active,
        // Outsourcing fields
        is_externally_sourced: formData.is_externally_sourced,
        external_supplier_id: formData.external_supplier_id || null,
        external_part_number: formData.external_part_number.trim() || null,
        // Manufacturing fields - derive made_from_raw_materials from other flags
        // If NOT externally sourced OR if consigned, we need to track raw materials
        made_from_raw_materials: !formData.is_externally_sourced || formData.is_consigned,
        is_consigned: formData.is_externally_sourced ? formData.is_consigned : false, // Only valid if externally sourced
        created_by: user.id,
        stocking_uom: formData.stocking_uom,
        // Legacy fields - keep for backward compatibility but no longer used
        has_purchase_conversion: purchaseUoms.filter(u => !u.isDeleted).length > 0,
        has_sales_conversion: salesUoms.filter(u => !u.isDeleted).length > 0,
        purchase_uom: null,
        purchase_uom_quantity: null,
        purchase_unit_cost: null,
        sales_uom: null,
        sales_uom_quantity: null,
        sales_unit_price: null,
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
      };

      // Handle image uploads
      let finalImageUrls = item?.image_urls || [];
      if (selectedPhotos.length > 0) {
        const newImageUrls = await uploadInventoryImages(selectedPhotos, item?.id || 'temp', 'inventory-items');
        finalImageUrls = combineImageUrls(finalImageUrls, newImageUrls);
      }

      // Add image URLs to data
      const dataWithImages = {
        ...data,
        image_urls: finalImageUrls
      };

      let savedItemId: string;

      if (item) {
        // Update existing item
        const { error } = await supabase
          .from('inventory_items')
          .update(dataWithImages)
          .eq('id', item.id);

        if (error) throw error;
        savedItemId = item.id;
      } else {
        // Create new item
        const { data: newItem, error } = await supabase
          .from('inventory_items')
          .insert([dataWithImages])
          .select()
          .single();
        
        if (error) throw error;
        savedItemId = newItem.id;
        
        // If we have photos to upload for a new item, upload them now with the real ID
        if (selectedPhotos.length > 0 && newItem) {
          const newImageUrls = await uploadInventoryImages(selectedPhotos, newItem.id, 'inventory-items');
          await supabase
            .from('inventory_items')
            .update({ image_urls: newImageUrls })
            .eq('id', newItem.id);
        }
      }

      // For new items, auto-create default single-piece UOMs if none exist
      let finalSalesUoms = salesUoms;
      let finalPurchaseUoms = purchaseUoms;
      
      if (!item) {
        // Auto-create default sales UOM (single piece) if none exist
        if (salesUoms.filter(u => !u.isDeleted).length === 0) {
          finalSalesUoms = [{
            id: '',
            description: 'Each',
            quantity: 1,
            unit_price: parseFloat(formData.unit_price) || 0,
            is_default: true,
            sort_order: 0,
            isNew: true,
          }];
        }
        
        // Auto-create default purchase UOM (single piece) if none exist
        if (purchaseUoms.filter(u => !u.isDeleted).length === 0) {
          finalPurchaseUoms = [{
            purchase_uom: 'each',
            quantity: 1,
            unit_cost: parseFloat(formData.unit_cost) || 0,
            is_default: true,
            sort_order: 0,
            isNew: true,
          }];
        }
      }

      // Save UOMs and BOM after the item is saved
      const [salesResult, purchaseResult, bomResult] = await Promise.all([
        saveSalesUoms(savedItemId, finalSalesUoms),
        savePurchaseUoms(savedItemId, finalPurchaseUoms),
        saveBomComponents(savedItemId, bomComponents),
      ]);

      if (!salesResult.success) {
        console.error('Error saving sales UOMs:', salesResult.error);
      }
      if (!purchaseResult.success) {
        console.error('Error saving purchase UOMs:', purchaseResult.error);
      }
      if (!bomResult.success) {
        console.error('Error saving BOM components:', bomResult.error);
      }

      toast({
        title: "Success",
        description: item ? "Inventory item updated successfully" : "Inventory item created successfully",
      });

      onSuccess();
    } catch (error: any) {
      console.error('Error saving inventory item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save inventory item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    {showAdjust && item && (
      <InventoryAdjustmentDialog item={item as unknown as AdjustableItem} onClose={() => setShowAdjust(false)} onSaved={() => onSuccess?.()} />
    )}
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit Inventory Item' : 'Add Inventory Item'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="item-info" className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="item-info">Basic Info</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="uom">Pricing</TabsTrigger>
              <TabsTrigger value="bom">Production BOM</TabsTrigger>
              <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
              <TabsTrigger value="packed-dimensions">Packed Dims</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
            </TabsList>

            <TabsContent value="item-info" className="space-y-4">
              {/* Row 1: SKU, Outsourced, Consigned Materials, Vendor - 4 column layout like Assembly form */}
              <div className="grid grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="Enter SKU"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="is_externally_sourced">Outsourced</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p><strong>Insourced (Off):</strong> Purchase orders are generated for restocking from the preferred vendor configured in purchase UOMs.</p>
                          <p className="mt-1"><strong>Outsourced (On):</strong> This item is sourced from an external supplier using their part number.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center h-10">
                    <Switch
                      id="is_externally_sourced"
                      checked={formData.is_externally_sourced}
                      onCheckedChange={(checked) => {
                        setFormData(prev => ({ 
                          ...prev, 
                          is_externally_sourced: checked,
                          external_supplier_id: checked ? prev.external_supplier_id : '',
                          external_part_number: checked ? prev.external_part_number : ''
                        }));
                      }}
                    />
                  </div>
                </div>

                <div className={`space-y-2 ${!formData.is_externally_sourced ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="is_consigned">Consigned Materials</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Enable if you send raw materials to the contract manufacturer. When receiving the finished item, component inventory will be automatically decremented.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-center h-10">
                    <Switch
                      id="is_consigned"
                      checked={formData.is_consigned}
                      disabled={!formData.is_externally_sourced}
                      onCheckedChange={(checked) => {
                        setFormData(prev => ({ ...prev, is_consigned: checked }));
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Popover open={vendorOpen} onOpenChange={setVendorOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={vendorOpen}
                        className={cn(
                          "w-full justify-between h-10",
                          !formData.is_externally_sourced && "opacity-50"
                        )}
                        disabled={!formData.is_externally_sourced}
                      >
                        {formData.external_supplier_id
                          ? vendors.find((v) => v.id === formData.external_supplier_id)?.name || "Select vendor..."
                          : "Select vendor..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 bg-popover" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Search vendors..." 
                          value={vendorSearchTerm}
                          onValueChange={setVendorSearchTerm}
                        />
                        <CommandList>
                          <CommandEmpty>No vendor found.</CommandEmpty>
                          <CommandGroup>
                            {vendors
                              .filter(v => v.name.toLowerCase().includes(vendorSearchTerm.toLowerCase()))
                              .map((vendor) => (
                                <CommandItem
                                  key={vendor.id}
                                  value={vendor.name}
                                  onSelect={() => {
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      external_supplier_id: vendor.id
                                    }));
                                    setVendorOpen(false);
                                    setVendorSearchTerm('');
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

              {/* Row 2: Manufacturer Part Number in 4th column (below Vendor) */}
              <div className="grid grid-cols-4 gap-4 items-end">
                <div className="col-span-3"></div>
                <div className={`space-y-2 ${!formData.is_externally_sourced ? 'opacity-50' : ''}`}>
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

              {/* Row 3: Lead Time, Minimum Order Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lead_time_days">Lead Time (Days)</Label>
                  <Input
                    id="lead_time_days"
                    type="number"
                    min="0"
                    value={formData.lead_time_days}
                    onChange={(e) => setFormData(prev => ({ ...prev, lead_time_days: e.target.value }))}
                    placeholder="Days"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minimum_order_quantity">Vendor's Minimum Order Qty</Label>
                  <Input
                    id="minimum_order_quantity"
                    type="number"
                    min="1"
                    value={formData.minimum_order_quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, minimum_order_quantity: e.target.value }))}
                    placeholder="1"
                  />
                </div>
              </div>

              {/* Row 4: Sales Description & Purchase Description */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sales_description">Sales Description</Label>
                  <Textarea
                    id="sales_description"
                    value={formData.sales_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, sales_description: e.target.value }))}
                    placeholder="Enter sales description (optional)"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purchase_description">Purchase Description</Label>
                  <Textarea
                    id="purchase_description"
                    value={formData.purchase_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchase_description: e.target.value }))}
                    placeholder="Description for purchasing"
                    rows={3}
                  />
                </div>
              </div>

              {/* Row 5: Reorder Point & Safety Stock (Auto-calculated) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label className="cursor-help">
                          Reorder Point (Auto-calculated) ℹ️
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Formula: (Demand Rate × Lead Time) + Safety Stock</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="p-3 rounded-md border bg-background">
                    <div className="text-sm font-medium">
                      {formData.reorder_point} units
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Calculated based on demand patterns and lead time
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label className="cursor-help flex items-center gap-1">
                          Safety Stock (Calculated) ℹ️
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Formula: Z-score (3.09) × Demand StdDev × √(Lead Time Days)</p>
                        <p className="text-xs mt-1">Provides 99.9% service level protection</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="p-3 rounded-md border bg-background">
                    <div className="text-sm font-medium">
                      {safetyStockLoading ? "Calculating..." : 
                       safetyStock !== null ? 
                       `${Math.ceil(safetyStock)} units${calculateDaysOfSupply(Math.ceil(safetyStock).toString(), formData.daily_consumption_rate) ? ` (${calculateDaysOfSupply(Math.ceil(safetyStock).toString(), formData.daily_consumption_rate)} days)` : ''}` : 
                       "N/A"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Provides 99.9% service level protection
                    </p>
                  </div>
                </div>
              </div>

              {/* Row 6: Eligible for distributor discount & Taxable */}
              <div className="grid grid-cols-2 gap-4">
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
                    id="is_taxable"
                    checked={formData.is_taxable}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        is_taxable: checked === true 
                      }))
                    }
                  />
                  <Label htmlFor="is_taxable">
                    Taxable
                  </Label>
                </div>
              </div>

              {/* Row 7: Visible for sale & Active */}
              <div className="grid grid-cols-2 gap-4">
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

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        is_active: checked === true 
                      }))
                    }
                  />
                  <Label htmlFor="is_active">
                    Active
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

            <TabsContent value="uom" className="space-y-6">
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-2">Units of Measure Configuration</h4>
                  <p className="text-xs text-muted-foreground">
                    Configure multiple ways to buy and sell this item. You can define as many purchase and sales UOMs as needed.
                  </p>
                </div>

                {/* Purchase UOMs Section */}
                <PurchaseUomEditor
                  inventoryItemId={item?.id || null}
                  uoms={purchaseUoms}
                  onChange={setPurchaseUoms}
                  stockingUom={formData.stocking_uom}
                  disabled={!formData.is_externally_sourced}
                />

                {/* Sales UOMs Section */}
                <SalesUomEditor
                  inventoryItemId={item?.id || null}
                  uoms={salesUoms}
                  onChange={setSalesUoms}
                  stockingUom={formData.stocking_uom}
                />

                {/* Summary */}
                {(salesUoms.filter(u => !u.isDeleted).length > 0 || purchaseUoms.filter(u => !u.isDeleted).length > 0) && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h5 className="font-medium mb-2">Configuration Summary</h5>
                    <div className="text-sm space-y-1">
                      <p><strong>Stocking Unit:</strong> {formData.stocking_uom}</p>
                      <p><strong>Purchase Options:</strong> {purchaseUoms.filter(u => !u.isDeleted).length} configured</p>
                      <p><strong>Sales Options:</strong> {salesUoms.filter(u => !u.isDeleted).length} configured</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Production BOM Tab - always shown */}
            <TabsContent value="bom" className="space-y-4">
              <InventoryItemBomEditor
                inventoryItemId={item?.id}
                components={bomComponents}
                onComponentsChange={setBomComponents}
                currentItemId={item?.id}
              />
              
              {formData.is_externally_sourced && formData.is_consigned && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    <strong>Consigned Manufacturing:</strong> When this item is received on a Purchase Order, the component quantities defined above will be automatically deducted from inventory and recorded as demand events.
                  </p>
                </div>
              )}
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
              </div>

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
                       )?.toFixed(2) || item?.volume_cubic_inches?.toFixed(2) || 'N/A'} in³
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
                     {item?.density ? `${item.density.toFixed(3)} oz/in³` : 'N/A'}
                   </div>
                   <p className="text-xs text-muted-foreground mt-1">
                     Auto-calculated: Weight ÷ Volume
                   </p>
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
                       )?.toFixed(2) || item?.packed_volume_cubic_inches?.toFixed(2) || 'N/A'} in³
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
                        {item?.packed_density ? `${item.packed_density.toFixed(3)} oz/in³` : 'N/A'}
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
                    Track current inventory levels and allocation status.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column - Input Fields */}
                  <div className="space-y-4">
                    <h5 className="text-sm font-medium text-muted-foreground">Input Fields</h5>
                    
                    <div className="space-y-2">
                      <Label htmlFor="quantity_on_hand">Quantity on Hand *</Label>
                      <Input
                        id="quantity_on_hand"
                        type="number"
                        value={formData.quantity_on_hand}
                        onChange={(e) => setFormData(prev => ({ ...prev, quantity_on_hand: e.target.value }))}
                        placeholder="0"
                        required
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
                          {(parseInt(formData.quantity_on_hand || '0') + (item?.quantity_on_order || 0) - parseInt(formData.quantity_allocated || '0'))} units
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
                              <p>Auto-calculated from active purchase orders</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <span className="text-sm font-medium">{item?.quantity_on_order || 0} units</span>
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
                              <p>Auto-calculated from historical demand data</p>
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

            <TabsContent value="media" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="video_url">Video URL</Label>
                <Input
                  id="video_url"
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, video_url: e.target.value }))}
                  placeholder="https://example.com/video.mp4"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Images (Up to 10)</Label>
                <PhotoUploader
                  onChange={setSelectedPhotos}
                  multiple={true}
                  allowCamera={true}
                  enableBgRemovalToggle={true}
                  existingPhotos={formatExistingImages(item?.image_urls)}
                  existingImageCount={item?.image_urls?.length || 0}
                  isEditMode={!!item}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            {item && canAdjust && (
              <Button type="button" variant="outline" className="mr-auto" onClick={() => setShowAdjust(true)}>
                Adjust Quantity/Value on Hand
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : item ? "Update Item" : "Create Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
};