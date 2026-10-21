import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from "@/lib/utils";
import { getUomLabel, calculateStockingQuantity } from '@/lib/uom-constants';
import { isRangeTracked, recordRangeReceived } from '@/lib/serial-range-utils';
import { POLineItemRangeInput } from './POLineItemRangeInput';
interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  lead_time_days: number;
  is_active: boolean;
}

interface PurchaseOrder {
  id: string;
  purchase_order_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  total_amount: number;
  notes?: string;
}

interface InventoryItem {
  id: string;
  sku: string;
  name?: string;
  unit_price: number;
  unit_cost?: number;
  purchase_description?: string | null;
  serial_tracking_type?: string | null;
  // UOM fields
  has_purchase_conversion?: boolean;
  purchase_uom?: string;
  purchase_uom_quantity?: number;
  purchase_unit_cost?: number;
}

interface Assembly {
  id: string;
  sku: string;
  description?: string;
  selling_price: number;
  purchase_description?: string | null;
  serial_tracking_type?: string | null;
}

interface CombinedItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  type: 'inventory_item' | 'assembly';
  purchase_description?: string | null;
  serial_tracking_type?: string | null;
  // UOM fields for inventory items
  has_purchase_conversion?: boolean;
  purchase_uom?: string;
  purchase_uom_quantity?: number;
  purchase_unit_cost?: number;
  unit_cost?: number;
}

interface PurchaseUom {
  id: string;
  purchase_uom: string;
  quantity: number;
  unit_cost: number;
  is_default: boolean;
  supplier_name?: string;
}

interface PurchaseOrderItem {
  id?: string;
  item_type: 'inventory_item' | 'assembly';
  inventory_item_id?: string;
  assembly_id?: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  status: string;
  notes?: string;
  purchase_description?: string | null;
  serial_tracking_type?: string | null;
  // UOM fields
  purchase_uom_id?: string;
  purchase_uom?: string;
  purchase_uom_quantity?: number;
  stocking_quantity?: number;
  // Range tracking fields
  serial_range_start?: number | null;
  serial_range_end?: number | null;
  range_valid?: boolean;
}

interface PurchaseOrderFormProps {
  purchaseOrder?: PurchaseOrder | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSuccess: () => void;
}

export function PurchaseOrderForm({ purchaseOrder, suppliers, onClose, onSuccess }: PurchaseOrderFormProps) {
  const [formData, setFormData] = useState({
    purchase_order_number: '',
    supplier_id: '',
    status: 'draft',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    notes: '',
  });
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [combinedItems, setCombinedItems] = useState<CombinedItem[]>([]);
  const [purchaseUoms, setPurchaseUoms] = useState<Record<string, PurchaseUom[]>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchItems();
    if (purchaseOrder) {
      setFormData({
        purchase_order_number: purchaseOrder.purchase_order_number,
        supplier_id: purchaseOrder.supplier_id,
        status: purchaseOrder.status,
        order_date: purchaseOrder.order_date,
        expected_delivery_date: purchaseOrder.expected_delivery_date || '',
        notes: purchaseOrder.notes || '',
      });
      fetchPurchaseOrderItems();
    } else {
      generatePONumber();
    }
  }, [purchaseOrder]);

  const fetchItems = async () => {
    try {
      const [inventoryResponse, assembliesResponse] = await Promise.all([
        supabase.from('inventory_items').select('id, sku, sales_description, purchase_description, unit_price, unit_cost, has_purchase_conversion, purchase_uom, purchase_uom_quantity, purchase_unit_cost, serial_tracking_type').order('sku'),
        supabase.from('assemblies').select('id, sku, sales_description, selling_price, purchase_description, serial_tracking_type').order('sku')
      ]);

      if (inventoryResponse.error) throw inventoryResponse.error;
      if (assembliesResponse.error) throw assembliesResponse.error;

      const inventoryItemsData = inventoryResponse.data.map(item => ({
        ...item,
        name: item.sales_description,
        purchase_description: item.purchase_description,
        serial_tracking_type: item.serial_tracking_type,
      }));
      
      setInventoryItems(inventoryItemsData);
      setAssemblies(assembliesResponse.data);

      // Create combined items list with inventory items first, then assemblies
      const combined: CombinedItem[] = [
        ...inventoryItemsData.map(item => ({
          id: item.id,
          sku: item.sku,
          name: item.name || 'Inventory Item',
          price: item.unit_price,
          type: 'inventory_item' as const,
          purchase_description: item.purchase_description,
          serial_tracking_type: item.serial_tracking_type,
          has_purchase_conversion: item.has_purchase_conversion,
          purchase_uom: item.purchase_uom,
          purchase_uom_quantity: item.purchase_uom_quantity,
          purchase_unit_cost: item.purchase_unit_cost,
          unit_cost: item.unit_cost,
        })),
        ...assembliesResponse.data.map(assembly => ({
          id: assembly.id,
          sku: assembly.sku,
          name: assembly.sales_description || assembly.sku,
          price: assembly.selling_price,
          type: 'assembly' as const,
          purchase_description: assembly.purchase_description,
          serial_tracking_type: assembly.serial_tracking_type,
        }))
      ];
      
      setCombinedItems(combined);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const fetchPurchaseUomsForItem = async (inventoryItemId: string) => {
    if (purchaseUoms[inventoryItemId]) return purchaseUoms[inventoryItemId];
    
    try {
      const { data, error } = await supabase
        .from('inventory_purchase_uoms')
        .select('*')
        .eq('inventory_item_id', inventoryItemId)
        .order('sort_order');
      
      if (error) throw error;
      
      const uoms = data || [];
      setPurchaseUoms(prev => ({ ...prev, [inventoryItemId]: uoms }));
      return uoms;
    } catch (error) {
      console.error('Error fetching purchase UOMs:', error);
      return [];
    }
  };

  const fetchPurchaseOrderItems = async () => {
    if (!purchaseOrder?.id) return;

    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', purchaseOrder.id);

      if (error) throw error;
      
      const typedItems: PurchaseOrderItem[] = (data || []).map(item => {
        // Look up serial_tracking_type from combinedItems
        const matchedItem = combinedItems.find(ci => 
          (item.item_type === 'inventory_item' && ci.id === item.inventory_item_id) ||
          (item.item_type === 'assembly' && ci.id === item.assembly_id)
        );
        
        return {
          id: item.id,
          item_type: item.item_type as 'inventory_item' | 'assembly',
          inventory_item_id: item.inventory_item_id,
          assembly_id: item.assembly_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          status: item.status,
          notes: item.notes,
          purchase_uom_id: item.purchase_uom_id,
          purchase_uom: item.purchase_uom,
          purchase_uom_quantity: item.purchase_uom_quantity,
          stocking_quantity: item.stocking_quantity,
          serial_tracking_type: matchedItem?.serial_tracking_type,
          serial_range_start: item.serial_range_start,
          serial_range_end: item.serial_range_end,
          range_valid: item.serial_range_start != null && item.serial_range_end != null,
        };
      });
      
      setItems(typedItems);
    } catch (error) {
      console.error('Error fetching purchase order items:', error);
    }
  };

  const generatePONumber = async () => {
    try {
      const { count } = await supabase
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true });

      const poNumber = `PO-${String((count || 0) + 1).padStart(6, '0')}`;
      setFormData(prev => ({ ...prev, purchase_order_number: poNumber }));
    } catch (error) {
      console.error('Error generating PO number:', error);
    }
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      item_type: 'inventory_item',
      quantity: 1,
      unit_cost: 0,
      total_cost: 0,
      status: 'pending',
    }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = async (index: number, field: keyof PurchaseOrderItem | 'selectedItemId' | 'selectedUomId', value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      
      const updatedItem = { ...item };
      
      // Handle unified item selection
      if (field === 'selectedItemId') {
        const combinedItem = combinedItems.find(ci => ci.id === value);
        if (combinedItem) {
          updatedItem.item_type = combinedItem.type;
          updatedItem.purchase_description = combinedItem.purchase_description;
          updatedItem.serial_tracking_type = combinedItem.serial_tracking_type;
          
          // Clear range fields when item changes
          updatedItem.serial_range_start = null;
          updatedItem.serial_range_end = null;
          updatedItem.range_valid = false;
          
          // Use purchase_unit_cost if available, otherwise fall back to unit_cost or price
          if (combinedItem.type === 'inventory_item' && combinedItem.has_purchase_conversion && combinedItem.purchase_unit_cost) {
            updatedItem.unit_cost = combinedItem.purchase_unit_cost;
            updatedItem.purchase_uom_quantity = combinedItem.purchase_uom_quantity || 1;
          } else if (combinedItem.unit_cost) {
            updatedItem.unit_cost = combinedItem.unit_cost;
            updatedItem.purchase_uom_quantity = 1;
          } else {
            updatedItem.unit_cost = combinedItem.price;
            updatedItem.purchase_uom_quantity = 1;
          }
          
          if (combinedItem.type === 'inventory_item') {
            updatedItem.inventory_item_id = combinedItem.id;
            updatedItem.assembly_id = undefined;
            // Fetch purchase UOMs for this item and auto-select if single UOM
            fetchPurchaseUomsForItem(combinedItem.id).then(uoms => {
              if (uoms.length === 1) {
                // Auto-select the single UOM
                setItems(prev => prev.map((orderItem, idx) => {
                  if (idx === index && orderItem.inventory_item_id === combinedItem.id) {
                    return {
                      ...orderItem,
                      purchase_uom_id: uoms[0].id,
                      purchase_uom: uoms[0].purchase_uom,
                      purchase_uom_quantity: uoms[0].quantity,
                      unit_cost: uoms[0].unit_cost,
                      total_cost: orderItem.quantity * uoms[0].unit_cost,
                      stocking_quantity: orderItem.quantity * uoms[0].quantity,
                    };
                  }
                  return orderItem;
                }));
              }
            });
            // Clear UOM selection since item changed
            updatedItem.purchase_uom_id = undefined;
            updatedItem.purchase_uom = undefined;
          } else {
            updatedItem.assembly_id = combinedItem.id;
            updatedItem.inventory_item_id = undefined;
            updatedItem.purchase_uom_id = undefined;
            updatedItem.purchase_uom = undefined;
            updatedItem.purchase_uom_quantity = 1;
          }
        }
      } else if (field === 'selectedUomId') {
        // Handle UOM selection
        const itemUoms = item.inventory_item_id ? purchaseUoms[item.inventory_item_id] : [];
        const selectedUom = itemUoms?.find(u => u.id === value);
        if (selectedUom) {
          updatedItem.purchase_uom_id = selectedUom.id;
          updatedItem.purchase_uom = selectedUom.purchase_uom;
          updatedItem.purchase_uom_quantity = selectedUom.quantity;
          updatedItem.unit_cost = selectedUom.unit_cost;
        }
      } else {
        // Handle regular field updates
        (updatedItem as any)[field] = value;
        
        // Auto-fill unit cost when selecting an item (legacy support)
        if (field === 'inventory_item_id') {
          const inventoryItem = inventoryItems.find(inv => inv.id === value);
          if (inventoryItem) {
            updatedItem.unit_cost = inventoryItem.unit_price;
            updatedItem.item_type = 'inventory_item';
          }
          updatedItem.assembly_id = undefined;
        }
        
        if (field === 'assembly_id') {
          const assembly = assemblies.find(asm => asm.id === value);
          if (assembly) {
            updatedItem.unit_cost = assembly.selling_price;
            updatedItem.item_type = 'assembly';
          }
          updatedItem.inventory_item_id = undefined;
        }
      }
      
      // Recalculate total cost and stocking quantity
      updatedItem.total_cost = updatedItem.quantity * updatedItem.unit_cost;
      updatedItem.stocking_quantity = updatedItem.quantity * (updatedItem.purchase_uom_quantity || 1);
      
      return updatedItem;
    }));
  };

  // Handler for range input changes
  const handleRangeChange = (index: number, rangeStart: number | null, rangeEnd: number | null, isValid: boolean) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        serial_range_start: rangeStart,
        serial_range_end: rangeEnd,
        range_valid: isValid,
      };
    }));
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.total_cost, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_id) {
      toast({
        title: 'Error',
        description: 'Please select a supplier',
        variant: 'destructive',
      });
      return;
    }

    // Validate range-tracked items have valid ranges
    const rangeTrackedItems = items.filter(item => isRangeTracked(item.serial_tracking_type));
    const invalidRangeItems = rangeTrackedItems.filter(item => !item.range_valid);
    
    if (invalidRangeItems.length > 0) {
      toast({
        title: 'Invalid Card Ranges',
        description: `${invalidRangeItems.length} item(s) have invalid or missing card ranges. Please fix before saving.`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const poData = {
        ...formData,
        total_amount: calculateTotal(),
        created_by: user.user.id,
      };

      let purchaseOrderId: string;

      if (purchaseOrder) {
        // Update existing purchase order
        const { error } = await supabase
          .from('purchase_orders')
          .update(poData)
          .eq('id', purchaseOrder.id);

        if (error) throw error;
        purchaseOrderId = purchaseOrder.id;

        // Delete existing items
        await supabase
          .from('purchase_order_items')
          .delete()
          .eq('purchase_order_id', purchaseOrder.id);
      } else {
        // Create new purchase order
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert([poData])
          .select()
          .single();

        if (error) throw error;
        purchaseOrderId = data.id;
      }

      // Insert items
      if (items.length > 0) {
        const itemsData = items.map(item => {
          // Remove UI-only fields before insert
          const { range_valid, serial_tracking_type, purchase_description, ...insertableItem } = item;
          return {
            ...insertableItem,
            purchase_order_id: purchaseOrderId,
          };
        });

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(itemsData);

        if (itemsError) throw itemsError;

        // After insert, fetch the inserted items to get their IDs for range recording
        const { data: insertedItems } = await supabase
          .from('purchase_order_items')
          .select('id, inventory_item_id, assembly_id, item_type, serial_range_start, serial_range_end')
          .eq('purchase_order_id', purchaseOrderId);

        // Record ranges to inventory if status is "delivered" (receiving)
        if (formData.status === 'delivered' && insertedItems) {
          for (const insertedItem of insertedItems) {
            const originalItem = items.find(i => 
              (insertedItem.inventory_item_id && i.inventory_item_id === insertedItem.inventory_item_id) ||
              (insertedItem.assembly_id && i.assembly_id === insertedItem.assembly_id)
            );
            
            if (originalItem && isRangeTracked(originalItem.serial_tracking_type) && 
                insertedItem.serial_range_start != null && insertedItem.serial_range_end != null) {
              const itemId = insertedItem.inventory_item_id || insertedItem.assembly_id;
              const itemType = insertedItem.item_type === 'inventory_item' ? 'inventory' : 'assembly';
              
              if (itemId) {
                await recordRangeReceived(
                  itemId,
                  itemType as 'inventory' | 'assembly',
                  insertedItem.serial_range_start,
                  insertedItem.serial_range_end,
                  purchaseOrderId,
                  insertedItem.id
                );
              }
            }
          }
        }
      }

      // For existing POs changing to "delivered", also record ranges
      if (purchaseOrder && formData.status === 'delivered' && purchaseOrder.status !== 'delivered') {
        // Fetch items with range data
        const { data: poItems } = await supabase
          .from('purchase_order_items')
          .select('id, inventory_item_id, assembly_id, item_type, serial_range_start, serial_range_end')
          .eq('purchase_order_id', purchaseOrderId);

        if (poItems) {
          for (const poItem of poItems) {
            // Check if this item uses range tracking
            const originalItem = items.find(i => i.id === poItem.id);
            const usesRange = originalItem ? isRangeTracked(originalItem.serial_tracking_type) : false;
            
            if (usesRange && poItem.serial_range_start != null && poItem.serial_range_end != null) {
              const itemId = poItem.inventory_item_id || poItem.assembly_id;
              const itemType = poItem.item_type === 'inventory_item' ? 'inventory' : 'assembly';
              
              if (itemId) {
                // Check if already recorded to avoid duplicates
                const { data: existing } = await supabase
                  .from('card_range_inventory')
                  .select('id')
                  .eq('source_po_item_id', poItem.id)
                  .maybeSingle();

                if (!existing) {
                  await recordRangeReceived(
                    itemId,
                    itemType as 'inventory' | 'assembly',
                    poItem.serial_range_start,
                    poItem.serial_range_end,
                    purchaseOrderId,
                    poItem.id
                  );
                }
              }
            }
          }
        }
      }

      toast({
        title: 'Success',
        description: `Purchase order ${purchaseOrder ? 'updated' : 'created'} successfully`,
      });

      onSuccess();
    } catch (error) {
      console.error('Error saving purchase order:', error);
      toast({
        title: 'Error',
        description: 'Failed to save purchase order',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getItemName = (item: PurchaseOrderItem) => {
    if (item.item_type === 'inventory_item' && item.inventory_item_id) {
      const inventoryItem = inventoryItems.find(inv => inv.id === item.inventory_item_id);
      return inventoryItem ? `${inventoryItem.sku} - ${inventoryItem.name || 'Inventory Item'}` : '';
    }
    if (item.item_type === 'assembly' && item.assembly_id) {
      const assembly = assemblies.find(asm => asm.id === item.assembly_id);
      return assembly ? `${assembly.sku} - ${assembly.description || 'Assembly'}` : '';
    }
    return '';
  };

  const getSelectedItemId = (item: PurchaseOrderItem) => {
    return item.item_type === 'inventory_item' ? item.inventory_item_id : item.assembly_id;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {purchaseOrder ? 'Edit Purchase Order' : 'Create Purchase Order'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="po-number">PO Number</Label>
              <Input
                id="po-number"
                value={formData.purchase_order_number}
                onChange={(e) => setFormData(prev => ({ ...prev, purchase_order_number: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Select 
                value={formData.supplier_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, supplier_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.filter(s => s.is_active).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="partial">Partially Received</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="order-date">Order Date</Label>
              <Input
                id="order-date"
                type="date"
                value={formData.order_date}
                onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="expected-date">Expected Delivery</Label>
              <Input
                id="expected-date"
                type="date"
                value={formData.expected_delivery_date}
                onChange={(e) => setFormData(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Items</CardTitle>
                <Button type="button" onClick={addItem} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No items added yet
                </p>
              ) : (
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={index} className="p-3 border rounded-lg">
                      <div className="grid grid-cols-[minmax(0,1.44fr)_minmax(0,2.5fr)_minmax(0,1.2fr)_75px_90px_95px_28px] gap-1 items-end">
                        {/* Item Select */}
                        <div>
                          <Label className="text-xs">Item</Label>
                          <Select
                            value={getSelectedItemId(item) || ''}
                            onValueChange={(value) => updateItem(index, 'selectedItemId', value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {combinedItems.map((combinedItem) => (
                                <SelectItem key={`${combinedItem.type}-${combinedItem.id}`} value={combinedItem.id}>
                                  <div className="flex items-center gap-2">
                                    {combinedItem.sku}
                                    {combinedItem.type === 'assembly' && (
                                      <Badge variant="secondary" className="text-xs">Asm</Badge>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Purchase Description */}
                        <div>
                          <Label className="text-xs">Description</Label>
                          <div className="h-9 flex items-center text-xs text-muted-foreground truncate">
                            {item.purchase_description || '—'}
                          </div>
                        </div>

                        {/* Lot Size */}
                        <div>
                          <Label className="text-xs">Lot Size</Label>
                          {item.item_type === 'inventory_item' && item.inventory_item_id && purchaseUoms[item.inventory_item_id]?.length > 1 ? (
                            <Select
                              value={item.purchase_uom_id || ''}
                              onValueChange={(value) => updateItem(index, 'selectedUomId', value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Lot" />
                              </SelectTrigger>
                              <SelectContent>
                                {purchaseUoms[item.inventory_item_id].map((uom) => (
                                  <SelectItem key={uom.id} value={uom.id}>
                                    <FinancialGuard kind="supplier_price">{`${uom.quantity}pc`}</FinancialGuard>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : item.item_type === 'inventory_item' && item.inventory_item_id && purchaseUoms[item.inventory_item_id]?.length === 1 ? (
                            <Input
                              value={`${purchaseUoms[item.inventory_item_id][0].quantity}pc`}
                              disabled
                              className="bg-muted h-9 text-xs"
                            />
                          ) : (
                            <Input
                              value="1pc"
                              disabled
                              className="bg-muted h-9 text-xs"
                            />
                          )}
                        </div>

                        {/* Qty */}
                        <div>
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            min="1"
                            className="h-9"
                          />
                        </div>

                        {/* Unit Cost */}
                        <div>
                          <Label className="text-xs">Cost</Label>
                          <div className="h-9 flex items-center px-2 bg-muted rounded-md text-sm">
                            <FinancialGuard kind="supplier_price">{formatCurrency(item.unit_cost)}</FinancialGuard>
                          </div>
                        </div>

                        {/* Total */}
                        <div>
                          <Label className="text-xs">Total</Label>
                          <div className="h-9 flex items-center px-2 bg-muted rounded-md text-sm font-medium">
                            <FinancialGuard kind="supplier_price">{formatCurrency(item.total_cost)}</FinancialGuard>
                          </div>
                        </div>

                        {/* Delete */}
                        <div className="flex justify-end">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => removeItem(index)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Remove item</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                      
                      {/* Range Tracking Input - show for range-tracked items */}
                      {isRangeTracked(item.serial_tracking_type) && (item.inventory_item_id || item.assembly_id) && (
                        <POLineItemRangeInput
                          itemId={(item.inventory_item_id || item.assembly_id)!}
                          itemType={item.item_type === 'inventory_item' ? 'inventory' : 'assembly'}
                          quantity={item.stocking_quantity || item.quantity}
                          rangeStart={item.serial_range_start ?? null}
                          rangeEnd={item.serial_range_end ?? null}
                          onRangeChange={(start, end, isValid) => handleRangeChange(index, start, end, isValid)}
                          excludePoItemId={item.id}
                        />
                      )}
                    </div>
                  ))}
                  
                  <div className="flex justify-end">
                    <div className="text-right">
                      <p className="text-lg font-semibold">
                        Total: <FinancialGuard kind="supplier_price">{formatCurrency(calculateTotal())}</FinancialGuard>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : (purchaseOrder ? 'Update' : 'Create')} Purchase Order
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}