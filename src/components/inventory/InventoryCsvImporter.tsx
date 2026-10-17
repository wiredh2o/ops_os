import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

interface MappingState {
  sku: string;
  unit_price?: string;
  unit_cost?: string;
  quantity_on_hand?: string;
  quantity_allocated?: string;
  quantity_on_order?: string;
  quantity_atp?: string;
  quantity_ats?: string;
  description?: string;
  sales_description?: string;
  purchase_description?: string;
  manufacturer_part_number?: string;
  vendor?: string;
  lead_time_days?: string;
  minimum_order_quantity?: string;
  reorder_point?: string;
  is_taxable?: string;
  weight_oz?: string;
  volume_cubic_inches?: string;
  dimension_l?: string;
  dimension_w?: string;
  dimension_h?: string;
  packed_dimension_l?: string;
  packed_dimension_w?: string;
  packed_dimension_h?: string;
  packed_volume_cubic_inches?: string;
  packed_shape?: string;
  packed_diameter?: string;
  actual_packed_volume_cubic_inches?: string;
  paper_thickness_top?: string;
  paper_thickness_bottom?: string;
  paper_thickness_left?: string;
  paper_thickness_right?: string;
  paper_thickness_front?: string;
  paper_thickness_back?: string;
  paper_thickness_side?: string;
  paper_thickness_uniform?: string;
  consumption_last_12_months?: string;
  daily_consumption_rate?: string;
  visible_for_sale?: string;
  images?: string;
  images_front?: string;
  images_back?: string;
  images_special?: string;
  video_url?: string;
  created_by_source: "current_user" | "column";
  created_by_column?: string;
}

export function InventoryCsvImporter({ open, onClose, onImported }: Props) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<MappingState>({ sku: "", created_by_source: "current_user" });
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = Papa.parse(text, { header: true, preview: 1 });
      const fields = (parsed.meta.fields || []).filter(Boolean) as string[];
      setHeaders(fields);
      // Autoguess mappings
      const lower = (s: string) => s.toLowerCase();
      const guess = (names: string[]) => fields.find((f) => names.includes(lower(f))) || "";
      setMapping((m) => ({
        ...m,
        sku: guess(["sku", "item_sku", "product_sku"]) || m.sku,
        unit_price: guess(["unit_price", "selling_price", "price"]),
        unit_cost: guess(["unit_cost", "cost", "purchase_cost"]),
        quantity_on_hand: guess(["quantity_on_hand", "qty_on_hand", "stock", "quantity"]),
        quantity_allocated: guess(["quantity_allocated", "qty_allocated", "allocated"]),
        quantity_on_order: guess(["quantity_on_order", "qty_on_order", "on_order"]),
        quantity_atp: guess(["quantity_atp", "qty_atp", "available_to_promise"]),
        quantity_ats: guess(["quantity_ats", "qty_ats", "available_to_sell"]),
        description: guess(["description", "item_description", "name"]),
        sales_description: guess(["sales_description", "sales_desc", "customer_description"]),
        purchase_description: guess(["purchase_description", "purchase_desc", "vendor_description"]),
        manufacturer_part_number: guess(["manufacturer_part_number", "mpn", "mfg_part_number", "part_number"]),
        vendor: guess(["vendor", "supplier", "manufacturer"]),
        lead_time_days: guess(["lead_time_days", "lead_time", "delivery_days"]),
        minimum_order_quantity: guess(["minimum_order_quantity", "moq", "min_order_qty"]),
        reorder_point: guess(["reorder_point", "reorder_level", "minimum_stock"]),
        is_taxable: guess(["is_taxable", "taxable", "tax_exempt"]),
        weight_oz: guess(["weight_oz", "weight", "weight_ounces"]),
        volume_cubic_inches: guess(["volume_cubic_inches", "volume", "cubic_inches"]),
        dimension_l: guess(["dimension_l", "length", "l", "product_length"]),
        dimension_w: guess(["dimension_w", "width", "w", "product_width"]),
        dimension_h: guess(["dimension_h", "height", "h", "product_height"]),
        packed_dimension_l: guess(["packed_dimension_l", "packed_length", "package_length"]),
        packed_dimension_w: guess(["packed_dimension_w", "packed_width", "package_width"]),
        packed_dimension_h: guess(["packed_dimension_h", "packed_height", "package_height"]),
        packed_volume_cubic_inches: guess(["packed_volume_cubic_inches", "packed_volume", "package_volume"]),
        packed_shape: guess(["packed_shape", "shape"]),
        packed_diameter: guess(["packed_diameter", "diameter"]),
        actual_packed_volume_cubic_inches: guess(["actual_packed_volume_cubic_inches", "actual_volume"]),
        paper_thickness_top: guess(["paper_thickness_top"]),
        paper_thickness_bottom: guess(["paper_thickness_bottom"]),
        paper_thickness_left: guess(["paper_thickness_left"]),
        paper_thickness_right: guess(["paper_thickness_right"]),
        paper_thickness_front: guess(["paper_thickness_front"]),
        paper_thickness_back: guess(["paper_thickness_back"]),
        paper_thickness_side: guess(["paper_thickness_side"]),
        paper_thickness_uniform: guess(["paper_thickness_uniform"]),
        consumption_last_12_months: guess(["consumption_last_12_months", "ttm_consumption", "annual_usage"]),
        daily_consumption_rate: guess(["daily_consumption_rate", "daily_usage", "consumption_rate"]),
        visible_for_sale: guess(["visible_for_sale", "for_sale", "sellable", "available_for_sale", "active"]),
        images: guess(["images", "image_urls", "image", "pictures", "photos"]),
        video_url: guess(["video_url", "video", "product_video"]),
        images_front: guess([
          "hi res front",
          "hi-res front",
          "hi_res_front",
          "hires front",
          "hires_front",
          "front",
          "front image",
          "front images"
        ]),
        images_back: guess([
          "hi res back",
          "hi-res back",
          "hi_res_back",
          "hires back",
          "hires_back",
          "back",
          "back image",
          "back images"
        ]),
        images_special: guess([
          "hi res special",
          "hi-res special",
          "hi_res_special",
          "hires special",
          "hires_special",
          "special",
          "special image",
          "special images"
        ]),
      }));
    };
    reader.readAsText(file);
  }, [file]);

  const canImport = useMemo(() => !!file && !!mapping.sku, [file, mapping.sku]);

  const handleImport = async () => {
    if (!file || !mapping.sku) return;
    try {
      setParsing(true);
      const text = await file.text();
      const parseResult = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true });
      const rows = (parseResult.data as any[]).filter((r) => r && Object.keys(r).length > 0);

      const { data, error } = await supabase.functions.invoke("import-inventory-csv", {
        body: { rows, mapping },
      });

      if (error) throw error;

      toast({
        title: "Import complete",
        description: `Created ${data.created}, Updated ${data.updated}, Images ${data.imagesUploaded}. Errors: ${data.errorsCount}`,
      });

      onImported?.();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Import failed", description: e?.message || "Unexpected error", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const renderSelect = (label: string, value: string | undefined, onChange: (v: string) => void, required = false) => (
    <div className="space-y-1">
      <Label>{label}{required ? " *" : ""}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a column" />
        </SelectTrigger>
        <SelectContent>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Inventory CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>CSV File</Label>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          {headers.length > 0 && (
            <div className="space-y-6">
              {/* Core Business Fields */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Core Business</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSelect("SKU", mapping.sku, (v) => setMapping({ ...mapping, sku: v }), true)}
                  {renderSelect("Unit Price", mapping.unit_price, (v) => setMapping({ ...mapping, unit_price: v }))}
                  {renderSelect("Unit Cost", mapping.unit_cost, (v) => setMapping({ ...mapping, unit_cost: v }))}
                  {renderSelect("Sales Description", mapping.sales_description, (v) => setMapping({ ...mapping, sales_description: v }))}
                  {renderSelect("Purchase Description", mapping.purchase_description, (v) => setMapping({ ...mapping, purchase_description: v }))}
                  {renderSelect("Manufacturer Part Number", mapping.manufacturer_part_number, (v) => setMapping({ ...mapping, manufacturer_part_number: v }))}
                  {renderSelect("Vendor", mapping.vendor, (v) => setMapping({ ...mapping, vendor: v }))}
                  {renderSelect("Description (Legacy)", mapping.description, (v) => setMapping({ ...mapping, description: v }))}
                </div>
              </div>

              {/* Physical Inventory */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Physical Inventory</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSelect("Quantity On Hand", mapping.quantity_on_hand, (v) => setMapping({ ...mapping, quantity_on_hand: v }))}
                  {renderSelect("Quantity Allocated", mapping.quantity_allocated, (v) => setMapping({ ...mapping, quantity_allocated: v }))}
                  {renderSelect("Quantity On Order", mapping.quantity_on_order, (v) => setMapping({ ...mapping, quantity_on_order: v }))}
                  {renderSelect("Quantity ATP", mapping.quantity_atp, (v) => setMapping({ ...mapping, quantity_atp: v }))}
                  {renderSelect("Quantity ATS", mapping.quantity_ats, (v) => setMapping({ ...mapping, quantity_ats: v }))}
                </div>
              </div>

              {/* Product Dimensions */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Product Dimensions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSelect("Length (L)", mapping.dimension_l, (v) => setMapping({ ...mapping, dimension_l: v }))}
                  {renderSelect("Width (W)", mapping.dimension_w, (v) => setMapping({ ...mapping, dimension_w: v }))}
                  {renderSelect("Height (H)", mapping.dimension_h, (v) => setMapping({ ...mapping, dimension_h: v }))}
                  {renderSelect("Weight (oz)", mapping.weight_oz, (v) => setMapping({ ...mapping, weight_oz: v }))}
                  {renderSelect("Volume (cubic inches)", mapping.volume_cubic_inches, (v) => setMapping({ ...mapping, volume_cubic_inches: v }))}
                </div>
              </div>

              {/* Packed Dimensions */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Packed Dimensions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSelect("Packed Length", mapping.packed_dimension_l, (v) => setMapping({ ...mapping, packed_dimension_l: v }))}
                  {renderSelect("Packed Width", mapping.packed_dimension_w, (v) => setMapping({ ...mapping, packed_dimension_w: v }))}
                  {renderSelect("Packed Height", mapping.packed_dimension_h, (v) => setMapping({ ...mapping, packed_dimension_h: v }))}
                  {renderSelect("Packed Volume", mapping.packed_volume_cubic_inches, (v) => setMapping({ ...mapping, packed_volume_cubic_inches: v }))}
                  {renderSelect("Packed Shape", mapping.packed_shape, (v) => setMapping({ ...mapping, packed_shape: v }))}
                  {renderSelect("Packed Diameter", mapping.packed_diameter, (v) => setMapping({ ...mapping, packed_diameter: v }))}
                  {renderSelect("Actual Packed Volume", mapping.actual_packed_volume_cubic_inches, (v) => setMapping({ ...mapping, actual_packed_volume_cubic_inches: v }))}
                  {renderSelect("Paper Top", mapping.paper_thickness_top, (v) => setMapping({ ...mapping, paper_thickness_top: v }))}
                  {renderSelect("Paper Bottom", mapping.paper_thickness_bottom, (v) => setMapping({ ...mapping, paper_thickness_bottom: v }))}
                  {renderSelect("Paper Left", mapping.paper_thickness_left, (v) => setMapping({ ...mapping, paper_thickness_left: v }))}
                  {renderSelect("Paper Right", mapping.paper_thickness_right, (v) => setMapping({ ...mapping, paper_thickness_right: v }))}
                  {renderSelect("Paper Front", mapping.paper_thickness_front, (v) => setMapping({ ...mapping, paper_thickness_front: v }))}
                  {renderSelect("Paper Back", mapping.paper_thickness_back, (v) => setMapping({ ...mapping, paper_thickness_back: v }))}
                  {renderSelect("Paper Side", mapping.paper_thickness_side, (v) => setMapping({ ...mapping, paper_thickness_side: v }))}
                  {renderSelect("Paper Uniform", mapping.paper_thickness_uniform, (v) => setMapping({ ...mapping, paper_thickness_uniform: v }))}
                </div>
              </div>

              {/* TTM Historical */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">TTM Consumption History</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSelect("12-Month Consumption", mapping.consumption_last_12_months, (v) => setMapping({ ...mapping, consumption_last_12_months: v }))}
                  {renderSelect("Daily Consumption Rate", mapping.daily_consumption_rate, (v) => setMapping({ ...mapping, daily_consumption_rate: v }))}
                </div>
              </div>

              {/* Business Rules */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Business Rules</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSelect("Lead Time (days)", mapping.lead_time_days, (v) => setMapping({ ...mapping, lead_time_days: v }))}
                  {renderSelect("Minimum Order Quantity", mapping.minimum_order_quantity, (v) => setMapping({ ...mapping, minimum_order_quantity: v }))}
                  {renderSelect("Reorder Point", mapping.reorder_point, (v) => setMapping({ ...mapping, reorder_point: v }))}
                  {renderSelect("Is Taxable", mapping.is_taxable, (v) => setMapping({ ...mapping, is_taxable: v }))}
                  {renderSelect("Visible for Sale", mapping.visible_for_sale, (v) => setMapping({ ...mapping, visible_for_sale: v }))}
                </div>
              </div>

              {/* Media */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Media</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderSelect("Images (list in one column)", mapping.images, (v) => setMapping({ ...mapping, images: v }))}
                  {renderSelect("Video URL", mapping.video_url, (v) => setMapping({ ...mapping, video_url: v }))}
                  {renderSelect("HI RES FRONT", mapping.images_front, (v) => setMapping({ ...mapping, images_front: v }))}
                  {renderSelect("HI RES BACK", mapping.images_back, (v) => setMapping({ ...mapping, images_back: v }))}
                  {renderSelect("HI RES SPECIAL", mapping.images_special, (v) => setMapping({ ...mapping, images_special: v }))}
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Tip: If your CSV has multiple image links per item, put them in a single column separated by commas/semicolons/pipes.
          </p>
        </div>

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
