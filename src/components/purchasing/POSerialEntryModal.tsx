import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Package, Plus, Trash2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface POItem {
  id: string;
  item_type: string;
  inventory_item_id?: string;
  assembly_id?: string;
  quantity: number;
  stocking_quantity?: number;
  inventory_item?: {
    id: string;
    sku: string;
    sales_description: string | null;
    serial_tracking_type: string | null;
  };
  assembly?: {
    id: string;
    sku: string;
    sales_description: string | null;
    serial_tracking_type: string | null;
  };
}

interface POSerialEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  items: POItem[];
  onSuccess: () => void;
}

interface SerialEntry {
  serialNumber: string;
  notes: string;
}

export function POSerialEntryModal({
  open,
  onOpenChange,
  purchaseOrderId,
  purchaseOrderNumber,
  items,
  onSuccess,
}: POSerialEntryModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Filter to only items that need serial tracking (manual type)
  const serialItems = items.filter(item => {
    const trackingType = item.inventory_item?.serial_tracking_type || item.assembly?.serial_tracking_type;
    return trackingType === 'manual';
  });
  
  // State for serial entries per item: { itemId: SerialEntry[] }
  const [serialEntries, setSerialEntries] = useState<Record<string, SerialEntry[]>>(() => {
    const initial: Record<string, SerialEntry[]> = {};
    serialItems.forEach(item => {
      const qty = item.stocking_quantity || item.quantity;
      // Initialize with empty entries for each unit
      initial[item.id] = Array.from({ length: qty }, () => ({ serialNumber: '', notes: '' }));
    });
    return initial;
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getItemDetails = (item: POItem) => {
    if (item.inventory_item) {
      return {
        sku: item.inventory_item.sku,
        description: item.inventory_item.sales_description,
        itemId: item.inventory_item.id,
        itemType: 'inventory_item' as const,
      };
    }
    if (item.assembly) {
      return {
        sku: item.assembly.sku,
        description: item.assembly.sales_description,
        itemId: item.assembly.id,
        itemType: 'assembly' as const,
      };
    }
    return null;
  };

  const updateSerialEntry = (itemId: string, index: number, field: keyof SerialEntry, value: string) => {
    setSerialEntries(prev => ({
      ...prev,
      [itemId]: prev[itemId].map((entry, i) => 
        i === index ? { ...entry, [field]: value } : entry
      ),
    }));
  };

  const addSerialEntry = (itemId: string) => {
    setSerialEntries(prev => ({
      ...prev,
      [itemId]: [...prev[itemId], { serialNumber: '', notes: '' }],
    }));
  };

  const removeSerialEntry = (itemId: string, index: number) => {
    setSerialEntries(prev => ({
      ...prev,
      [itemId]: prev[itemId].filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in',
        variant: 'destructive',
      });
      return;
    }

    // Validate all serials are entered
    const allEntries: { itemId: string; poItemId: string; itemType: 'inventory_item' | 'assembly'; entry: SerialEntry }[] = [];
    
    for (const item of serialItems) {
      const details = getItemDetails(item);
      if (!details) continue;
      
      const entries = serialEntries[item.id] || [];
      const filledEntries = entries.filter(e => e.serialNumber.trim());
      
      if (filledEntries.length === 0) {
        setError(`Please enter at least one serial number for ${details.sku}`);
        return;
      }
      
      // Check for duplicates within this item
      const serials = filledEntries.map(e => e.serialNumber.trim().toUpperCase());
      const uniqueSerials = new Set(serials);
      if (uniqueSerials.size !== serials.length) {
        setError(`Duplicate serial numbers found for ${details.sku}`);
        return;
      }
      
      filledEntries.forEach(entry => {
        allEntries.push({
          itemId: details.itemId,
          poItemId: item.id,
          itemType: details.itemType,
          entry,
        });
      });
    }

    setSubmitting(true);
    setError(null);

    try {
      // Insert into serialized_inventory
      const insertData = allEntries.map(({ itemId, itemType, entry }) => ({
        inventory_item_id: itemType === 'inventory_item' ? itemId : null,
        assembly_id: itemType === 'assembly' ? itemId : null,
        serial_number: entry.serialNumber.trim(),
        status: 'available',
        source_po_id: purchaseOrderId,
        notes: entry.notes || null,
        created_by: user.id,
      }));

      const { error: insertError } = await supabase
        .from('serialized_inventory')
        .insert(insertData);

      if (insertError) throw insertError;

      toast({
        title: 'Serials Recorded',
        description: `${allEntries.length} serial number(s) added to inventory`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving serials:', err);
      setError(err.message || 'Failed to save serial numbers');
    } finally {
      setSubmitting(false);
    }
  };

  if (serialItems.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Serial-Tracked Items</DialogTitle>
            <DialogDescription>
              This purchase order has no items requiring serial number entry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Enter Serial Numbers - {purchaseOrderNumber}
          </DialogTitle>
          <DialogDescription>
            Enter the serial numbers from the vendor invoice for each item received.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm bg-destructive/10 text-destructive rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {serialItems.map(item => {
            const details = getItemDetails(item);
            if (!details) return null;
            
            const entries = serialEntries[item.id] || [];
            const expectedQty = item.stocking_quantity || item.quantity;

            return (
              <Card key={item.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium">{details.sku}</p>
                      <p className="text-sm text-muted-foreground">{details.description}</p>
                    </div>
                    <Badge variant="outline">
                      {entries.filter(e => e.serialNumber.trim()).length} / {expectedQty} entered
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {entries.map((entry, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Input
                            placeholder={`Serial #${index + 1}`}
                            value={entry.serialNumber}
                            onChange={(e) => updateSerialEntry(item.id, index, 'serialNumber', e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            placeholder="Notes (optional)"
                            value={entry.notes}
                            onChange={(e) => updateSerialEntry(item.id, index, 'notes', e.target.value)}
                          />
                        </div>
                        {entries.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSerialEntry(item.id, index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => addSerialEntry(item.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Serial
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Serial Numbers'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
