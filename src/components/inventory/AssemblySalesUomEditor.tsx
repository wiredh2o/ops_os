import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SALES_LOT_OPTIONS } from '@/lib/uom-constants';

export interface AssemblySalesUom {
  id?: string;
  assembly_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  is_default: boolean;
  sort_order: number;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface AssemblySalesUomEditorProps {
  assemblyId?: string;
  uoms: AssemblySalesUom[];
  onUomsChange: (uoms: AssemblySalesUom[]) => void;
}

export const AssemblySalesUomEditor: React.FC<AssemblySalesUomEditorProps> = ({
  assemblyId,
  uoms,
  onUomsChange,
}) => {
  const addUom = () => {
    const newUom: AssemblySalesUom = {
      description: '',
      quantity: 1,
      unit_price: 0,
      is_default: uoms.filter(u => !u.isDeleted).length === 0,
      sort_order: uoms.length,
      isNew: true,
    };
    onUomsChange([...uoms, newUom]);
  };

  const handleLotChange = (index: number, lotValue: string) => {
    const lotOption = SALES_LOT_OPTIONS.find(opt => opt.value.toString() === lotValue);
    if (lotOption) {
      const updatedUoms = [...uoms];
      updatedUoms[index] = {
        ...updatedUoms[index],
        quantity: lotOption.value,
        description: lotOption.label,
      };
      onUomsChange(updatedUoms);
    }
  };

  const updateUom = (index: number, field: keyof AssemblySalesUom, value: any) => {
    const updatedUoms = [...uoms];
    updatedUoms[index] = { ...updatedUoms[index], [field]: value };
    
    // If setting this as default, unset others
    if (field === 'is_default' && value === true) {
      updatedUoms.forEach((uom, i) => {
        if (i !== index) {
          updatedUoms[i] = { ...updatedUoms[i], is_default: false };
        }
      });
    }
    
    onUomsChange(updatedUoms);
  };

  const removeUom = (index: number) => {
    const updatedUoms = [...uoms];
    if (updatedUoms[index].isNew) {
      updatedUoms.splice(index, 1);
    } else {
      updatedUoms[index] = { ...updatedUoms[index], isDeleted: true };
    }
    onUomsChange(updatedUoms);
  };

  const activeUoms = uoms.filter(u => !u.isDeleted);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Sales Pricing (UOM)</Label>
        <Button type="button" variant="outline" size="sm" onClick={addUom}>
          <Plus className="h-4 w-4 mr-1" />
          Add Price
        </Button>
      </div>

      {activeUoms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pricing configured. Add at least one price.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Lot Size</TableHead>
              <TableHead className="w-[140px]">Unit Price</TableHead>
              <TableHead className="w-[80px]">Default</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uoms.map((uom, index) => {
              if (uom.isDeleted) return null;
              
              const currentLotValue = SALES_LOT_OPTIONS.find(opt => opt.value === uom.quantity)?.value.toString() || '';
              
              return (
                <TableRow key={uom.id || `new-${index}`}>
                  <TableCell>
                    <Select
                      value={currentLotValue}
                      onValueChange={(value) => handleLotChange(index, value)}
                    >
                      <SelectTrigger>
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
                  </TableCell>
                  <TableCell>
                    <FinancialGuard kind="revenue"><Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={uom.unit_price}
                      onChange={(e) => updateUom(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    /></FinancialGuard>
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={uom.is_default}
                      onCheckedChange={(checked) => updateUom(index, 'is_default', checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeUom(index)}
                      disabled={activeUoms.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

// Helper function to save assembly sales UOMs
export const saveAssemblySalesUoms = async (assemblyId: string, uoms: AssemblySalesUom[]) => {
  // Delete marked UOMs
  const toDelete = uoms.filter(u => u.isDeleted && u.id);
  for (const uom of toDelete) {
    const { error } = await supabase
      .from('assembly_sales_uoms')
      .delete()
      .eq('id', uom.id!);
    if (error) throw error;
  }

  // Update existing UOMs
  const toUpdate = uoms.filter(u => !u.isNew && !u.isDeleted && u.id);
  for (const uom of toUpdate) {
    const { error } = await supabase
      .from('assembly_sales_uoms')
      .update({
        description: uom.description,
        quantity: uom.quantity,
        unit_price: uom.unit_price,
        is_default: uom.is_default,
        sort_order: uom.sort_order,
      })
      .eq('id', uom.id!);
    if (error) throw error;
  }

  // Insert new UOMs
  const toInsert = uoms.filter(u => u.isNew && !u.isDeleted);
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('assembly_sales_uoms')
      .insert(
        toInsert.map((uom, index) => ({
          assembly_id: assemblyId,
          description: uom.description,
          quantity: uom.quantity,
          unit_price: uom.unit_price,
          is_default: uom.is_default,
          sort_order: uom.sort_order,
        }))
      );
    if (error) throw error;
  }
};

// Helper function to load assembly sales UOMs
export const loadAssemblySalesUoms = async (assemblyId: string): Promise<AssemblySalesUom[]> => {
  const { data, error } = await supabase
    .from('assembly_sales_uoms')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order');

  if (error) throw error;
  return data || [];
};
