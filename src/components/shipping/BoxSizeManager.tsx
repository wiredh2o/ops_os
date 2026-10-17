import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2, Package, Box, Upload, X, Loader2 } from "lucide-react";
import type { BoxSize } from "@/lib/box-packing-utils";
import { processBoxImage } from "@/lib/image/boxImageProcessor";

interface BoxSizeFormData {
  name: string;
  dimension_l: string;
  dimension_w: string;
  dimension_h: string;
  weight_oz: string;
  max_weight_oz: string;
  cost_per_box: string;
  shipping_cost_multiplier: string;
  supplier: string;
  lead_time_days: string;
  minimum_order_quantity: string;
  is_active: boolean;
  image_url: string;
}

const PRESET_BOXES = [
  { name: "Small", l: 6, w: 6, h: 6 },
  { name: "Medium", l: 12, w: 10, h: 8 },
  { name: "Large", l: 18, w: 14, h: 12 },
  { name: "X-Large", l: 24, w: 18, h: 18 },
];

// Conversion functions for inbound freight percentage
const multiplierToPercent = (multiplier: number): number => Math.round((multiplier - 1) * 100);
const percentToMultiplier = (percent: number): number => 1 + (percent / 100);

const defaultFormData: BoxSizeFormData = {
  name: "",
  dimension_l: "",
  dimension_w: "",
  dimension_h: "",
  weight_oz: "0",
  max_weight_oz: "",
  cost_per_box: "0",
  shipping_cost_multiplier: "0", // Now stored as percentage in form state
  supplier: "",
  lead_time_days: "",
  minimum_order_quantity: "",
  is_active: true,
  image_url: "",
};

export function BoxSizeManager() {
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<BoxSize | null>(null);
  const [deletingBox, setDeletingBox] = useState<BoxSize | null>(null);
  const [formData, setFormData] = useState<BoxSizeFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchBoxes();
  }, []);

  const fetchBoxes = async () => {
    try {
      const { data, error } = await supabase
        .from("box_sizes")
        .select("*")
        .order("dimension_l", { ascending: true })
        .order("dimension_w", { ascending: true })
        .order("dimension_h", { ascending: true });

      if (error) throw error;
      setBoxes(data || []);
    } catch (err: any) {
      toast({
        title: "Error loading boxes",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingBox(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const openEditDialog = (box: BoxSize) => {
    setEditingBox(box);
    const storedMultiplier = (box as any).shipping_cost_multiplier ?? 1;
    setFormData({
      name: box.name,
      dimension_l: box.dimension_l.toString(),
      dimension_w: box.dimension_w.toString(),
      dimension_h: box.dimension_h.toString(),
      weight_oz: (box as any).weight_oz ? ((box as any).weight_oz / 16).toFixed(2) : "0",
      max_weight_oz: box.max_weight_oz ? (box.max_weight_oz / 16).toFixed(2) : "",
      cost_per_box: box.cost_per_box.toString(),
      shipping_cost_multiplier: multiplierToPercent(storedMultiplier).toString(),
      supplier: (box as any).supplier || "",
      lead_time_days: (box as any).lead_time_days?.toString() || "",
      minimum_order_quantity: (box as any).minimum_order_quantity?.toString() || "",
      is_active: box.is_active,
      image_url: (box as any).image_url || "",
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (box: BoxSize) => {
    setDeletingBox(box);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.dimension_l || !formData.dimension_w || !formData.dimension_h) {
      toast({
        title: "Validation error",
        description: "Name and dimensions are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const freightPercent = parseFloat(formData.shipping_cost_multiplier) || 0;
      const payload = {
        name: formData.name,
        dimension_l: parseFloat(formData.dimension_l),
        dimension_w: parseFloat(formData.dimension_w),
        dimension_h: parseFloat(formData.dimension_h),
        weight_oz: (parseFloat(formData.weight_oz) || 0) * 16,
        max_weight_oz: formData.max_weight_oz ? parseFloat(formData.max_weight_oz) * 16 : null,
        cost_per_box: parseFloat(formData.cost_per_box) || 0,
        shipping_cost_multiplier: percentToMultiplier(freightPercent),
        supplier: formData.supplier || null,
        lead_time_days: formData.lead_time_days ? parseInt(formData.lead_time_days) : null,
        minimum_order_quantity: formData.minimum_order_quantity ? parseInt(formData.minimum_order_quantity) : null,
        is_active: formData.is_active,
        image_url: formData.image_url || null,
      };

      if (editingBox) {
        const { error } = await supabase
          .from("box_sizes")
          .update(payload)
          .eq("id", editingBox.id);
        if (error) throw error;
        toast({ title: "Box updated" });
      } else {
        const { error } = await supabase.from("box_sizes").insert(payload);
        if (error) throw error;
        toast({ title: "Box added" });
      }

      setDialogOpen(false);
      fetchBoxes();
    } catch (err: any) {
      toast({
        title: "Error saving box",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingBox) return;

    try {
      const { error } = await supabase
        .from("box_sizes")
        .delete()
        .eq("id", deletingBox.id);

      if (error) throw error;

      toast({ title: "Box deleted" });
      setDeleteDialogOpen(false);
      setDeletingBox(null);
      fetchBoxes();
    } catch (err: any) {
      toast({
        title: "Error deleting box",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (box: BoxSize) => {
    try {
      const { error } = await supabase
        .from("box_sizes")
        .update({ is_active: !box.is_active })
        .eq("id", box.id);

      if (error) throw error;
      fetchBoxes();
    } catch (err: any) {
      toast({
        title: "Error updating box",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const addPresetBox = async (preset: typeof PRESET_BOXES[0]) => {
    try {
      const { error } = await supabase.from("box_sizes").insert({
        name: `${preset.name} Box (${preset.l}×${preset.w}×${preset.h})`,
        dimension_l: preset.l,
        dimension_w: preset.w,
        dimension_h: preset.h,
        cost_per_box: 0,
        is_active: true,
      });

      if (error) throw error;
      toast({ title: `${preset.name} box added` });
      fetchBoxes();
    } catch (err: any) {
      toast({
        title: "Error adding preset",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const calculateVolume = (l: number, w: number, h: number) => {
    return l * w * h;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be less than 2MB",
        variant: "destructive",
      });
      return;
    }

    setProcessingImage(true);
    let processedBlob: Blob;
    
    try {
      // Process image: remove background and add white canvas with padding
      processedBlob = await processBoxImage(file);
    } catch (err: any) {
      console.warn('Image processing failed, using original:', err);
      toast({
        title: "Image processing failed",
        description: "Using original image instead",
        variant: "default",
      });
      processedBlob = file;
    } finally {
      setProcessingImage(false);
    }

    setUploading(true);
    try {
      const timestamp = Date.now();
      const filename = `box-sizes/${timestamp}.png`;

      const { error: uploadError } = await supabase.storage
        .from('inventory-images')
        .upload(filename, processedBlob, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('inventory-images')
        .getPublicUrl(filename);

      setFormData({ ...formData, image_url: urlData.publicUrl });
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = () => {
    setFormData({ ...formData, image_url: "" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Add Presets */}
      {boxes.length === 0 && (
        <div className="bg-muted/50 rounded-lg p-4 border">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Box className="h-4 w-4" />
            Quick Start: Add Common Box Sizes
          </h4>
          <div className="flex flex-wrap gap-2">
            {PRESET_BOXES.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                onClick={() => addPresetBox(preset)}
              >
                <Plus className="h-3 w-3 mr-1" />
                {preset.name} ({preset.l}×{preset.w}×{preset.h})
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {boxes.length} box size{boxes.length !== 1 ? "s" : ""} configured
        </p>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Box Size
        </Button>
      </div>

      {/* Table */}
      {boxes.length > 0 && (
        <TooltipProvider>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Dimensions (L×W×H)</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Tare Weight</TableHead>
                  <TableHead>Max Weight</TableHead>
                  <TableHead>Base Cost</TableHead>
                  <TableHead>Effective Cost</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boxes.map((box) => (
                  <TableRow key={box.id} className={!box.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      {(box as any).image_url ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <img
                              src={(box as any).image_url}
                              alt={box.name}
                              className="h-8 w-8 rounded object-cover cursor-pointer"
                            />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="p-0">
                            <img
                              src={(box as any).image_url}
                              alt={box.name}
                              className="max-w-[200px] max-h-[200px] rounded object-contain"
                            />
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {box.name}
                    </TableCell>
                    <TableCell>
                      {box.dimension_l}" × {box.dimension_w}" × {box.dimension_h}"
                    </TableCell>
                    <TableCell>
                      {calculateVolume(box.dimension_l, box.dimension_w, box.dimension_h).toLocaleString()} cu in
                    </TableCell>
                    <TableCell>
                      {(box as any).weight_oz 
                        ? (box as any).weight_oz >= 16 
                          ? `${((box as any).weight_oz / 16).toFixed(1)} lbs`
                          : `${(box as any).weight_oz} oz`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {box.max_weight_oz 
                        ? box.max_weight_oz >= 16 
                          ? `${(box.max_weight_oz / 16).toFixed(1)} lbs`
                          : `${box.max_weight_oz} oz`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {box.cost_per_box > 0 ? `$${box.cost_per_box.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      {box.cost_per_box > 0 ? (
                        <span className="font-medium">
                          ${(box.cost_per_box * ((box as any).shipping_cost_multiplier ?? 1)).toFixed(2)}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={box.is_active}
                        onCheckedChange={() => handleToggleActive(box)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(box)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(box)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBox ? "Edit Box Size" : "Add Box Size"}</DialogTitle>
            <DialogDescription>
              Define the dimensions and properties of this shipping box.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Box Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Medium Shipping Box"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="dimension_l">Length (in)</Label>
                <Input
                  id="dimension_l"
                  type="number"
                  step="0.1"
                  value={formData.dimension_l}
                  onChange={(e) => setFormData({ ...formData, dimension_l: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dimension_w">Width (in)</Label>
                <Input
                  id="dimension_w"
                  type="number"
                  step="0.1"
                  value={formData.dimension_w}
                  onChange={(e) => setFormData({ ...formData, dimension_w: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dimension_h">Height (in)</Label>
                <Input
                  id="dimension_h"
                  type="number"
                  step="0.1"
                  value={formData.dimension_h}
                  onChange={(e) => setFormData({ ...formData, dimension_h: e.target.value })}
                />
              </div>
            </div>

            {formData.dimension_l && formData.dimension_w && formData.dimension_h && (
              <p className="text-sm text-muted-foreground">
                Volume: {calculateVolume(
                  parseFloat(formData.dimension_l) || 0,
                  parseFloat(formData.dimension_w) || 0,
                  parseFloat(formData.dimension_h) || 0
                ).toLocaleString()} cubic inches
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="weight_oz">Empty Box Weight (lbs)</Label>
                <Input
                  id="weight_oz"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.weight_oz}
                  onChange={(e) => setFormData({ ...formData, weight_oz: e.target.value })}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">Tare weight</p>
              </div>
              <div>
                <Label htmlFor="max_weight_oz">Max Weight Capacity (lbs)</Label>
                <Input
                  id="max_weight_oz"
                  type="number"
                  step="0.01"
                  value={formData.max_weight_oz}
                  onChange={(e) => setFormData({ ...formData, max_weight_oz: e.target.value })}
                  placeholder="Optional"
                />
                <p className="text-xs text-muted-foreground mt-1">Max total package weight</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cost_per_box">Base Cost per Box ($)</Label>
                <Input
                  id="cost_per_box"
                  type="number"
                  step="0.01"
                  value={formData.cost_per_box}
                  onChange={(e) => setFormData({ ...formData, cost_per_box: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Purchase price from supplier</p>
              </div>
              <div>
                <Label htmlFor="shipping_cost_multiplier">Inbound Freight (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="shipping_cost_multiplier"
                    type="number"
                    step="1"
                    min="0"
                    value={formData.shipping_cost_multiplier}
                    onChange={(e) => setFormData({ ...formData, shipping_cost_multiplier: e.target.value })}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Percent of base cost for inbound freight</p>
              </div>
            </div>

            {formData.cost_per_box && parseFloat(formData.cost_per_box) > 0 && (
              <div className="p-3 border rounded-lg bg-muted/30 space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Base: </span>
                  <span>${parseFloat(formData.cost_per_box).toFixed(2)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Inbound Freight: </span>
                  <span>{formData.shipping_cost_multiplier || "0"}%</span>
                </p>
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground">Effective Cost: </span>
                  <span>
                    ${(parseFloat(formData.cost_per_box) * percentToMultiplier(parseFloat(formData.shipping_cost_multiplier) || 0)).toFixed(2)}
                  </span>
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div>
              <Label>Box Image</Label>
              <div className="mt-2">
                {formData.image_url ? (
                  <div className="relative inline-block">
                    <img
                      src={formData.image_url}
                      alt="Box preview"
                      className="h-24 w-24 rounded-lg object-cover border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={removeImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || processingImage}
                    >
                      {processingImage ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Image
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">Optional. Max 2MB. Image will be centered on white background.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Active (available for recommendations)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingBox ? "Update" : "Add Box"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Box Size?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBox?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
