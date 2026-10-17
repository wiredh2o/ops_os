import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2, ShoppingBag, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { processBoxImage } from "@/lib/image/boxImageProcessor";

interface PackingBag {
  id: string;
  name: string;
  length_inches: number;
  width_inches: number;
  cost_per_bag: number;
  shipping_cost_multiplier: number;
  supplier: string | null;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
}

interface BagFormData {
  name: string;
  length_inches: string;
  width_inches: string;
  cost_per_bag: string;
  freight_percent: string;
  supplier: string;
  is_active: boolean;
  image_url: string;
}

const DEFAULT_FORM_DATA: BagFormData = {
  name: "",
  length_inches: "",
  width_inches: "",
  cost_per_bag: "",
  freight_percent: "0",
  supplier: "",
  is_active: true,
  image_url: "",
};

// Conversion functions
const multiplierToPercent = (multiplier: number): number => Math.round((multiplier - 1) * 100);
const percentToMultiplier = (percent: number): number => 1 + (percent / 100);

export function PackingBagsManager() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingBag, setEditingBag] = useState<PackingBag | null>(null);
  const [deletingBag, setDeletingBag] = useState<PackingBag | null>(null);
  const [formData, setFormData] = useState<BagFormData>(DEFAULT_FORM_DATA);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: bags = [], isLoading } = useQuery({
    queryKey: ["packing-bags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packing_bags")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as PackingBag[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: BagFormData) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) throw new Error("User not authenticated");
      
      const { error } = await supabase.from("packing_bags").insert({
        name: data.name,
        length_inches: parseFloat(data.length_inches),
        width_inches: parseFloat(data.width_inches),
        cost_per_bag: parseFloat(data.cost_per_bag) || 0,
        shipping_cost_multiplier: percentToMultiplier(parseFloat(data.freight_percent) || 0),
        supplier: data.supplier || null,
        is_active: data.is_active,
        image_url: data.image_url || null,
        created_by: userData.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-bags"] });
      toast.success("Packing bag added", { duration: 3000 });
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Failed to add bag: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: BagFormData }) => {
      const { error } = await supabase
        .from("packing_bags")
        .update({
          name: data.name,
          length_inches: parseFloat(data.length_inches),
          width_inches: parseFloat(data.width_inches),
          cost_per_bag: parseFloat(data.cost_per_bag) || 0,
          shipping_cost_multiplier: percentToMultiplier(parseFloat(data.freight_percent) || 0),
          supplier: data.supplier || null,
          is_active: data.is_active,
          image_url: data.image_url || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-bags"] });
      toast.success("Packing bag updated", { duration: 3000 });
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Failed to update bag: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("packing_bags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-bags"] });
      toast.success("Packing bag deleted", { duration: 3000 });
      setIsDeleteDialogOpen(false);
      setDeletingBag(null);
    },
    onError: (error) => {
      toast.error("Failed to delete bag: " + error.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("packing_bags")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-bags"] });
    },
    onError: (error) => {
      toast.error("Failed to update bag: " + error.message);
    },
  });

  const handleOpenAdd = () => {
    setEditingBag(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (bag: PackingBag) => {
    setEditingBag(bag);
    setFormData({
      name: bag.name,
      length_inches: bag.length_inches.toString(),
      width_inches: bag.width_inches.toString(),
      cost_per_bag: bag.cost_per_bag.toString(),
      freight_percent: multiplierToPercent(bag.shipping_cost_multiplier).toString(),
      supplier: bag.supplier || "",
      is_active: bag.is_active,
      image_url: bag.image_url || "",
    });
    setIsDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be less than 2MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    setUploading(true);
    try {
      const processedBlob = await processBoxImage(file);
      const filename = `packing-bags/${Date.now()}.png`;
      
      const { error: uploadError } = await supabase.storage
        .from("inventory-images")
        .upload(filename, processedBlob, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("inventory-images")
        .getPublicUrl(filename);

      setFormData((prev) => ({ ...prev, image_url: urlData.publicUrl }));
      toast.success("Image uploaded", { duration: 3000 });
    } catch (error: any) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload image: " + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = () => {
    setFormData((prev) => ({ ...prev, image_url: "" }));
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBag(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const handleOpenDelete = (bag: PackingBag) => {
    setDeletingBag(bag);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.length_inches || !formData.width_inches) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (editingBag) {
      updateMutation.mutate({ id: editingBag.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Calculate effective cost for preview
  const baseCost = parseFloat(formData.cost_per_bag) || 0;
  const freightPercent = parseFloat(formData.freight_percent) || 0;
  const effectiveCost = baseCost * percentToMultiplier(freightPercent);

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading packing bags...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-muted-foreground">Packing Bags</h3>
        <Button size="sm" onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Bag
        </Button>
      </div>

      {bags.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
          No packing bags configured. Add one to track bag costs.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Width</TableHead>
                <TableHead>Base Cost</TableHead>
                <TableHead>Effective Cost</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bags.map((bag) => {
                const bagEffective = bag.cost_per_bag * bag.shipping_cost_multiplier;
                return (
                  <TableRow key={bag.id}>
                    <TableCell>
                      {bag.image_url ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <img
                                src={bag.image_url}
                                alt={bag.name}
                                className="h-10 w-10 rounded object-cover cursor-pointer"
                              />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="p-0">
                              <img
                                src={bag.image_url}
                                alt={bag.name}
                                className="h-40 w-40 rounded object-contain"
                              />
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{bag.name}</TableCell>
                    <TableCell>{bag.length_inches}"</TableCell>
                    <TableCell>{bag.width_inches}"</TableCell>
                    <TableCell>${bag.cost_per_bag.toFixed(4)}</TableCell>
                    <TableCell className="font-medium">${bagEffective.toFixed(4)}</TableCell>
                    <TableCell className="text-muted-foreground">{bag.supplier || "-"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={bag.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: bag.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenEdit(bag)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleOpenDelete(bag)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBag ? "Edit Packing Bag" : "Add Packing Bag"}</DialogTitle>
            <DialogDescription>
              Configure bag specifications and cost information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Bag Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Poly Mailer 10x13"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="length">Length (inches) *</Label>
                  <Input
                    id="length"
                    type="number"
                    step="0.25"
                    min="0"
                    value={formData.length_inches}
                    onChange={(e) => setFormData({ ...formData, length_inches: e.target.value })}
                    placeholder="10"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="width">Width (inches) *</Label>
                  <Input
                    id="width"
                    type="number"
                    step="0.25"
                    min="0"
                    value={formData.width_inches}
                    onChange={(e) => setFormData({ ...formData, width_inches: e.target.value })}
                    placeholder="13"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cost">Base Cost ($ per bag)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={formData.cost_per_bag}
                    onChange={(e) => setFormData({ ...formData, cost_per_bag: e.target.value })}
                    placeholder="0.15"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="freight">Inbound Freight (%)</Label>
                  <Input
                    id="freight"
                    type="number"
                    step="1"
                    min="0"
                    value={formData.freight_percent}
                    onChange={(e) => setFormData({ ...formData, freight_percent: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Effective Cost Preview */}
              {baseCost > 0 && (
                <div className="p-3 border rounded-lg bg-muted/30 space-y-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Base: </span>
                    <span>${baseCost.toFixed(4)}/bag</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Inbound Freight: </span>
                    <span>{freightPercent}%</span>
                  </p>
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">Effective Cost: </span>
                    <span>${effectiveCost.toFixed(4)}/bag</span>
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="Uline"
                />
              </div>

              {/* Image Upload */}
              <div className="grid gap-2">
                <Label>Bag Image</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
                {formData.image_url ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={formData.image_url}
                      alt="Bag preview"
                      className="h-16 w-16 rounded object-cover border"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={removeImage}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
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
                )}
                <p className="text-xs text-muted-foreground">
                  Optional. Max 2MB. Image will be centered on white background.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editingBag ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Packing Bag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBag?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingBag && deleteMutation.mutate(deletingBag.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
