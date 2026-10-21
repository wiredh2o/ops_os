import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from "@/lib/utils";
import { SALES_LOT_OPTIONS } from '@/lib/uom-constants';

interface InventoryItem {
  id: string;
  sku: string;
  unit_price: number;
  quantity_on_hand: number;
  sales_description?: string | null;
}

interface Assembly {
  id: string;
  sku: string;
  selling_price: number;
  sales_description?: string | null;
}

interface LaborItem {
  id: string;
  item_number: string;
  name: string;
  hourly_rate: number;
  unit_of_measure: string;
  is_taxable: boolean;
  description?: string | null;
}

interface SalesUom {
  id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  is_default: boolean;
}

interface CombinedItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  type: 'inventory_item' | 'assembly' | 'labor';
  is_taxable: boolean;
  sales_description?: string | null;
}

interface OrderItem {
  item_type: 'inventory_item' | 'assembly' | 'labor';
  inventory_item_id?: string;
  assembly_id?: string;
  labor_item_id?: string;
  item_name: string;
  item_sku: string;
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
  notes?: string;
  sales_description?: string | null;
  // UOM fields
  sales_uom_id?: string;
  sales_uom_description?: string;
  sales_uom_quantity?: number;
  stocking_quantity?: number;
}

interface EnhancedProductionOrderFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const EnhancedProductionOrderForm: React.FC<EnhancedProductionOrderFormProps> = ({ 
  onClose, 
  onSuccess 
}) => {
  const [loading, setLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [combinedItems, setCombinedItems] = useState<CombinedItem[]>([]);
  const [salesUoms, setSalesUoms] = useState<Record<string, SalesUom[]>>({});
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    priority: 'normal',
    due_date: '',
    notes: '',
    customer_company_id: '',
  });
  const [companies, setCompanies] = useState<{ id: string; name: string; shipping_addresses: any }[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchInventoryData();
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, shipping_addresses')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchInventoryData = async () => {
    try {
      const [itemsResponse, assembliesResponse, laborResponse] = await Promise.all([
        supabase.from('inventory_items').select('id, sku, unit_price, quantity_on_hand, sales_description').order('sku'),
        supabase.from('assemblies').select('id, sku, selling_price, sales_description').order('sku'),
        supabase.from('labor_items').select('id, item_number, name, hourly_rate, unit_of_measure, is_taxable, description').order('item_number')
      ]);

      if (itemsResponse.error) throw itemsResponse.error;
      if (assembliesResponse.error) throw assembliesResponse.error;
      if (laborResponse.error) throw laborResponse.error;

      const inventoryItemsData = itemsResponse.data || [];
      const assembliesData = assembliesResponse.data || [];
      const laborItemsData = laborResponse.data || [];

      setInventoryItems(inventoryItemsData);
      setAssemblies(assembliesData);
      setLaborItems(laborItemsData);

      // Create combined items list with inventory items first, then assemblies at bottom, labor items in between
      const combined: CombinedItem[] = [
        ...inventoryItemsData.map(item => ({
          id: item.id,
          sku: item.sku,
          name: `${item.sku} (Inventory)`,
          price: item.unit_price,
          type: 'inventory_item' as const,
          is_taxable: true,
          sales_description: item.sales_description
        })),
        ...laborItemsData.map(labor => ({
          id: labor.id,
          sku: labor.item_number,
          name: `${labor.item_number} - ${labor.name} (Labor)`,
          price: labor.hourly_rate,
          type: 'labor' as const,
          is_taxable: labor.is_taxable,
          sales_description: labor.description
        })),
        ...assembliesData.map(assembly => ({
          id: assembly.id,
          sku: assembly.sku,
          name: `${assembly.sku} (Assembly)`,
          price: assembly.selling_price,
          type: 'assembly' as const,
          is_taxable: true,
          sales_description: assembly.sales_description
        }))
      ];
      
      setCombinedItems(combined);
    } catch (error) {
      console.error('Error fetching inventory data:', error);
    }
  };

  const fetchSalesUomsForItem = async (inventoryItemId: string) => {
    if (salesUoms[inventoryItemId]) return salesUoms[inventoryItemId];
    
    try {
      const { data, error } = await supabase
        .from('inventory_sales_uoms')
        .select('*')
        .eq('inventory_item_id', inventoryItemId)
        .order('sort_order');
      
      if (error) throw error;
      
      const uoms = data || [];
      setSalesUoms(prev => ({ ...prev, [inventoryItemId]: uoms }));
      return uoms;
    } catch (error) {
      console.error('Error fetching sales UOMs:', error);
      return [];
    }
  };

  const generateOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PO${year}${month}${day}${random}`;
  };

  const addOrderItem = () => {
    setOrderItems(prev => [...prev, {
      item_type: 'inventory_item',
      item_name: '',
      item_sku: '',
      quantity: 1,
      unit_price: 0,
      is_taxable: true,
      sales_uom_quantity: 1,
    }]);
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateOrderItem = async (index: number, field: keyof OrderItem | 'selectedItemId' | 'selectedUomId', value: any) => {
    setOrderItems(prev => prev.map((item, i) => {
      if (i === index) {
        const updated = { ...item };
        
        // Handle unified item selection
        if (field === 'selectedItemId') {
          const combinedItem = combinedItems.find(ci => ci.id === value);
          if (combinedItem) {
            updated.item_type = combinedItem.type;
            updated.item_name = combinedItem.name.replace(/ \((Inventory|Assembly|Labor)\)/, '');
            updated.item_sku = combinedItem.sku;
            updated.unit_price = combinedItem.price;
            updated.is_taxable = combinedItem.is_taxable;
            updated.sales_description = combinedItem.sales_description;
            
            // Clear all item IDs and UOM fields first
            updated.inventory_item_id = undefined;
            updated.assembly_id = undefined;
            updated.labor_item_id = undefined;
            updated.sales_uom_id = undefined;
            updated.sales_uom_description = undefined;
            updated.sales_uom_quantity = 1;
            
            // Set the appropriate ID
            if (combinedItem.type === 'inventory_item') {
              updated.inventory_item_id = combinedItem.id;
              // Fetch sales UOMs for this item and auto-select if single UOM
              fetchSalesUomsForItem(combinedItem.id).then(uoms => {
                if (uoms.length === 1) {
                  // Auto-select the single UOM
                  setOrderItems(prev => prev.map((orderItem, idx) => {
                    if (idx === index && orderItem.inventory_item_id === combinedItem.id) {
                      return {
                        ...orderItem,
                        sales_uom_id: uoms[0].id,
                        sales_uom_description: uoms[0].description || `${uoms[0].quantity}pc Lot`,
                        sales_uom_quantity: uoms[0].quantity,
                        unit_price: uoms[0].unit_price,
                        stocking_quantity: orderItem.quantity * uoms[0].quantity,
                      };
                    }
                    return orderItem;
                  }));
                }
              });
            } else if (combinedItem.type === 'assembly') {
              updated.assembly_id = combinedItem.id;
            } else if (combinedItem.type === 'labor') {
              updated.labor_item_id = combinedItem.id;
            }
          }
        } else if (field === 'selectedUomId') {
          // Handle UOM selection
          const itemUoms = item.inventory_item_id ? salesUoms[item.inventory_item_id] : [];
          const selectedUom = itemUoms?.find(u => u.id === value);
          if (selectedUom) {
            updated.sales_uom_id = selectedUom.id;
            updated.sales_uom_description = selectedUom.description || `${selectedUom.quantity}pc Lot`;
            updated.sales_uom_quantity = selectedUom.quantity;
            updated.unit_price = selectedUom.unit_price;
          }
        } else {
          // Handle regular field updates
          (updated as any)[field] = value;
          
          // Auto-populate data when selecting inventory item, assembly, or labor (legacy support)
          if (field === 'inventory_item_id' && value) {
            const inventoryItem = inventoryItems.find(item => item.id === value);
            if (inventoryItem) {
              updated.item_type = 'inventory_item';
              updated.item_name = inventoryItem.sku;
              updated.item_sku = inventoryItem.sku;
              updated.unit_price = inventoryItem.unit_price;
              updated.is_taxable = true;
              updated.assembly_id = undefined;
              updated.labor_item_id = undefined;
            }
          } else if (field === 'assembly_id' && value) {
            const assembly = assemblies.find(assembly => assembly.id === value);
            if (assembly) {
              updated.item_type = 'assembly';
              updated.item_name = assembly.sku;
              updated.item_sku = assembly.sku;
              updated.unit_price = assembly.selling_price;
              updated.is_taxable = true;
              updated.inventory_item_id = undefined;
              updated.labor_item_id = undefined;
            }
          } else if (field === 'labor_item_id' && value) {
            const laborItem = laborItems.find(item => item.id === value);
            if (laborItem) {
              updated.item_type = 'labor';
              updated.item_name = laborItem.name;
              updated.item_sku = laborItem.item_number;
              updated.unit_price = laborItem.hourly_rate;
              updated.is_taxable = laborItem.is_taxable;
              updated.inventory_item_id = undefined;
              updated.assembly_id = undefined;
            }
          }
        }
        
        // Calculate stocking quantity
        updated.stocking_quantity = updated.quantity * (updated.sales_uom_quantity || 1);
        
        return updated;
      }
      return item;
    }));
  };

  const getSelectedItemId = (item: OrderItem) => {
    return item.inventory_item_id || item.assembly_id || item.labor_item_id;
  };

  const calculateTotal = () => {
    return orderItems.reduce((total, item) => total + (item.quantity * item.unit_price), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name.trim()) {
      toast({
        title: "Error",
        description: "Customer name is required",
        variant: "destructive",
      });
      return;
    }

    // Validate shipping address if a customer company is selected
    if (formData.customer_company_id) {
      const selectedCompany = companies.find(c => c.id === formData.customer_company_id);
      if (selectedCompany) {
        const shippingAddresses = selectedCompany.shipping_addresses;
        const parsedAddresses = typeof shippingAddresses === 'string' 
          ? JSON.parse(shippingAddresses || '[]') 
          : (shippingAddresses || []);
        
        if (!parsedAddresses || parsedAddresses.length === 0) {
          toast({
            title: "Error",
            description: "This customer does not have a shipping address. Please add one in Customer Management before creating an order.",
            variant: "destructive",
          });
          return;
        }

        // Check if at least one address has required fields
        const hasValidAddress = parsedAddresses.some((addr: any) => 
          addr.address?.trim() && addr.city?.trim() && addr.state?.trim() && addr.zip?.trim()
        );

        if (!hasValidAddress) {
          toast({
            title: "Error",
            description: "This customer's shipping address is incomplete. Please update it in Customer Management before creating an order.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (orderItems.length === 0) {
      toast({
        title: "Error",
        description: "At least one order item is required",
        variant: "destructive",
      });
      return;
    }

    const invalidItems = orderItems.filter(item => 
      !item.item_name.trim() || 
      !item.item_sku.trim() || 
      item.quantity <= 0 || 
      item.unit_price < 0 ||
      (item.item_type === 'inventory_item' && !item.inventory_item_id) ||
      (item.item_type === 'assembly' && !item.assembly_id) ||
      (item.item_type === 'labor' && !item.labor_item_id)
    );
    
    if (invalidItems.length > 0) {
      toast({
        title: "Error",
        description: "All order items must have a selected item, quantity > 0, and price >= 0",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const orderData = {
        order_number: generateOrderNumber(),
        customer_name: formData.customer_name.trim(),
        customer_email: formData.customer_email.trim() || null,
        customer_phone: formData.customer_phone.trim() || null,
        customer_company_id: formData.customer_company_id || null,
        priority: formData.priority,
        total_amount: calculateTotal(),
        due_date: formData.due_date || null,
        notes: formData.notes.trim() || null,
        created_by: user.id,
      };

      // Insert order first
      const { data: order, error: orderError } = await supabase
        .from('production_orders')
        .insert([orderData])
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert order items
      const orderItemsData = orderItems.map(item => ({
        production_order_id: order.id,
        item_type: item.item_type,
        inventory_item_id: item.inventory_item_id || null,
        assembly_id: item.assembly_id || null,
        labor_item_id: item.labor_item_id || null,
        item_name: item.item_name.trim(),
        item_sku: item.item_sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        is_taxable: item.is_taxable,
        notes: item.notes?.trim() || null,
        sales_uom_id: item.sales_uom_id || null,
        sales_uom_description: item.sales_uom_description || null,
        sales_uom_quantity: item.sales_uom_quantity || 1,
        stocking_quantity: item.quantity * (item.sales_uom_quantity || 1),
      }));

      const { error: itemsError } = await supabase
        .from('production_order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      toast({
        title: "Success",
        description: "Production order created successfully",
      });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create production order: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = calculateTotal();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Production Order</DialogTitle>
          <DialogDescription>Add customer details and order items to create a new order.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customer_name">Customer Name *</Label>
                <Input
                  id="customer_name"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="customer_email">Customer Email</Label>
                <Input
                  id="customer_email"
                  type="email"
                  value={formData.customer_email}
                  onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="customer_phone">Customer Phone</Label>
                <Input
                  id="customer_phone"
                  type="tel"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="customer_company">Customer Company</Label>
                <Select 
                  value={formData.customer_company_id} 
                  onValueChange={(value) => setFormData({ ...formData, customer_company_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Order Items</CardTitle>
                <Button type="button" onClick={addOrderItem} size="sm" className="gap-2">
                  <Plus size={16} />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {orderItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No items added yet. Click "Add Item" to get started.
                </p>
              ) : (
                orderItems.map((item, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="grid grid-cols-[minmax(0,1.44fr)_minmax(0,2.5fr)_minmax(0,1.2fr)_75px_90px_95px_28px] gap-1 items-end">
                      {/* Item Select */}
                      <div>
                        <Label className="text-xs">Item</Label>
                        <Select
                          value={getSelectedItemId(item) || ''}
                          onValueChange={(value) => updateOrderItem(index, 'selectedItemId', value)}
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
                                  {combinedItem.type === 'labor' && (
                                    <Badge variant="outline" className="text-xs">Labor</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Sales Description */}
                      <div>
                        <Label className="text-xs">Description</Label>
                        <div className="h-9 flex items-center text-xs text-muted-foreground truncate">
                          {item.sales_description || '—'}
                        </div>
                      </div>
                      
                      {/* Lot Size */}
                      <div>
                        <Label className="text-xs">Lot Size</Label>
                        {item.item_type === 'inventory_item' && item.inventory_item_id && salesUoms[item.inventory_item_id]?.length > 1 ? (
                          <Select
                            value={item.sales_uom_id || ''}
                            onValueChange={(value) => updateOrderItem(index, 'selectedUomId', value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Lot" />
                            </SelectTrigger>
                            <SelectContent>
                              {salesUoms[item.inventory_item_id].map((uom) => (
                                <SelectItem key={uom.id} value={uom.id}>
                                  <FinancialGuard kind="revenue">{uom.description || `${uom.quantity}pc`}</FinancialGuard>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : item.item_type === 'inventory_item' && item.inventory_item_id && salesUoms[item.inventory_item_id]?.length === 1 ? (
                          <Input
                            value={salesUoms[item.inventory_item_id][0].description || `${salesUoms[item.inventory_item_id][0].quantity}pc`}
                            disabled
                            className="bg-muted h-9 text-xs"
                          />
                        ) : (
                          <Input
                            value={item.item_type === 'labor' ? 'Hour' : '1pc'}
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
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          className="h-9"
                        />
                      </div>

                      {/* Unit Price */}
                      <div>
                        <Label className="text-xs">Price</Label>
                        <div className="h-9 flex items-center px-2 bg-muted rounded-md text-sm">
                          <FinancialGuard kind="revenue">{formatCurrency(item.unit_price)}</FinancialGuard>
                        </div>
                      </div>

                      {/* Total */}
                      <div>
                        <Label className="text-xs">Total</Label>
                        <div className="h-9 flex items-center px-2 bg-muted rounded-md text-sm font-medium">
                          <FinancialGuard kind="revenue">{formatCurrency(item.quantity * item.unit_price)}</FinancialGuard>
                        </div>
                      </div>

                      {/* Delete */}
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOrderItem(index)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {orderItems.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center text-lg font-semibold">
                    <span>Total Order Amount:</span>
                    <Badge variant="outline" className="text-lg px-3 py-1">
                      <FinancialGuard kind="revenue">{formatCurrency(totalAmount)}</FinancialGuard>
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Notes */}
          <div>
            <Label htmlFor="notes">Order Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="General order notes (optional)"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || orderItems.length === 0}>
              {loading ? 'Creating...' : 'Create Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};