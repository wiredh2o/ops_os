import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { showToast } from "@/lib/toast-utils";
import { Upload, FileSpreadsheet, CheckCircle } from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onDataChange?: () => void;
}

type SheetData = {
  name: string;
  headers: string[];
  rowCount: number;
};

type MappingState = Record<string, string>;

const INVENTORY_FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'sales_description', label: 'Sales Description' },
  { key: 'purchase_description', label: 'Purchase Description' },
  { key: 'unit_price', label: 'Unit Price' },
  { key: 'unit_cost', label: 'Unit Cost' },
  { key: 'manufacturer_part_number', label: 'MPN' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'weight_oz', label: 'Weight (oz)' },
  { key: 'dimension_l', label: 'Length' },
  { key: 'dimension_w', label: 'Width' },
  { key: 'dimension_h', label: 'Height' },
  { key: 'packed_dimension_l', label: 'Packed Length' },
  { key: 'packed_dimension_w', label: 'Packed Width' },
  { key: 'packed_dimension_h', label: 'Packed Height' },
  { key: 'quantity_on_hand', label: 'Qty On Hand (Seed)' },
  { key: 'lead_time_days', label: 'Lead Time Days' },
  { key: 'minimum_order_quantity', label: 'Min Order Qty' },
  { key: 'is_taxable', label: 'Is Taxable' },
  { key: 'visible_for_sale', label: 'Visible For Sale' },
  { key: 'eligible_for_distributor_discount', label: 'Distributor Discount' },
  { key: 'consumption_last_12_months', label: '12-Mo Consumption (Seed)' },
  { key: 'consumption_start_date', label: 'Consumption Start Date' },
  { key: 'image_urls', label: 'Image URLs' },
  { key: 'video_url', label: 'Video URL' },
  { key: 'stocking_uom', label: 'Stocking UOM' },
];

const ASSEMBLY_FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'description', label: 'Description' },
  { key: 'sales_description', label: 'Sales Description' },
  { key: 'purchase_description', label: 'Purchase Description' },
  { key: 'selling_price', label: 'Selling Price' },
  { key: 'weight_oz', label: 'Weight (oz)' },
  { key: 'dimension_l', label: 'Length' },
  { key: 'dimension_w', label: 'Width' },
  { key: 'dimension_h', label: 'Height' },
  { key: 'packed_dimension_l', label: 'Packed Length' },
  { key: 'packed_dimension_w', label: 'Packed Width' },
  { key: 'packed_dimension_h', label: 'Packed Height' },
  { key: 'lead_time_days', label: 'Lead Time Days' },
  { key: 'eligible_for_distributor_discount', label: 'Distributor Discount' },
  { key: 'is_subassembly', label: 'Is Subassembly' },
  { key: 'visible_for_sale', label: 'Visible For Sale' },
  { key: 'quantity_on_hand', label: 'Qty On Hand (Seed)' },
  { key: 'consumption_last_12_months', label: '12-Mo Consumption (Seed)' },
  { key: 'consumption_start_date', label: 'Consumption Start Date' },
];

const COMPONENT_FIELDS = [
  { key: 'assembly_sku', label: 'Assembly SKU', required: true },
  { key: 'component_sku', label: 'Component SKU', required: true },
  { key: 'quantity_needed', label: 'Quantity Needed' },
];

const SALES_UOM_FIELDS = [
  { key: 'sku', label: 'Inventory SKU', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'unit_price', label: 'Unit Price', required: true },
  { key: 'description', label: 'Description' },
  { key: 'is_default', label: 'Is Default' },
  { key: 'sort_order', label: 'Sort Order' },
];

const PURCHASE_UOM_FIELDS = [
  { key: 'sku', label: 'Inventory SKU', required: true },
  { key: 'purchase_uom', label: 'Purchase UOM', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'unit_cost', label: 'Unit Cost', required: true },
  { key: 'supplier_name', label: 'Supplier Name' },
  { key: 'lead_time_days', label: 'Lead Time Days' },
  { key: 'minimum_order_quantity', label: 'Min Order Qty' },
  { key: 'is_default', label: 'Is Default' },
  { key: 'sort_order', label: 'Sort Order' },
];

type TabValue = "inventory" | "assemblies" | "components" | "salesUoms" | "purchaseUoms";

export function UnifiedInventoryImporter({ open, onClose, onDataChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [xlsxBase64, setXlsxBase64] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabValue>("inventory");
  
  const [inventoryMapping, setInventoryMapping] = useState<MappingState>({});
  const [assemblyMapping, setAssemblyMapping] = useState<MappingState>({});
  const [componentMapping, setComponentMapping] = useState<MappingState>({});
  const [salesUomMapping, setSalesUomMapping] = useState<MappingState>({});
  const [purchaseUomMapping, setPurchaseUomMapping] = useState<MappingState>({});
  
  const [importing, setImporting] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Store base64 for sending to server
        const base64 = btoa(String.fromCharCode(...data));
        setXlsxBase64(base64);

        // Extract sheet info
        const sheetInfo: SheetData[] = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          const headers = (jsonData[0] || []).map(String);
          return {
            name,
            headers,
            rowCount: jsonData.length - 1,
          };
        });

        setSheets(sheetInfo);

        // Auto-map columns based on header names
        const autoMap = (headers: string[], fields: { key: string; label: string }[]) => {
          const mapping: MappingState = {};
          fields.forEach(field => {
            const match = headers.find(h => 
              h.toLowerCase().replace(/[_\s]/g, '') === field.key.toLowerCase().replace(/[_\s]/g, '') ||
              h.toLowerCase().includes(field.key.toLowerCase())
            );
            if (match) mapping[field.key] = match;
          });
          return mapping;
        };

        // Find sheets by name pattern
        const inventorySheet = sheetInfo.find(s => 
          s.name.toLowerCase().includes('inventory') && !s.name.toLowerCase().includes('component')
        );
        const assemblySheet = sheetInfo.find(s => 
          s.name.toLowerCase().includes('assembl') && !s.name.toLowerCase().includes('component')
        );
        const componentSheet = sheetInfo.find(s => 
          s.name.toLowerCase().includes('component')
        );
        const salesUomSheet = sheetInfo.find(s => 
          s.name.toLowerCase().includes('sales') && s.name.toLowerCase().includes('uom')
        );
        const purchaseUomSheet = sheetInfo.find(s => 
          s.name.toLowerCase().includes('purchase') && s.name.toLowerCase().includes('uom')
        );

        if (inventorySheet) {
          setInventoryMapping(autoMap(inventorySheet.headers, INVENTORY_FIELDS));
        }
        if (assemblySheet) {
          setAssemblyMapping(autoMap(assemblySheet.headers, ASSEMBLY_FIELDS));
        }
        if (componentSheet) {
          setComponentMapping(autoMap(componentSheet.headers, COMPONENT_FIELDS));
        }
        if (salesUomSheet) {
          setSalesUomMapping(autoMap(salesUomSheet.headers, SALES_UOM_FIELDS));
        }
        if (purchaseUomSheet) {
          setPurchaseUomMapping(autoMap(purchaseUomSheet.headers, PURCHASE_UOM_FIELDS));
        }

      } catch (error) {
        console.error("Error parsing file:", error);
        showToast.error("Invalid File", "Could not parse the Excel file");
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  }, []);

  const handleImport = async () => {
    if (!xlsxBase64) {
      showToast.error("No File", "Please select an Excel file first");
      return;
    }

    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-unified-inventory', {
        body: {
          xlsxData: xlsxBase64,
          mapping: {
            inventoryItems: inventoryMapping,
            assemblies: assemblyMapping,
            components: componentMapping,
            salesUoms: salesUomMapping,
            purchaseUoms: purchaseUomMapping,
          },
        }
      });

      if (error) throw error;

      const { stats } = data;
      const messages = [];
      if (stats.inventoryCreated + stats.inventoryUpdated > 0) {
        messages.push(`${stats.inventoryCreated} items created, ${stats.inventoryUpdated} updated`);
      }
      if (stats.assembliesCreated + stats.assembliesUpdated > 0) {
        messages.push(`${stats.assembliesCreated} assemblies created, ${stats.assembliesUpdated} updated`);
      }
      if (stats.componentsCreated + stats.componentsUpdated > 0) {
        messages.push(`${stats.componentsCreated} components created, ${stats.componentsUpdated} updated`);
      }
      if (stats.salesUomsCreated + stats.salesUomsUpdated > 0) {
        messages.push(`${stats.salesUomsCreated} sales UOMs created, ${stats.salesUomsUpdated} updated`);
      }
      if (stats.purchaseUomsCreated + stats.purchaseUomsUpdated > 0) {
        messages.push(`${stats.purchaseUomsCreated} purchase UOMs created, ${stats.purchaseUomsUpdated} updated`);
      }

      if (stats.errors?.length > 0) {
        showToast.error("Import Completed with Errors", `${stats.errors.length} errors occurred`);
        console.error("Import errors:", stats.errors);
      } else {
        showToast.success("Import Complete", messages.join(". "));
      }

      onDataChange?.();
      onClose();
    } catch (error: any) {
      console.error("Import error:", error);
      showToast.error("Import Failed", error.message);
    } finally {
      setImporting(false);
    }
  };

  const renderMappingFields = (
    fields: { key: string; label: string; required?: boolean }[],
    headers: string[],
    mapping: MappingState,
    setMapping: (m: MappingState) => void
  ) => (
    <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
      {fields.map(field => (
        <div key={field.key} className="space-y-1">
          <Label className="text-xs">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Select
            value={mapping[field.key] || ""}
            onValueChange={(val) => setMapping({ ...mapping, [field.key]: val })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__skip__">-- Skip --</SelectItem>
              {headers.map(header => (
                <SelectItem key={header} value={header}>{header}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );

  const getSheetHeaders = (pattern: string, secondPattern?: string): string[] => {
    const sheet = sheets.find(s => {
      const name = s.name.toLowerCase();
      if (secondPattern) {
        return name.includes(pattern) && name.includes(secondPattern);
      }
      return name.includes(pattern);
    });
    return sheet?.headers || [];
  };

  const hasSheet = (pattern: string, secondPattern?: string): boolean => {
    return sheets.some(s => {
      const name = s.name.toLowerCase();
      if (secondPattern) {
        return name.includes(pattern) && name.includes(secondPattern);
      }
      return name.includes(pattern);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Inventory Data
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Select Excel File (.xlsx)</Label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            {file && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                {file.name}
              </p>
            )}
          </div>

          {/* Sheet Detection */}
          {sheets.length > 0 && (
            <div className="space-y-2">
              <Label>Detected Sheets</Label>
              <div className="flex flex-wrap gap-2">
                {sheets.map(sheet => (
                  <span key={sheet.name} className="px-2 py-1 bg-muted rounded text-xs">
                    {sheet.name} ({sheet.rowCount} rows)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Column Mapping Tabs */}
          {sheets.length > 0 && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="inventory" className="text-xs">Inventory</TabsTrigger>
                <TabsTrigger value="assemblies" className="text-xs">Assemblies</TabsTrigger>
                <TabsTrigger value="components" className="text-xs">Components</TabsTrigger>
                <TabsTrigger value="salesUoms" className="text-xs">Sales UOMs</TabsTrigger>
                <TabsTrigger value="purchaseUoms" className="text-xs">Purchase UOMs</TabsTrigger>
              </TabsList>

              <TabsContent value="inventory" className="mt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Map columns from the "Inventory Items" sheet
                </p>
                {renderMappingFields(
                  INVENTORY_FIELDS,
                  getSheetHeaders('inventory'),
                  inventoryMapping,
                  setInventoryMapping
                )}
              </TabsContent>

              <TabsContent value="assemblies" className="mt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Map columns from the "Assemblies" sheet
                </p>
                {renderMappingFields(
                  ASSEMBLY_FIELDS,
                  getSheetHeaders('assembl'),
                  assemblyMapping,
                  setAssemblyMapping
                )}
              </TabsContent>

              <TabsContent value="components" className="mt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Map columns from the "Assembly Components" sheet (BOM)
                </p>
                {renderMappingFields(
                  COMPONENT_FIELDS,
                  getSheetHeaders('component'),
                  componentMapping,
                  setComponentMapping
                )}
              </TabsContent>

              <TabsContent value="salesUoms" className="mt-4">
                {hasSheet('sales', 'uom') ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      Map columns from the "Sales UOMs" sheet - multiple sales configurations per inventory item
                    </p>
                    {renderMappingFields(
                      SALES_UOM_FIELDS,
                      getSheetHeaders('sales', 'uom'),
                      salesUomMapping,
                      setSalesUomMapping
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No "Sales UOMs" sheet detected. To import sales UOM configurations, include a sheet with "Sales" and "UOM" in its name.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="purchaseUoms" className="mt-4">
                {hasSheet('purchase', 'uom') ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      Map columns from the "Purchase UOMs" sheet - multiple purchase configurations per inventory item
                    </p>
                    {renderMappingFields(
                      PURCHASE_UOM_FIELDS,
                      getSheetHeaders('purchase', 'uom'),
                      purchaseUomMapping,
                      setPurchaseUomMapping
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No "Purchase UOMs" sheet detected. To import purchase UOM configurations, include a sheet with "Purchase" and "UOM" in its name.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || !file}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? "Importing..." : "Import Data"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
