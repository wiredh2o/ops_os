import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

// Only static/user-set fields and seed data - no calculated values
interface AssemblyMappingState {
  sku: string;
  description?: string;
  selling_price?: string;
  weight_oz?: string;
  dimension_l?: string;
  dimension_w?: string;
  dimension_h?: string;
  packed_dimension_l?: string;
  packed_dimension_w?: string;
  packed_dimension_h?: string;
  lead_time_days?: string;
  eligible_for_distributor_discount?: string;
  is_subassembly?: string;
  visible_for_sale?: string;
  quantity_on_hand?: string;
  consumption_last_12_months?: string;
  created_by_source: "current_user" | "column";
  created_by_column?: string;
}

interface ComponentMappingState {
  assembly_sku: string;
  component_sku: string;
  quantity_needed: string;
}

export function AssemblyCsvImporter({ open, onClose, onImported }: Props) {
  const { toast } = useToast();
  const [assemblyFile, setAssemblyFile] = useState<File | null>(null);
  const [componentFile, setComponentFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"excel" | "csv">("csv");
  
  const [assemblyHeaders, setAssemblyHeaders] = useState<string[]>([]);
  const [componentHeaders, setComponentHeaders] = useState<string[]>([]);
  
  const [assemblyMapping, setAssemblyMapping] = useState<AssemblyMappingState>({ 
    sku: "", 
    created_by_source: "current_user" 
  });
  const [componentMapping, setComponentMapping] = useState<ComponentMappingState>({ 
    assembly_sku: "", 
    component_sku: "", 
    quantity_needed: "" 
  });
  
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (!assemblyFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = Papa.parse(text, { header: true, preview: 1 });
      const fields = (parsed.meta.fields || []).filter(Boolean) as string[];
      setAssemblyHeaders(fields);
      
      const lower = (s: string) => s.toLowerCase();
      const guess = (names: string[]) => fields.find((f) => names.includes(lower(f))) || "";
      
      setAssemblyMapping((m) => ({
        ...m,
        sku: guess(["sku", "assembly_sku", "product_sku"]) || m.sku,
        description: guess(["description", "sales_description", "name"]),
        selling_price: guess(["selling_price", "price", "unit_price"]),
        weight_oz: guess(["weight_oz", "weight"]),
        dimension_l: guess(["dimension_l", "length"]),
        dimension_w: guess(["dimension_w", "width"]),
        dimension_h: guess(["dimension_h", "height", "depth"]),
        lead_time_days: guess(["lead_time_days", "lead_time"]),
        quantity_on_hand: guess(["quantity_on_hand", "qty_on_hand", "stock"]),
        consumption_last_12_months: guess(["consumption_last_12_months", "ttm_consumption", "annual_usage"]),
        visible_for_sale: guess(["visible_for_sale", "for_sale", "sellable", "active"]),
        is_subassembly: guess(["is_subassembly", "subassembly"]),
      }));
    };
    reader.readAsText(assemblyFile);
  }, [assemblyFile]);

  useEffect(() => {
    if (!componentFile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = Papa.parse(text, { header: true, preview: 1 });
      const fields = (parsed.meta.fields || []).filter(Boolean) as string[];
      setComponentHeaders(fields);
      
      const lower = (s: string) => s.toLowerCase();
      const guess = (names: string[]) => fields.find((f) => names.includes(lower(f))) || "";
      
      setComponentMapping((m) => ({
        ...m,
        assembly_sku: guess(["assembly_sku", "parent_sku", "sku"]) || m.assembly_sku,
        component_sku: guess(["component_sku", "item_sku", "part_sku"]) || m.component_sku,
        quantity_needed: guess(["quantity_needed", "qty_needed", "quantity"]) || m.quantity_needed,
      }));
    };
    reader.readAsText(componentFile);
  }, [componentFile]);

  const canImport = useMemo(() => {
    if (importMode === "excel") {
      return !!excelFile;
    }
    return !!assemblyFile && !!componentFile && !!assemblyMapping.sku && !!componentMapping.assembly_sku && 
           !!componentMapping.component_sku && !!componentMapping.quantity_needed;
  }, [importMode, excelFile, assemblyFile, componentFile, assemblyMapping.sku, componentMapping]);

  const handleImport = async () => {
    try {
      setParsing(true);
      
      if (importMode === "excel" && excelFile) {
        const formData = new FormData();
        formData.append('file', excelFile);
        
        const { data, error } = await supabase.functions.invoke("import-assembly-excel", {
          body: formData,
        });
        
        if (error) throw error;
        
        toast({
          title: "Assembly import complete",
          description: `Created ${data.assembliesCreated} assemblies with ${data.componentsCreated} component relationships`,
        });
      } else if (importMode === "csv" && assemblyFile && componentFile) {
        const assemblyText = await assemblyFile.text();
        const componentText = await componentFile.text();
        
        const assemblyResult = Papa.parse(assemblyText, { header: true, dynamicTyping: false, skipEmptyLines: true });
        const componentResult = Papa.parse(componentText, { header: true, dynamicTyping: false, skipEmptyLines: true });
        
        const assemblyRows = (assemblyResult.data as Record<string, unknown>[]).filter((r) => r && Object.keys(r).length > 0);
        const componentRows = (componentResult.data as Record<string, unknown>[]).filter((r) => r && Object.keys(r).length > 0);
        
        const { data, error } = await supabase.functions.invoke("import-assembly-csv", {
          body: { 
            assemblyRows, 
            componentRows, 
            assemblyMapping, 
            componentMapping 
          },
        });
        
        if (error) throw error;
        
        toast({
          title: "Assembly import complete",
          description: `Created ${data.assembliesCreated} assemblies with ${data.componentsCreated} component relationships`,
        });
      }

      onImported?.();
      onClose();
    } catch (e: unknown) {
      console.error(e);
      toast({ 
        title: "Import failed", 
        description: (e as Error)?.message || "Unexpected error", 
        variant: "destructive" 
      });
    } finally {
      setParsing(false);
    }
  };

  const renderSelect = (label: string, value: string | undefined, onChange: (v: string) => void, headers: string[], required = false) => (
    <div className="space-y-1">
      <Label className="text-sm">{label}{required ? " *" : ""}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Assembly Data</DialogTitle>
        </DialogHeader>

        <div className="p-3 bg-muted rounded-md mb-4">
          <p className="text-sm text-muted-foreground">
            Import static and seed data only. Calculated values (unit cost, markup, allocated quantities, etc.) 
            will be computed automatically after import.
          </p>
        </div>

        <Tabs value={importMode} onValueChange={(v) => setImportMode(v as "excel" | "csv")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="excel">Excel File (2 Sheets)</TabsTrigger>
            <TabsTrigger value="csv">Two CSV Files</TabsTrigger>
          </TabsList>

          <TabsContent value="excel" className="space-y-4">
            <div className="space-y-2">
              <Label>Excel File with Assemblies and Components Sheets</Label>
              <Input 
                type="file" 
                accept=".xlsx,.xls" 
                onChange={(e) => setExcelFile(e.target.files?.[0] || null)} 
              />
              <p className="text-sm text-muted-foreground">
                Excel file should have "Assemblies" sheet and "Components" sheet with column headers matching expected fields.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assembly CSV</Label>
                <Input 
                  type="file" 
                  accept=".csv,text/csv" 
                  onChange={(e) => setAssemblyFile(e.target.files?.[0] || null)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Components CSV</Label>
                <Input 
                  type="file" 
                  accept=".csv,text/csv" 
                  onChange={(e) => setComponentFile(e.target.files?.[0] || null)} 
                />
              </div>
            </div>

            {assemblyHeaders.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Assembly Field Mapping</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {renderSelect("SKU", assemblyMapping.sku, (v) => setAssemblyMapping({ ...assemblyMapping, sku: v }), assemblyHeaders, true)}
                  {renderSelect("Description", assemblyMapping.description, (v) => setAssemblyMapping({ ...assemblyMapping, description: v }), assemblyHeaders)}
                  {renderSelect("Selling Price", assemblyMapping.selling_price, (v) => setAssemblyMapping({ ...assemblyMapping, selling_price: v }), assemblyHeaders)}
                  {renderSelect("Weight (oz)", assemblyMapping.weight_oz, (v) => setAssemblyMapping({ ...assemblyMapping, weight_oz: v }), assemblyHeaders)}
                  {renderSelect("Dimension L", assemblyMapping.dimension_l, (v) => setAssemblyMapping({ ...assemblyMapping, dimension_l: v }), assemblyHeaders)}
                  {renderSelect("Dimension W", assemblyMapping.dimension_w, (v) => setAssemblyMapping({ ...assemblyMapping, dimension_w: v }), assemblyHeaders)}
                  {renderSelect("Dimension H", assemblyMapping.dimension_h, (v) => setAssemblyMapping({ ...assemblyMapping, dimension_h: v }), assemblyHeaders)}
                  {renderSelect("Lead Time (days)", assemblyMapping.lead_time_days, (v) => setAssemblyMapping({ ...assemblyMapping, lead_time_days: v }), assemblyHeaders)}
                  {renderSelect("Qty On Hand (Seed)", assemblyMapping.quantity_on_hand, (v) => setAssemblyMapping({ ...assemblyMapping, quantity_on_hand: v }), assemblyHeaders)}
                  {renderSelect("12-Mo Consumption (Seed)", assemblyMapping.consumption_last_12_months, (v) => setAssemblyMapping({ ...assemblyMapping, consumption_last_12_months: v }), assemblyHeaders)}
                  {renderSelect("Visible for Sale", assemblyMapping.visible_for_sale, (v) => setAssemblyMapping({ ...assemblyMapping, visible_for_sale: v }), assemblyHeaders)}
                  {renderSelect("Is Subassembly", assemblyMapping.is_subassembly, (v) => setAssemblyMapping({ ...assemblyMapping, is_subassembly: v }), assemblyHeaders)}
                </div>
              </div>
            )}

            {componentHeaders.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Component Field Mapping</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {renderSelect("Assembly SKU", componentMapping.assembly_sku, (v) => setComponentMapping({ ...componentMapping, assembly_sku: v }), componentHeaders, true)}
                  {renderSelect("Component SKU", componentMapping.component_sku, (v) => setComponentMapping({ ...componentMapping, component_sku: v }), componentHeaders, true)}
                  {renderSelect("Quantity Needed", componentMapping.quantity_needed, (v) => setComponentMapping({ ...componentMapping, quantity_needed: v }), componentHeaders, true)}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={parsing}>Cancel</Button>
          <Button onClick={handleImport} disabled={!canImport || parsing}>
            {parsing ? "Importing..." : "Start Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
