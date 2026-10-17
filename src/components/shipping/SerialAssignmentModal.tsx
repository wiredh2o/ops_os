import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Tag, Printer, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { formatAutoSerial, printSerialLabelsBatch, SerialLabelData } from '@/lib/serial-label-utils';

interface AutoSerialItem {
  id: string;
  sku: string;
  description: string;
  prefix: string;
  quantity: number;
  productionOrderItemId: string;
  assemblyId?: string;
  inventoryItemId?: string;
}

interface SerialAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  items: AutoSerialItem[];
  onComplete: (generatedSerials: { itemId: string; serials: string[] }[]) => void;
}

export function SerialAssignmentModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  items,
  onComplete,
}: SerialAssignmentModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [initials, setInitials] = useState('');
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [generatedSerials, setGeneratedSerials] = useState<Record<string, string[]>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [serialsGenerated, setSerialsGenerated] = useState(false);

  // Load default initials from user profile
  useEffect(() => {
    if (open && user?.id) {
      loadDefaultInitials();
    }
  }, [open, user?.id]);

  const loadDefaultInitials = async () => {
    if (!user?.id) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('default_initials')
      .eq('id', user.id)
      .single();
    
    if (data?.default_initials) {
      setInitials(data.default_initials);
    }
  };

  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleGenerateSerials = async () => {
    if (!initials.trim()) {
      toast({
        title: 'Initials Required',
        description: 'Please enter your initials to generate serial numbers',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const today = new Date();
      const newGeneratedSerials: Record<string, string[]> = {};
      const serialRecords: any[] = [];

      for (const item of items) {
        const serials: string[] = [];
        
        for (let i = 0; i < item.quantity; i++) {
          // Get next sequence from database
          const { data: seqData, error: seqError } = await supabase
            .rpc('get_next_serial_sequence', {
              p_prefix: item.prefix,
              p_date: today.toISOString().split('T')[0],
            });

          if (seqError) throw seqError;

          const sequence = seqData as number;
          const serialNumber = formatAutoSerial(item.prefix, today, sequence, initials.trim());
          serials.push(serialNumber);

          // Prepare record for order_item_serials
          serialRecords.push({
            production_order_item_id: item.productionOrderItemId,
            serial_number: serialNumber,
            serial_type: 'auto_date',
            assigned_by: user.id,
            initials: initials.trim().toUpperCase(),
          });
        }

        newGeneratedSerials[item.id] = serials;
      }

      // Save all serial records
      const { error: insertError } = await supabase
        .from('order_item_serials')
        .insert(serialRecords);

      if (insertError) throw insertError;

      // Save default initials if requested
      if (saveAsDefault) {
        await supabase
          .from('profiles')
          .update({ default_initials: initials.trim().toUpperCase() })
          .eq('id', user.id);
      }

      setGeneratedSerials(newGeneratedSerials);
      setSerialsGenerated(true);

      toast({
        title: 'Serials Generated',
        description: `${serialRecords.length} serial number(s) created`,
      });
    } catch (err: any) {
      console.error('Error generating serials:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate serial numbers',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintLabels = async () => {
    setIsPrinting(true);

    try {
      const labels: SerialLabelData[] = [];

      for (const item of items) {
        const serials = generatedSerials[item.id] || [];
        for (const serial of serials) {
          labels.push({
            serialNumber: serial,
            sku: item.sku,
            description: item.description,
          });
        }
      }

      printSerialLabelsBatch(labels);

      // Update label_printed_at for all serials
      const allSerials = Object.values(generatedSerials).flat();
      if (allSerials.length > 0) {
        await supabase
          .from('order_item_serials')
          .update({ label_printed_at: new Date().toISOString() })
          .in('serial_number', allSerials);
      }

      toast({
        title: 'Labels Sent to Printer',
        description: `${labels.length} label(s) queued for printing`,
      });
    } catch (err: any) {
      console.error('Error printing labels:', err);
      toast({
        title: 'Print Error',
        description: err.message || 'Failed to print labels',
        variant: 'destructive',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleContinue = () => {
    const result = items.map(item => ({
      itemId: item.id,
      serials: generatedSerials[item.id] || [],
    }));
    onComplete(result);
    onOpenChange(false);
  };

  // Preview of generated serials
  const getPreviewSerial = (item: AutoSerialItem, index: number): string => {
    if (generatedSerials[item.id]?.[index]) {
      return generatedSerials[item.id][index];
    }
    // Show preview based on current initials
    const previewInitials = initials.trim() || '??';
    const today = new Date();
    return formatAutoSerial(item.prefix, today, index + 1, previewInitials);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Assign Serial Numbers
          </DialogTitle>
          <DialogDescription>
            Generate and print serial labels for {totalUnits} item(s) in order {orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Initials Input */}
          {!serialsGenerated && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="initials">Tester Initials</Label>
                <Input
                  id="initials"
                  placeholder="e.g., DW"
                  value={initials}
                  onChange={(e) => setInitials(e.target.value.slice(0, 4))}
                  className="w-32 uppercase"
                  maxLength={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your initials will be included in each serial number
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="saveDefault"
                  checked={saveAsDefault}
                  onCheckedChange={(checked) => setSaveAsDefault(!!checked)}
                />
                <Label htmlFor="saveDefault" className="text-sm">
                  Save as my default initials
                </Label>
              </div>
            </div>
          )}

          {/* Items to serialize */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Items Requiring Serials</Label>
            {items.map(item => (
              <Card key={item.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{item.sku}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <Badge variant="secondary">{item.quantity} unit(s)</Badge>
                  </div>
                  
                  {/* Serial previews/results */}
                  <div className="space-y-1">
                    {Array.from({ length: Math.min(item.quantity, 3) }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {serialsGenerated ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <span className="text-muted-foreground">→</span>
                        )}
                        <code className={serialsGenerated ? 'font-medium' : 'text-muted-foreground'}>
                          {getPreviewSerial(item, i)}
                        </code>
                      </div>
                    ))}
                    {item.quantity > 3 && (
                      <p className="text-xs text-muted-foreground ml-5">
                        ...and {item.quantity - 3} more
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Success state */}
          {serialsGenerated && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-md text-sm">
              <CheckCircle className="h-4 w-4" />
              {totalUnits} serial number(s) generated successfully
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!serialsGenerated ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Skip
              </Button>
              <Button onClick={handleGenerateSerials} disabled={isGenerating || !initials.trim()}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Serials'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handlePrintLabels} disabled={isPrinting}>
                {isPrinting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Printing...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    Print Labels
                  </>
                )}
              </Button>
              <Button onClick={handleContinue}>
                Continue to Shipping
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
