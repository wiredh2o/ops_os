import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { showToast } from "@/lib/toast-utils";
import { Download, FileSpreadsheet } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ExportOptions {
  includePackedDimensions: boolean;
  includeTTMSeed: boolean;
  includeMedia: boolean;
  includeSubassemblies: boolean;
  includeUOM: boolean;
}

export function UnifiedInventoryExporter({ open, onClose }: Props) {
  const [options, setOptions] = useState<ExportOptions>({
    includePackedDimensions: false,
    includeTTMSeed: true,
    includeMedia: false,
    includeSubassemblies: true,
    includeUOM: true,
  });
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-unified-inventory', {
        body: { options }
      });

      if (error) throw error;
      if (!data?.xlsxData) throw new Error("No data returned from export");

      // Decode base64 and create download
      const binaryString = atob(data.xlsxData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast.success(
        "Export Complete",
        `Exported ${data.counts.inventoryItems} items, ${data.counts.assemblies} assemblies, ${data.counts.components} components`
      );
      onClose();
    } catch (error: any) {
      console.error("Export error:", error);
      showToast.error("Export Failed", error.message);
    } finally {
      setExporting(false);
    }
  };

  const updateOption = (key: keyof ExportOptions, value: boolean) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Export Inventory Data
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Exports a single Excel file with 3 sheets: Inventory Items, Assemblies, and Assembly Components (BOM).
            Only static and seed data is exported — calculated fields are excluded.
          </p>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includePackedDimensions"
                checked={options.includePackedDimensions}
                onCheckedChange={(checked) => updateOption('includePackedDimensions', !!checked)}
              />
              <Label htmlFor="includePackedDimensions">Include packed dimensions</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeTTMSeed"
                checked={options.includeTTMSeed}
                onCheckedChange={(checked) => updateOption('includeTTMSeed', !!checked)}
              />
              <Label htmlFor="includeTTMSeed">Include TTM seed data (12-mo consumption)</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeMedia"
                checked={options.includeMedia}
                onCheckedChange={(checked) => updateOption('includeMedia', !!checked)}
              />
              <Label htmlFor="includeMedia">Include media URLs</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeSubassemblies"
                checked={options.includeSubassemblies}
                onCheckedChange={(checked) => updateOption('includeSubassemblies', !!checked)}
              />
              <Label htmlFor="includeSubassemblies">Include subassemblies</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeUOM"
                checked={options.includeUOM}
                onCheckedChange={(checked) => updateOption('includeUOM', !!checked)}
              />
              <Label htmlFor="includeUOM">Include UOM (Units of Measure)</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exporting..." : "Export XLSX"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
