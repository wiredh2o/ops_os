import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ExportOptions {
  includeCosts: boolean;
  includeTTM: boolean;
  includePackedDimensions: boolean;
  includeMedia: boolean;
  includeBusinessRules: boolean;
  includeQuantities: boolean;
  includeVisibility: boolean;
}

export function InventoryCsvExporter({ open, onClose }: Props) {
  const { toast } = useToast();
  const [options, setOptions] = useState<ExportOptions>({
    includeCosts: true,
    includeTTM: true,
    includePackedDimensions: true,
    includeMedia: true,
    includeBusinessRules: true,
    includeQuantities: true,
    includeVisibility: true,
  });
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      
      const { data, error } = await supabase.functions.invoke("export-inventory-csv", {
        body: { options },
      });
      
      if (error) throw error;
      
      // Create download link
      const blob = new Blob([data.csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export complete",
        description: `Exported ${data.itemCount} inventory items to CSV`,
      });
      
      onClose();
    } catch (e: any) {
      console.error(e);
      toast({ 
        title: "Export failed", 
        description: e?.message || "Unexpected error", 
        variant: "destructive" 
      });
    } finally {
      setExporting(false);
    }
  };

  const updateOption = (key: keyof ExportOptions, value: boolean) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Inventory CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select which field categories to include in the export. All core fields (SKU, descriptions, prices) are always included.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="quantities"
                checked={options.includeQuantities}
                onCheckedChange={(checked) => updateOption("includeQuantities", !!checked)}
              />
              <Label htmlFor="quantities">Physical Inventory Quantities</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="costs"
                checked={options.includeCosts}
                onCheckedChange={(checked) => updateOption("includeCosts", !!checked)}
              />
              <Label htmlFor="costs">Cost Information (unit_cost, cost basis)</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="ttm"
                checked={options.includeTTM}
                onCheckedChange={(checked) => updateOption("includeTTM", !!checked)}
              />
              <Label htmlFor="ttm">TTM Consumption Data</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="packed"
                checked={options.includePackedDimensions}
                onCheckedChange={(checked) => updateOption("includePackedDimensions", !!checked)}
              />
              <Label htmlFor="packed">Packed Dimensions</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="business"
                checked={options.includeBusinessRules}
                onCheckedChange={(checked) => updateOption("includeBusinessRules", !!checked)}
              />
              <Label htmlFor="business">Business Rules (lead times, MOQ, reorder points)</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="media"
                checked={options.includeMedia}
                onCheckedChange={(checked) => updateOption("includeMedia", !!checked)}
              />
              <Label htmlFor="media">Media (images, videos)</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="visibility"
                checked={options.includeVisibility}
                onCheckedChange={(checked) => updateOption("includeVisibility", !!checked)}
              />
              <Label htmlFor="visibility">Visibility Settings (visible_for_sale)</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}