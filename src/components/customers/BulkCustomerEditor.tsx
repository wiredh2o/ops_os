import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Save, X, GripVertical } from 'lucide-react';

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
}

interface Customer {
  id: string;
  name: string;
  owners_name?: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  is_distributor: boolean;
  is_taxable?: boolean;
  billing_address?: string;
  shipping_addresses: ShippingAddress[];
  preferred_shipping_carrier?: string;
  customer_number?: number;
  start_date?: string;
  price_level_id?: string;
}

interface PriceLevel {
  id: string;
  name: string;
  discount_percentage: number;
}

interface CellPosition {
  row: number;
  col: number;
}

interface BulkCustomerEditorProps {
  customers: Customer[];
  onClose: () => void;
  onSaved: () => void;
}

const EDITABLE_COLUMNS = [
  { key: 'customer_number', label: 'Cust #', type: 'readonly', width: '80px' },
  { key: 'name', label: 'Name', type: 'text', width: '180px' },
  { key: 'owners_name', label: 'Owner', type: 'text', width: '150px' },
  { key: 'email', label: 'Email', type: 'text', width: '180px' },
  { key: 'phone', label: 'Phone', type: 'text', width: '120px' },
  { key: 'is_active', label: 'Active', type: 'boolean', width: '70px' },
  { key: 'is_distributor', label: 'Distributor', type: 'boolean', width: '90px' },
  { key: 'is_taxable', label: 'Taxable', type: 'boolean', width: '80px' },
  { key: 'billing_address', label: 'Billing Address', type: 'text', width: '200px' },
  { key: 'preferred_shipping_carrier', label: 'Carrier', type: 'select', width: '100px', options: ['', 'FedEx', 'UPS', 'USPS', 'Pick-Up'] },
  { key: 'price_level_id', label: 'Price Level', type: 'price_level', width: '140px' },
  { key: 'start_date', label: 'Start Date', type: 'date', width: '120px' },
] as const;

type ColumnKey = typeof EDITABLE_COLUMNS[number]['key'];

export function BulkCustomerEditor({ customers, onClose, onSaved }: BulkCustomerEditorProps) {
  const { toast } = useToast();
  const [editedData, setEditedData] = useState<Record<string, Record<string, any>>>({});
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectionStart, setSelectionStart] = useState<CellPosition | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [priceLevels, setPriceLevels] = useState<PriceLevel[]>([]);
  const [saving, setSaving] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  
  // Column resizing state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => 
    EDITABLE_COLUMNS.reduce((acc, col) => {
      acc[col.key] = parseInt(col.width);
      return acc;
    }, {} as Record<string, number>)
  );
  const [resizing, setResizing] = useState<{ columnKey: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    fetchPriceLevels();
  }, []);

  const fetchPriceLevels = async () => {
    const { data, error } = await supabase
      .from('price_levels')
      .select('id, name, discount_percentage')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setPriceLevels(data);
    }
  };

  const getCellKey = (rowIndex: number, colIndex: number) => `${rowIndex}-${colIndex}`;

  const getCellValue = (customer: Customer, columnKey: ColumnKey): any => {
    const edited = editedData[customer.id]?.[columnKey];
    if (edited !== undefined) return edited;
    return (customer as any)[columnKey];
  };

  const setCellValue = (customerId: string, columnKey: ColumnKey, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [customerId]: {
        ...prev[customerId],
        [columnKey]: value,
      },
    }));
  };

  const isCellModified = (customerId: string, columnKey: ColumnKey): boolean => {
    const edited = editedData[customerId]?.[columnKey];
    if (edited === undefined) return false;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return false;
    return edited !== (customer as any)[columnKey];
  };

  const getModifiedCount = () => {
    let count = 0;
    Object.entries(editedData).forEach(([customerId, changes]) => {
      const customer = customers.find(c => c.id === customerId);
      if (!customer) return;
      Object.entries(changes).forEach(([key, value]) => {
        if (value !== (customer as any)[key]) count++;
      });
    });
    return count;
  };

  const handleCellMouseDown = (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (EDITABLE_COLUMNS[colIndex].type === 'readonly') return;
    
    if (e.shiftKey && selectionStart) {
      // Extend selection
      selectRange(selectionStart, { row: rowIndex, col: colIndex });
    } else {
      // Start new selection
      setSelectionStart({ row: rowIndex, col: colIndex });
      setSelectedCells(new Set([getCellKey(rowIndex, colIndex)]));
      setIsSelecting(true);
    }
  };

  const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
    if (!isSelecting || !selectionStart) return;
    selectRange(selectionStart, { row: rowIndex, col: colIndex });
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const selectRange = (start: CellPosition, end: CellPosition) => {
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);

    const newSelection = new Set<string>();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (EDITABLE_COLUMNS[c].type !== 'readonly') {
          newSelection.add(getCellKey(r, c));
        }
      }
    }
    setSelectedCells(newSelection);
  };

  const parseBooleanValue = (value: string): boolean => {
    const lower = value.toLowerCase().trim();
    return ['true', 'yes', '1', 'y', 'on'].includes(lower);
  };

  const parseValueForColumn = (value: string, column: typeof EDITABLE_COLUMNS[number]): any => {
    const trimmed = value.trim();
    
    if (column.type === 'boolean') {
      return parseBooleanValue(trimmed);
    }
    
    if (column.type === 'price_level') {
      // Match by name (case-insensitive) and convert to UUID
      if (!trimmed || trimmed.toLowerCase() === 'none') return null;
      const matchedLevel = priceLevels.find(
        pl => pl.name.toLowerCase() === trimmed.toLowerCase()
      );
      return matchedLevel ? matchedLevel.id : null;
    }
    
    if (column.type === 'select' && column.options) {
      // Case-insensitive matching for carrier options
      if (!trimmed || trimmed.toLowerCase() === 'none') return null;
      const matchedOption = column.options.find(
        opt => opt.toLowerCase() === trimmed.toLowerCase()
      );
      return matchedOption || null;
    }
    
    return trimmed;
  };

  const getDisplayValueForCopy = (value: any, column: typeof EDITABLE_COLUMNS[number]): string => {
    if (column.type === 'price_level' && value) {
      const pl = priceLevels.find(p => p.id === value);
      return pl?.name || '';
    }
    if (column.type === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (column.type === 'select') {
      return value || '';
    }
    return value ?? '';
  };

  const handleCopy = useCallback((e: ClipboardEvent) => {
    if (selectedCells.size === 0) return;
    
    // Don't intercept if user is focused on an input
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }
    
    e.preventDefault();
    
    const selectedPositions = Array.from(selectedCells)
      .map(key => {
        const [row, col] = key.split('-').map(Number);
        return { row, col };
      })
      .sort((a, b) => a.row - b.row || a.col - b.col);
    
    const minRow = Math.min(...selectedPositions.map(p => p.row));
    const maxRow = Math.max(...selectedPositions.map(p => p.row));
    const minCol = Math.min(...selectedPositions.map(p => p.col));
    const maxCol = Math.max(...selectedPositions.map(p => p.col));
    
    const rows: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowData: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const customer = customers[r];
        const column = EDITABLE_COLUMNS[c];
        const value = getCellValue(customer, column.key);
        rowData.push(getDisplayValueForCopy(value, column));
      }
      rows.push(rowData);
    }
    
    const clipboardText = rows.map(row => row.join('\t')).join('\n');
    e.clipboardData?.setData('text/plain', clipboardText);
  }, [selectedCells, customers, priceLevels, editedData]);

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (selectedCells.size === 0) return;
    
    e.preventDefault();
    const pastedText = e.clipboardData?.getData('text') || '';
    const rows = pastedText.split('\n').map(row => row.split('\t'));
    
    // Get the bounds of selection
    const selectedPositions = Array.from(selectedCells).map(key => {
      const [row, col] = key.split('-').map(Number);
      return { row, col };
    });
    
    const minRow = Math.min(...selectedPositions.map(p => p.row));
    const minCol = Math.min(...selectedPositions.map(p => p.col));
    
    // If single value pasted, apply to all selected cells
    if (rows.length === 1 && rows[0].length === 1) {
      const value = rows[0][0].trim();
      
      selectedPositions.forEach(({ row, col }) => {
        const customer = customers[row];
        const column = EDITABLE_COLUMNS[col];
        if (!customer || column.type === 'readonly') return;
        
        const parsedValue = parseValueForColumn(value, column);
        setCellValue(customer.id, column.key, parsedValue);
      });
    } else {
      // Map pasted data to cells
      rows.forEach((rowData, rowOffset) => {
        rowData.forEach((cellValue, colOffset) => {
          const targetRow = minRow + rowOffset;
          const targetCol = minCol + colOffset;
          
          if (targetRow >= customers.length) return;
          if (targetCol >= EDITABLE_COLUMNS.length) return;
          
          const customer = customers[targetRow];
          const column = EDITABLE_COLUMNS[targetCol];
          if (column.type === 'readonly') return;
          
          const parsedValue = parseValueForColumn(cellValue, column);
          setCellValue(customer.id, column.key, parsedValue);
        });
      });
    }
  }, [selectedCells, customers, priceLevels]);

  // Column resize handlers
  const handleResizeStart = (columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      columnKey,
      startX: e.clientX,
      startWidth: columnWidths[columnKey],
    });
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizing) return;
    const delta = e.clientX - resizing.startX;
    const newWidth = Math.max(50, resizing.startWidth + delta);
    setColumnWidths(prev => ({
      ...prev,
      [resizing.columnKey]: newWidth,
    }));
  }, [resizing]);

  const handleResizeEnd = useCallback(() => {
    setResizing(null);
  }, []);

  useEffect(() => {
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleCopy, handlePaste]);

  useEffect(() => {
    if (resizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizing, handleResizeMove, handleResizeEnd]);

  const handleSave = async () => {
    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const updates = Object.entries(editedData)
        .filter(([customerId, changes]) => {
          const customer = customers.find(c => c.id === customerId);
          if (!customer) return false;
          return Object.entries(changes).some(([key, value]) => value !== (customer as any)[key]);
        })
        .map(([customerId, changes]) => ({
          id: customerId,
          ...changes,
        }));

      for (const update of updates) {
        const { id, ...fields } = update;
        const { error } = await supabase
          .from('companies')
          .update(fields)
          .eq('id', id);
        
        if (error) {
          console.error('Error updating customer:', error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `Updated ${successCount} customer${successCount > 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        });
        onSaved();
      } else if (errorCount > 0) {
        toast({
          title: 'Error',
          description: `Failed to update ${errorCount} customer${errorCount > 1 ? 's' : ''}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: 'Error',
        description: 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getColumnWidth = (columnKey: string) => columnWidths[columnKey] || 100;

  const renderCell = (customer: Customer, rowIndex: number, column: typeof EDITABLE_COLUMNS[number], colIndex: number) => {
    const value = getCellValue(customer, column.key);
    const cellKey = getCellKey(rowIndex, colIndex);
    const isSelected = selectedCells.has(cellKey);
    const isModified = isCellModified(customer.id, column.key);
    const width = getColumnWidth(column.key);

    const baseClasses = `
      px-2 py-1 border-r border-b border-border min-h-[36px] flex items-center
      ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
      ${isModified ? 'bg-amber-100 dark:bg-amber-900/30' : ''}
      ${column.type === 'readonly' ? 'bg-muted/50' : 'cursor-cell'}
    `;

    if (column.type === 'readonly') {
      return (
        <div className={baseClasses} style={{ width, minWidth: 50 }}>
          <span className="font-mono text-sm">{value}</span>
        </div>
      );
    }

    if (column.type === 'boolean') {
      return (
        <div
          className={baseClasses}
          style={{ width, minWidth: 50 }}
          onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
          onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
        >
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => setCellValue(customer.id, column.key, !!checked)}
          />
        </div>
      );
    }

    if (column.type === 'select') {
      return (
        <div
          className={baseClasses}
          style={{ width, minWidth: 50 }}
          onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
          onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
        >
          <Select
            value={value || 'none'}
            onValueChange={(v) => setCellValue(customer.id, column.key, v === 'none' ? null : v)}
          >
            <SelectTrigger className="h-7 border-0 shadow-none focus:ring-0 p-0">
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {column.options?.filter(opt => opt !== '').map(opt => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (column.type === 'price_level') {
      return (
        <div
          className={baseClasses}
          style={{ width, minWidth: 50 }}
          onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
          onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
        >
          <Select
            value={value || ''}
            onValueChange={(v) => setCellValue(customer.id, column.key, v === 'none' ? null : v)}
          >
            <SelectTrigger className="h-7 border-0 shadow-none focus:ring-0 p-0">
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {priceLevels.map(pl => (
                <SelectItem key={pl.id} value={pl.id}>
                  {pl.name} ({pl.discount_percentage}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (column.type === 'date') {
      return (
        <div
          className={baseClasses}
          style={{ width, minWidth: 50 }}
          onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
          onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
        >
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => setCellValue(customer.id, column.key, e.target.value)}
            className="h-7 border-0 shadow-none focus-visible:ring-0 p-0"
          />
        </div>
      );
    }

    // Text input
    return (
      <div
        className={baseClasses}
        style={{ width, minWidth: 50 }}
        onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
        onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
      >
        <Input
          value={value || ''}
          onChange={(e) => setCellValue(customer.id, column.key, e.target.value)}
          className="h-7 border-0 shadow-none focus-visible:ring-0 p-0"
        />
      </div>
    );
  };

  const modifiedCount = getModifiedCount();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Bulk Edit Customers
            <Badge variant="secondary">{customers.length} customers</Badge>
            {modifiedCount > 0 && (
              <Badge variant="default" className="bg-amber-500">
                {modifiedCount} change{modifiedCount > 1 ? 's' : ''} pending
              </Badge>
            )}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Click cells to select, Shift+click for range. Copy (Ctrl+C) and Paste (Ctrl+V) to transfer values.
          </p>
        </DialogHeader>

        <div className={`flex-1 overflow-hidden border rounded-md ${resizing ? 'cursor-col-resize select-none' : ''}`} ref={tableRef}>
          <ScrollArea className="h-full">
            <div className="min-w-max">
              {/* Header */}
              <div className="flex sticky top-0 bg-muted z-10 border-b-2 border-border">
                {EDITABLE_COLUMNS.map((col) => (
                  <div
                    key={col.key}
                    className="relative px-2 py-2 font-medium text-sm border-r border-border group"
                    style={{ width: getColumnWidth(col.key), minWidth: 50 }}
                  >
                    <span className="truncate block">{col.label}</span>
                    {/* Resize handle */}
                    <div
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-primary/20 transition-opacity"
                      onMouseDown={(e) => handleResizeStart(col.key, e)}
                    >
                      <div className="w-0.5 h-4 bg-border rounded" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Body */}
              {customers.map((customer, rowIndex) => (
                <div key={customer.id} className="flex">
                  {EDITABLE_COLUMNS.map((col, colIndex) => (
                    <React.Fragment key={col.key}>
                      {renderCell(customer, rowIndex, col, colIndex)}
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || modifiedCount === 0}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : `Save ${modifiedCount} Change${modifiedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
