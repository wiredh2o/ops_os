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
  includePackedDimensions: boolean;
  includeTTMSeed: boolean;
  includeSubassemblies: boolean;
}

export function AssemblyCsvExporter({ open, onClose }: Props) {
  const { toast } = useToast();
  const [options, setOptions] = useState<ExportOptions>({
    includePackedDimensions: true,
    includeTTMSeed: true,
    includeSubassemblies: false,
  });
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      
      const { data, error } = await supabase.functions.invoke("export-assembly-csv", {
        body: { options },
      });
      
      if (error) throw error;
      
      // Convert base64 to blob and download
      const binaryString = atob(data.xlsxBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assemblies-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      
      toast({
        title: "Export complete",
        description: `Exported ${data.assemblyCount} assemblies with ${data.componentCount} component relationships`,
      });
      
      onClose();
    } catch (e: unknown) {
      console.error(e);
      toast({ 
        title: "Export failed", 
        description: (e as Error)?.message || "Unexpected error", 
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Assembly Data</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              Exports a single Excel file with two sheets: Assemblies and Components. 
              Only static and seed data is included — calculated values are excluded.
            </p>
          </div>
          
          <div className="space-y-4">
            <Label>Optional Fields</Label>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="packed"
                  checked={options.includePackedDimensions}
                  onCheckedChange={(checked) => updateOption("includePackedDimensions", !!checked)}
                />
                <Label htmlFor="packed" className="font-normal">Include Packed Dimensions</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="ttm"
                  checked={options.includeTTMSeed}
                  onCheckedChange={(checked) => updateOption("includeTTMSeed", !!checked)}
                />
                <Label htmlFor="ttm" className="font-normal">
                  Include Historical Consumption (Seed Data)
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="subassemblies"
                  checked={options.includeSubassemblies}
                  onCheckedChange={(checked) => updateOption("includeSubassemblies", !!checked)}
                />
                <Label htmlFor="subassemblies" className="font-normal">Include Subassemblies</Label>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Always included:</strong> SKU, description, selling price, dimensions, weight, lead time, visibility flags, quantity on hand</p>
            <p><strong>Not included:</strong> Unit cost, markup %, allocated/on-order quantities, reorder point, daily consumption rate (all calculated)</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export XLSX"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
