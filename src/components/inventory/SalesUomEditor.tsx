import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SALES_LOT_OPTIONS } from "@/lib/uom-constants";

export interface SalesUom {
  id?: string;
  inventory_item_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  is_default: boolean;
  sort_order: number;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface SalesUomEditorProps {
  inventoryItemId: string | null;
  uoms: SalesUom[];
  onChange: (uoms: SalesUom[]) => void;
  stockingUom?: string;
}

export const SalesUomEditor = ({ 
  inventoryItemId, 
  uoms, 
  onChange,
  stockingUom = 'each'
}: SalesUomEditorProps) => {
  const { toast } = useToast();

  const addUom = () => {
    const newUom: SalesUom = {
      description: '1pc Lot',
      quantity: 1,
      unit_price: 0,
      is_default: uoms.filter(u => !u.isDeleted).length === 0,
      sort_order: uoms.length,
      isNew: true,
    };
    onChange([...uoms, newUom]);
  };

  const handleLotChange = (index: number, lotValue: string) => {
    const numValue = parseInt(lotValue);
    const lotOption = SALES_LOT_OPTIONS.find(o => o.value === numValue);
    if (lotOption) {
      const updated = [...uoms];
      updated[index] = { 
        ...updated[index], 
        description: lotOption.label,
        quantity: lotOption.value 
      };
      onChange(updated);
    }
  };

  const updateUom = (index: number, field: keyof SalesUom, value: any) => {
    const updated = [...uoms];
    updated[index] = { ...updated[index], [field]: value };
    
    // If setting this as default, unset others
    if (field === 'is_default' && value === true) {
      updated.forEach((u, i) => {
        if (i !== index) u.is_default = false;
      });
    }
    
    onChange(updated);
  };

  const removeUom = (index: number) => {
    const updated = [...uoms];
    if (updated[index].id) {
      // Mark existing for deletion
      updated[index] = { ...updated[index], isDeleted: true };
    } else {
      // Remove new ones directly
      updated.splice(index, 1);
    }
    onChange(updated);
  };

  const activeUoms = uoms.filter(u => !u.isDeleted);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h5 className="font-medium">Sales Units of Measure</h5>
          <p className="text-xs text-muted-foreground">
            Define different ways to sell this item (e.g., Each, Bag of 20, Box of 100)
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addUom}>
          <Plus className="h-4 w-4 mr-1" />
          Add Sales UOM
        </Button>
      </div>

      {activeUoms.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
          <p>No sales UOMs configured.</p>
          <p className="text-xs mt-1">Add a sales UOM to define how this item can be sold.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium w-8"></th>
                <th className="text-left p-2 font-medium">Lot Description</th>
                <th className="text-left p-2 font-medium w-24">Qty/Pkg</th>
                <th className="text-left p-2 font-medium w-28">Price/Pkg</th>
                <th className="text-left p-2 font-medium w-24">Price/Each</th>
                <th className="text-center p-2 font-medium w-20">Default</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {uoms.map((uom, index) => {
                if (uom.isDeleted) return null;
                const pricePerEach = uom.quantity > 0 ? (uom.unit_price / uom.quantity).toFixed(4) : '0.00';
                
                return (
                  <tr key={uom.id || `new-${index}`} className="border-t">
                    <td className="p-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                    </td>
                    <td className="p-2">
                      <Select
                        value={uom.quantity.toString()}
                        onValueChange={(value) => handleLotChange(index, value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select lot size" />
                        </SelectTrigger>
                        <SelectContent>
                          {SALES_LOT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value.toString()}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={uom.quantity}
                        disabled
                        className="h-8 bg-muted"
                      />
                    </td>
                    <td className="p-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={uom.unit_price}
                          onChange={(e) => updateUom(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="h-8 pl-6"
                        />
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">
                      ${pricePerEach}
                    </td>
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={uom.is_default}
                        onCheckedChange={(checked) => updateUom(index, 'is_default', checked === true)}
                      />
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUom(index)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeUoms.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <strong>Qty per Pkg:</strong> Number of {stockingUom}s in this sales package. 
          <strong className="ml-2">Price/Pkg:</strong> What the customer pays for this package.
        </p>
      )}
    </div>
  );
};

// Helper function to save UOMs to database
export const saveSalesUoms = async (
  inventoryItemId: string,
  uoms: SalesUom[]
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Delete removed UOMs
    const toDelete = uoms.filter(u => u.isDeleted && u.id);
    for (const uom of toDelete) {
      const { error } = await supabase
        .from('inventory_sales_uoms')
        .delete()
        .eq('id', uom.id!);
      if (error) throw error;
    }

    // Update existing UOMs
    const toUpdate = uoms.filter(u => !u.isDeleted && !u.isNew && u.id);
    for (const uom of toUpdate) {
      const { error } = await supabase
        .from('inventory_sales_uoms')
        .update({
          description: uom.description || null,
          quantity: uom.quantity,
          unit_price: uom.unit_price,
          is_default: uom.is_default,
          sort_order: uom.sort_order,
        })
        .eq('id', uom.id!);
      if (error) throw error;
    }

    // Insert new UOMs
    const toInsert = uoms.filter(u => !u.isDeleted && u.isNew);
    if (toInsert.length > 0) {
      const { error } = await supabase
        .from('inventory_sales_uoms')
        .insert(toInsert.map(u => ({
          inventory_item_id: inventoryItemId,
          description: u.description || null,
          quantity: u.quantity,
          unit_price: u.unit_price,
          is_default: u.is_default,
          sort_order: u.sort_order,
        })));
      if (error) throw error;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving sales UOMs:', error);
    return { success: false, error: error.message };
  }
};

// Helper function to load UOMs from database
export const loadSalesUoms = async (
  inventoryItemId: string
): Promise<SalesUom[]> => {
  const { data, error } = await supabase
    .from('inventory_sales_uoms')
    .select('*')
    .eq('inventory_item_id', inventoryItemId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error loading sales UOMs:', error);
    return [];
  }

  return data.map(row => ({
    id: row.id,
    inventory_item_id: row.inventory_item_id,
    description: row.description || '',
    quantity: row.quantity,
    unit_price: row.unit_price,
    is_default: row.is_default,
    sort_order: row.sort_order,
  }));
};
