import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { getCurrentTaxRate } from "@/lib/tax-utils";
import { Package, ShoppingCart, Search, Minus, Trash2, Wrench, Box, Plus, Copy } from "lucide-react";

interface RepairItem {
  id: string;
  name: string;
  sku?: string;
  price: number;
  type: 'inventory' | 'labor' | 'assembly';
  unit?: string;
  eligible_for_distributor_discount?: boolean;
  isTaxable?: boolean;
}

interface CartItem extends RepairItem {
  quantity: number;
  total: number;
}

interface ActuallyUsedPanelProps {
  repairItemId: string;
  isDistributor: boolean;
  discountRate: number;
  customerIsTaxable?: boolean;
  readOnly?: boolean;
}

export const ActuallyUsedPanel: React.FC<ActuallyUsedPanelProps> = ({
  repairItemId,
  isDistributor,
  discountRate,
  customerIsTaxable = true,
  readOnly = false
}) => {
  const [availableItems, setAvailableItems] = useState<RepairItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedItem, setDraggedItem] = useState<RepairItem | null>(null);
  const [showQuantityInput, setShowQuantityInput] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState(0);
  const { toast } = useToast();

  // Fetch tax rate on mount
  useEffect(() => {
    getCurrentTaxRate().then(setTaxRate);
  }, []);

  // Load available items and existing actuals
  useEffect(() => {
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

        // Create combined available items
        const items: RepairItem[] = [
          ...(inventory || []).map(item => ({
            id: item.id,
            name: item.sales_description || item.sku,
            sku: item.sku,
            price: Number(item.unit_price),
            type: 'inventory' as const,
            unit: 'each',
            eligible_for_distributor_discount: item.eligible_for_distributor_discount,
            isTaxable: true
          })),
          ...(labor || []).map(item => ({
            id: item.id,
            name: item.name,
            sku: item.item_number,
            price: Number(item.hourly_rate),
            type: 'labor' as const,
            unit: 'hour',
            eligible_for_distributor_discount: item.eligible_for_distributor_discount,
            isTaxable: false // Labor is typically non-taxable
          })),
          ...(assemblies || []).map(item => ({
            id: item.id,
            name: item.sales_description || item.sku,
            sku: item.sku,
            price: Number(item.selling_price),
            type: 'assembly' as const,
            unit: 'each',
            eligible_for_distributor_discount: item.eligible_for_distributor_discount,
            isTaxable: true
          }))
        ];
        setAvailableItems(items);

        // Load existing actuals
        const { data: existingActuals } = await supabase
          .from('repair_item_actuals')
          .select(`
            id, quantity, description, unit_rate, total_amount,
            inventory_item_id, labor_item_id, assembly_id
          `)
          .eq('repair_item_id', repairItemId);

        if (existingActuals && existingActuals.length > 0) {
          // Convert actuals to cart items
          const loadedCartItems: CartItem[] = existingActuals.map(actual => {
            let matchedItem: RepairItem | undefined;
            
            if (actual.inventory_item_id) {
              matchedItem = items.find(i => i.id === actual.inventory_item_id && i.type === 'inventory');
            } else if (actual.labor_item_id) {
              matchedItem = items.find(i => i.id === actual.labor_item_id && i.type === 'labor');
            } else if (actual.assembly_id) {
              matchedItem = items.find(i => i.id === actual.assembly_id && i.type === 'assembly');
            }

            if (matchedItem) {
              return {
                ...matchedItem,
                quantity: actual.quantity,
                total: actual.total_amount
              };
            }
            return null;
          }).filter((item): item is CartItem => item !== null);

          setCartItems(loadedCartItems);
        } else {
          // If no actuals exist, try to copy from estimates
          const { data: estimates } = await supabase
            .from('repair_item_estimates')
            .select(`
              id, quantity, description, unit_rate, total_amount,
              inventory_item_id, labor_item_id, assembly_id
            `)
            .eq('repair_item_id', repairItemId);

          if (estimates && estimates.length > 0) {
            const copiedCartItems: CartItem[] = estimates.map(est => {
              let matchedItem: RepairItem | undefined;
              
              if (est.inventory_item_id) {
                matchedItem = items.find(i => i.id === est.inventory_item_id && i.type === 'inventory');
              } else if (est.labor_item_id) {
                matchedItem = items.find(i => i.id === est.labor_item_id && i.type === 'labor');
              } else if (est.assembly_id) {
                matchedItem = items.find(i => i.id === est.assembly_id && i.type === 'assembly');
              }

              if (matchedItem) {
                const discountedPrice = calculateItemPrice(matchedItem);
                return {
                  ...matchedItem,
                  price: discountedPrice,
                  quantity: est.quantity,
                  total: discountedPrice * est.quantity
                };
              }
              return null;
            }).filter((item): item is CartItem => item !== null);

            if (copiedCartItems.length > 0) {
              setCartItems(copiedCartItems);
              toast({
                title: "Estimates Copied",
                description: "Estimate items have been copied to Actually Used. You can modify as needed.",
              });
            }
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: "Error",
          description: "Failed to load data",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [repairItemId, toast]);

  // Auto-save actuals when cart changes
  const saveActuals = useCallback(async () => {
    try {
      // Delete existing actuals
      await supabase
        .from('repair_item_actuals')
        .delete()
        .eq('repair_item_id', repairItemId);

      if (cartItems.length === 0) return;

      // Insert new actuals
      const actualsData = cartItems.map(item => ({
        repair_item_id: repairItemId,
        inventory_item_id: item.type === 'inventory' ? item.id : null,
        labor_item_id: item.type === 'labor' ? item.id : null,
        assembly_id: item.type === 'assembly' ? item.id : null,
        quantity: item.quantity,
        description: item.name,
        unit_rate: item.price,
        total_amount: item.total,
        is_taxable: item.type !== 'labor' // Labor typically not taxable
      }));

      await supabase
        .from('repair_item_actuals')
        .insert(actualsData);

    } catch (error) {
      console.error('Error saving actuals:', error);
    }
  }, [cartItems, repairItemId]);

  // Debounced save - skip in read-only mode
  useEffect(() => {
    if (readOnly) return; // Don't save in read-only mode
    if (!loading && cartItems.length >= 0) {
      const timeoutId = setTimeout(saveActuals, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [cartItems, saveActuals, loading, readOnly]);

  const calculateItemPrice = (item: RepairItem) => {
    // No discount on labor items
    if (item.type === 'labor') return item.price;
    const discount = item.eligible_for_distributor_discount && isDistributor ? discountRate : 0;
    return item.price * (1 - discount);
  };

  const getFilteredItems = (type?: string) => {
    return availableItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = !type || item.type === type;
      return matchesSearch && matchesType;
    });
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

  const copyFromEstimates = async () => {
    try {
      const { data: estimates } = await supabase
        .from('repair_item_estimates')
        .select(`
          id, quantity, description, unit_rate, total_amount,
          inventory_item_id, labor_item_id, assembly_id
        `)
        .eq('repair_item_id', repairItemId);

      if (!estimates || estimates.length === 0) {
        toast({
          title: "No Estimates",
          description: "No estimates found to copy",
          variant: "destructive"
        });
        return;
      }

      const copiedCartItems: CartItem[] = estimates.map(est => {
        let matchedItem: RepairItem | undefined;
        
        if (est.inventory_item_id) {
          matchedItem = availableItems.find(i => i.id === est.inventory_item_id && i.type === 'inventory');
        } else if (est.labor_item_id) {
          matchedItem = availableItems.find(i => i.id === est.labor_item_id && i.type === 'labor');
        } else if (est.assembly_id) {
          matchedItem = availableItems.find(i => i.id === est.assembly_id && i.type === 'assembly');
        }

        if (matchedItem) {
          const discountedPrice = calculateItemPrice(matchedItem);
          return {
            ...matchedItem,
            price: discountedPrice,
            quantity: est.quantity,
            total: discountedPrice * est.quantity
          };
        }
        return null;
      }).filter((item): item is CartItem => item !== null);

      setCartItems(copiedCartItems);
      toast({
        title: "Estimates Copied",
        description: `Copied ${copiedCartItems.length} item(s) from estimates`,
      });
    } catch (error) {
      console.error('Error copying estimates:', error);
      toast({
        title: "Error",
        description: "Failed to copy estimates",
        variant: "destructive"
      });
    }
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
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
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
                          per hour
                        </Badge>
                      )}
                    </div>
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Cart Panel */}
        <Card
          className="flex flex-col"
          onDrop={readOnly ? undefined : handleDrop}
          onDragOver={readOnly ? undefined : handleDragOver}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Actually Used ({cartItems.length})
              </CardTitle>
              {!readOnly && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={copyFromEstimates}
                  className="h-7 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy from Estimates
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
                </div>
              );
            })()}
          </CardHeader>
          <CardContent className="flex-1 p-3 pt-0 overflow-y-auto">
            {cartItems.length === 0 ? (
              <div className="h-full flex items-center justify-center border-2 border-dashed rounded-lg">
                <div className="text-center text-muted-foreground text-sm">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Drag items here</p>
                  <p className="text-xs">or copy from estimates</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map((item) => (
                  <div key={item.id} className="p-2 border rounded bg-accent/20">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(item.type)}
                        <span className="text-xs font-medium truncate max-w-[120px]">
                          {item.name}
                        </span>
                      </div>
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromCart(item.id)}
                          className="h-5 w-5 p-0"
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
          
        </Card>
      </div>

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
                  Add
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
    </>
  );
};
