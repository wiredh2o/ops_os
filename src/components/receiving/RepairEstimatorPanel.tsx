import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, Trash2, Package, Wrench, Box } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { getCurrentTaxRate } from "@/lib/tax-utils";
import { useCompanies } from "@/hooks/useCompanies";

interface RepairItem {
  id: string;
  name: string;
  sku?: string;
  price: number;
  type: 'inventory' | 'labor' | 'assembly';
  isTaxable?: boolean;
  unit?: string;
}

interface CartItem extends RepairItem {
  quantity: number;
  total: number;
}

interface RepairEstimatorPanelProps {
  onTotalChange: (total: number) => void;
  companyId?: string;
  customerIsTaxable?: boolean;
}

export const RepairEstimatorPanel: React.FC<RepairEstimatorPanelProps> = ({
  onTotalChange,
  companyId,
  customerIsTaxable = true
}) => {
  const [availableItems, setAvailableItems] = useState<RepairItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [draggedItem, setDraggedItem] = useState<RepairItem | null>(null);
  const [showQuantityInput, setShowQuantityInput] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState("1");
  const [taxRate, setTaxRate] = useState(0);
  const { toast } = useToast();
  const { data: companies } = useCompanies();

  const customerCompany = companies?.find(c => c.id === companyId);
  const discountRate = customerCompany?.is_distributor ? 0.15 : 0; // 15% discount for distributors

  useEffect(() => {
    fetchAvailableItems();
    getCurrentTaxRate().then(setTaxRate);
  }, []);

  useEffect(() => {
    const total = cartItems.reduce((sum, item) => sum + item.total, 0);
    onTotalChange(total);
  }, [cartItems, onTotalChange]);

  const fetchAvailableItems = async () => {
    try {
      setLoading(true);
      
      // Fetch inventory items
      const { data: inventoryItems } = await supabase
        .from('inventory_items')
        .select('id, sku, sales_description, unit_price')
        .order('sku');

      // Fetch labor items
      const { data: laborItems } = await supabase
        .from('labor_items')
        .select('id, item_number, name, hourly_rate, unit_of_measure')
        .order('item_number');

      // Fetch assemblies
      const { data: assemblies } = await supabase
        .from('assemblies')
        .select('id, sku, sales_description, selling_price')
        .order('sku');

      const items: RepairItem[] = [
        ...(inventoryItems || []).map(item => ({
          id: item.id,
          name: item.sales_description || item.sku,
          sku: item.sku,
          price: Number(item.unit_price),
          type: 'inventory' as const,
          unit: 'each',
          isTaxable: true
        })),
        ...(laborItems || []).map(item => ({
          id: item.id,
          name: item.name,
          sku: item.item_number,
          price: Number(item.hourly_rate),
          type: 'labor' as const,
          unit: item.unit_of_measure,
          isTaxable: false // Labor is typically non-taxable
        })),
        ...(assemblies || []).map(item => ({
          id: item.id,
          name: item.sales_description || item.sku,
          sku: item.sku,
          price: Number(item.selling_price),
          type: 'assembly' as const,
          unit: 'each',
          isTaxable: true
        }))
      ];

      setAvailableItems(items);
    } catch (error) {
      console.error('Error fetching items:', error);
      toast({
        title: "Error",
        description: "Failed to load available items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

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
      setTempQuantity(draggedItem.type === 'labor' ? "60" : "1"); // Default to 60 minutes for labor
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

  const updateQuantity = (itemId: string, newQuantity: number) => {
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

  const clearCart = () => {
    setCartItems([]);
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
    return <div className="p-4 text-center">Loading items...</div>;
  }

  return (
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
                    draggable
                    onDragStart={() => handleDragStart(item)}
                    className="p-2 border rounded cursor-grab hover:bg-accent/50 active:cursor-grabbing"
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
            {cartItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                className="h-6 w-6 p-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
          {cartItems.length > 0 && (() => {
            const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
            const taxableSubtotal = customerIsTaxable 
              ? cartItems.filter(item => item.isTaxable !== false).reduce((sum, item) => sum + item.total, 0)
              : 0;
            const taxAmount = (taxableSubtotal * taxRate) / 100;
            const total = subtotal + taxAmount;
            
            return (
              <div className="mt-2 pt-2 border-t space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span><FinancialGuard kind="revenue">{formatCurrency(subtotal)}</FinancialGuard></span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tax:</span>
                  <span><FinancialGuard kind="revenue">{formatCurrency(taxAmount)}</FinancialGuard></span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-1">
                  <span>Total:</span>
                  <span><FinancialGuard kind="revenue">{formatCurrency(total)}</FinancialGuard></span>
                </div>
                <div className="text-xs text-muted-foreground text-right mt-0.5">
                  Plus shipping
                </div>
                {discountRate > 0 && (
                  <div className="text-xs text-muted-foreground text-right">
                    {(discountRate * 100).toFixed(0)}% distributor discount applied
                  </div>
                )}
              </div>
            );
          })()}
        </CardHeader>
        <CardContent 
          className="flex-1 p-3 pt-0 overflow-y-auto"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFromCart(item.id)}
                      className="h-4 w-4 p-0 ml-2"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="h-6 w-6 p-0"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                        className="w-12 h-6 text-center text-xs"
                        min="1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="h-6 w-6 p-0"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      {item.type === 'labor' && (
                        <Badge variant="outline" className="text-xs ml-1">
                          {item.unit}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-medium"><FinancialGuard kind="revenue">{formatCurrency(item.total)}</FinancialGuard></div>
                  </div>
                </div>
              ))}
              
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quantity Input Modal */}
      {showQuantityInput && draggedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-80">
            <CardHeader>
              <CardTitle className="text-sm">Add to Estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="font-medium text-sm mb-1">{draggedItem.name}</div>
                <div className="text-xs text-muted-foreground">{draggedItem.sku}</div>
              </div>
              
              <div>
                <label className="text-xs font-medium">
                  {draggedItem.type === 'labor' ? 'Minutes' : 'Quantity'}
                </label>
                <Input
                  type="number"
                  value={tempQuantity}
                  onChange={(e) => setTempQuantity(e.target.value)}
                  className="mt-1"
                  min="1"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => addToCart(draggedItem, parseInt(tempQuantity) || 1)}
                  className="flex-1"
                  disabled={!tempQuantity || parseInt(tempQuantity) <= 0}
                >
                  Add
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowQuantityInput(null);
                    setDraggedItem(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};