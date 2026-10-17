import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PURCHASE_UOM_OPTIONS } from "@/lib/uom-constants";

export interface AssemblyPurchaseUom {
  id?: string;
  assembly_id?: string;
  purchase_uom: string;
  quantity: number;
  unit_cost: number;
  supplier_name?: string;
  lead_time_days?: number;
  minimum_order_quantity?: number;
  is_default: boolean;
  sort_order: number;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface AssemblyPurchaseUomEditorProps {
  assemblyId: string | null;
  uoms: AssemblyPurchaseUom[];
  onChange: (uoms: AssemblyPurchaseUom[]) => void;
  disabled?: boolean;
}

export const AssemblyPurchaseUomEditor = ({ 
  assemblyId, 
  uoms, 
  onChange,
  disabled = false
}: AssemblyPurchaseUomEditorProps) => {

  const addUom = () => {
    if (disabled) return;
    const newUom: AssemblyPurchaseUom = {
      purchase_uom: 'each',
      quantity: 1,
      unit_cost: 0,
      is_default: uoms.filter(u => !u.isDeleted).length === 0,
      sort_order: uoms.length,
      isNew: true,
    };
    onChange([...uoms, newUom]);
  };

  const updateUom = (index: number, field: keyof AssemblyPurchaseUom, value: any) => {
    if (disabled) return;
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
    if (disabled) return;
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
          <h5 className="font-medium">Purchase Units of Measure</h5>
          <p className="text-xs text-muted-foreground">
            Define different ways to buy this assembly from external suppliers (e.g., Each, Box of 10, Case of 50)
          </p>
        </div>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={addUom}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Purchase UOM
        </Button>
      </div>

      {disabled && (
        <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground bg-muted/30">
          <p>Purchase pricing is disabled for Insourced assemblies.</p>
          <p className="text-xs mt-1">Enable "Outsourced" to configure external supplier pricing.</p>
        </div>
      )}

      {!disabled && activeUoms.length === 0 && (
        <div className="border border-dashed rounded-lg p-6 text-center text-muted-foreground">
          <p>No purchase UOMs configured.</p>
          <p className="text-xs mt-1">Add a purchase UOM to define how this assembly can be ordered from suppliers.</p>
        </div>
      )}

      {!disabled && activeUoms.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium w-8"></th>
                <th className="text-left p-2 font-medium w-28">Unit Type</th>
                <th className="text-left p-2 font-medium w-24">Qty/Pkg</th>
                <th className="text-left p-2 font-medium w-28">Cost/Pkg</th>
                <th className="text-left p-2 font-medium w-24">Cost/Each</th>
                <th className="text-center p-2 font-medium w-16">Default</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {uoms.map((uom, index) => {
                if (uom.isDeleted) return null;
                const costPerEach = uom.quantity > 0 ? (uom.unit_cost / uom.quantity).toFixed(4) : '0.00';
                
                return (
                  <tr key={uom.id || `new-${index}`} className="border-t">
                    <td className="p-2 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                    </td>
                    <td className="p-2">
                      <Select
                        value={uom.purchase_uom}
                        onValueChange={(value) => updateUom(index, 'purchase_uom', value)}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PURCHASE_UOM_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="1"
                        value={uom.quantity}
                        onChange={(e) => updateUom(index, 'quantity', parseInt(e.target.value) || 1)}
                        className="h-8"
                        disabled={disabled}
                      />
                    </td>
                    <td className="p-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={uom.unit_cost}
                          onChange={(e) => updateUom(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="h-8 pl-5"
                          disabled={disabled}
                        />
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">
                      ${costPerEach}
                    </td>
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={uom.is_default}
                        onCheckedChange={(checked) => updateUom(index, 'is_default', checked === true)}
                        disabled={disabled}
                      />
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUom(index)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        disabled={disabled}
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

      {!disabled && activeUoms.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <strong>Qty/Pkg:</strong> Number of assemblies per purchase package. 
          <strong className="ml-2">Cost/Pkg:</strong> Total cost for the package from supplier.
        </p>
      )}
    </div>
  );
};

// Helper function to save UOMs to database
export const saveAssemblyPurchaseUoms = async (
  assemblyId: string,
  uoms: AssemblyPurchaseUom[]
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Delete removed UOMs
    const toDelete = uoms.filter(u => u.isDeleted && u.id);
    for (const uom of toDelete) {
      const { error } = await supabase
        .from('assembly_purchase_uoms')
        .delete()
        .eq('id', uom.id!);
      if (error) throw error;
    }

    // Update existing UOMs
    const toUpdate = uoms.filter(u => !u.isDeleted && !u.isNew && u.id);
    for (const uom of toUpdate) {
      const { error } = await supabase
        .from('assembly_purchase_uoms')
        .update({
          purchase_uom: uom.purchase_uom,
          quantity: uom.quantity,
          unit_cost: uom.unit_cost,
          supplier_name: uom.supplier_name,
          lead_time_days: uom.lead_time_days,
          minimum_order_quantity: uom.minimum_order_quantity,
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
        .from('assembly_purchase_uoms')
        .insert(toInsert.map(u => ({
          assembly_id: assemblyId,
          purchase_uom: u.purchase_uom,
          quantity: u.quantity,
          unit_cost: u.unit_cost,
          supplier_name: u.supplier_name,
          lead_time_days: u.lead_time_days,
          minimum_order_quantity: u.minimum_order_quantity,
          is_default: u.is_default,
          sort_order: u.sort_order,
        })));
      if (error) throw error;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error saving assembly purchase UOMs:', error);
    return { success: false, error: error.message };
  }
};

// Helper function to load UOMs from database
export const loadAssemblyPurchaseUoms = async (
  assemblyId: string
): Promise<AssemblyPurchaseUom[]> => {
  const { data, error } = await supabase
    .from('assembly_purchase_uoms')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error loading assembly purchase UOMs:', error);
    return [];
  }

  return data.map(row => ({
    id: row.id,
    assembly_id: row.assembly_id,
    purchase_uom: row.purchase_uom,
    quantity: row.quantity,
    unit_cost: row.unit_cost,
    supplier_name: row.supplier_name,
    lead_time_days: row.lead_time_days,
    minimum_order_quantity: row.minimum_order_quantity,
    is_default: row.is_default,
    sort_order: row.sort_order,
  }));
};
