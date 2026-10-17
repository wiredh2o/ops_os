import { useState } from "react";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PackingPaper {
  id: string;
  name: string;
  width_inches: number;
  weight_oz_per_foot: number;
  cost_per_foot: number;
  shipping_cost_multiplier: number;
  supplier: string | null;
  is_active: boolean;
  cubic_inches_per_linear_inch: number;
  created_at: string;
  created_by: string;
  updated_at: string;
}

interface PaperFormData {
  name: string;
  width_inches: string;
  weight_oz_per_foot: string;
  cost_per_foot: string;
  freight_percent: string;
  supplier: string;
  is_active: boolean;
  cubic_inches_per_linear_inch: string;
}

const DEFAULT_FORM_DATA: PaperFormData = {
  name: "",
  width_inches: "24",
  weight_oz_per_foot: "",
  cost_per_foot: "",
  freight_percent: "0",
  supplier: "",
  is_active: true,
  cubic_inches_per_linear_inch: "3.6",
};

// Conversion functions
const multiplierToPercent = (multiplier: number): number => Math.round((multiplier - 1) * 100);
const percentToMultiplier = (percent: number): number => 1 + (percent / 100);

export function PackingPaperManager() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingPaper, setEditingPaper] = useState<PackingPaper | null>(null);
  const [deletingPaper, setDeletingPaper] = useState<PackingPaper | null>(null);
  const [formData, setFormData] = useState<PaperFormData>(DEFAULT_FORM_DATA);

  const { data: papers = [], isLoading } = useQuery({
    queryKey: ["packing-papers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packing_papers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as PackingPaper[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PaperFormData) => {
      const { error } = await supabase.from("packing_papers").insert({
        name: data.name,
        width_inches: parseFloat(data.width_inches),
        weight_oz_per_foot: parseFloat(data.weight_oz_per_foot),
        cost_per_foot: parseFloat(data.cost_per_foot) || 0,
        shipping_cost_multiplier: percentToMultiplier(parseFloat(data.freight_percent) || 0),
        supplier: data.supplier || null,
        is_active: data.is_active,
        cubic_inches_per_linear_inch: parseFloat(data.cubic_inches_per_linear_inch),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-papers"] });
      toast.success("Packing paper added");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Failed to add paper: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PaperFormData }) => {
      const { error } = await supabase
        .from("packing_papers")
        .update({
          name: data.name,
          width_inches: parseFloat(data.width_inches),
          weight_oz_per_foot: parseFloat(data.weight_oz_per_foot),
          cost_per_foot: parseFloat(data.cost_per_foot) || 0,
          shipping_cost_multiplier: percentToMultiplier(parseFloat(data.freight_percent) || 0),
          supplier: data.supplier || null,
          is_active: data.is_active,
          cubic_inches_per_linear_inch: parseFloat(data.cubic_inches_per_linear_inch),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-papers"] });
      toast.success("Packing paper updated");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Failed to update paper: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("packing_papers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-papers"] });
      toast.success("Packing paper deleted");
      setIsDeleteDialogOpen(false);
      setDeletingPaper(null);
    },
    onError: (error) => {
      toast.error("Failed to delete paper: " + error.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("packing_papers")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-papers"] });
    },
    onError: (error) => {
      toast.error("Failed to update paper: " + error.message);
    },
  });

  const handleOpenAdd = () => {
    setEditingPaper(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (paper: PackingPaper) => {
    setEditingPaper(paper);
    setFormData({
      name: paper.name,
      width_inches: paper.width_inches.toString(),
      weight_oz_per_foot: paper.weight_oz_per_foot.toString(),
      cost_per_foot: paper.cost_per_foot.toString(),
      freight_percent: multiplierToPercent(paper.shipping_cost_multiplier).toString(),
      supplier: paper.supplier || "",
      is_active: paper.is_active,
      cubic_inches_per_linear_inch: paper.cubic_inches_per_linear_inch.toString(),
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPaper(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const handleOpenDelete = (paper: PackingPaper) => {
    setDeletingPaper(paper);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.width_inches || !formData.weight_oz_per_foot || !formData.cubic_inches_per_linear_inch) {
      toast.error("Please fill in all required fields");
      return;
    }
    const fillRatio = parseFloat(formData.cubic_inches_per_linear_inch);
    if (isNaN(fillRatio) || fillRatio <= 0) {
      toast.error("Fill ratio must be a positive number");
      return;
    }
    if (editingPaper) {
      updateMutation.mutate({ id: editingPaper.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Calculate effective cost for preview
  const baseCost = parseFloat(formData.cost_per_foot) || 0;
  const freightPercent = parseFloat(formData.freight_percent) || 0;
  const effectiveCost = baseCost * percentToMultiplier(freightPercent);

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading packing papers...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Paper
        </Button>
      </div>

      {papers.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
          No packing papers configured. Add one to track paper filler costs.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Width</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Fill Ratio</TableHead>
                <TableHead>Base Cost</TableHead>
                <TableHead>Effective Cost</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {papers.map((paper) => {
                const paperEffective = paper.cost_per_foot * paper.shipping_cost_multiplier;
                return (
                  <TableRow key={paper.id}>
                    <TableCell className="font-medium">{paper.name}</TableCell>
                    <TableCell>{paper.width_inches}"</TableCell>
                    <TableCell>{paper.weight_oz_per_foot} oz/ft</TableCell>
                    <TableCell>{paper.cubic_inches_per_linear_inch} cu in/in</TableCell>
                    <TableCell>${paper.cost_per_foot.toFixed(4)}/ft</TableCell>
                    <TableCell className="font-medium">${paperEffective.toFixed(4)}/ft</TableCell>
                    <TableCell className="text-muted-foreground">{paper.supplier || "-"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={paper.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: paper.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenEdit(paper)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleOpenDelete(paper)}
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
            <DialogTitle>{editingPaper ? "Edit Packing Paper" : "Add Packing Paper"}</DialogTitle>
            <DialogDescription>
              Configure paper filler specifications and cost information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Paper Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Kraft Paper 24&quot;"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="width">Width (inches) *</Label>
                  <Input
                    id="width"
                    type="number"
                    step="1"
                    min="0"
                    value={formData.width_inches}
                    onChange={(e) => setFormData({ ...formData, width_inches: e.target.value })}
                    placeholder="24"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="weight">Weight (oz per foot) *</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.weight_oz_per_foot}
                    onChange={(e) => setFormData({ ...formData, weight_oz_per_foot: e.target.value })}
                    placeholder="0.5"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="fill-ratio">Fill Ratio (cu in / linear in) *</Label>
                <Input
                  id="fill-ratio"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={formData.cubic_inches_per_linear_inch}
                  onChange={(e) => setFormData({ ...formData, cubic_inches_per_linear_inch: e.target.value })}
                  placeholder="3.6"
                />
                <p className="text-xs text-muted-foreground">
                  How many cubic inches of void space 1 linear inch of this paper fills when crunched
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cost">Base Cost ($ per foot)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={formData.cost_per_foot}
                    onChange={(e) => setFormData({ ...formData, cost_per_foot: e.target.value })}
                    placeholder="0.0367"
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
                    <span>${baseCost.toFixed(4)}/ft</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Inbound Freight: </span>
                    <span>{freightPercent}%</span>
                  </p>
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">Effective Cost: </span>
                    <span>${effectiveCost.toFixed(4)}/ft</span>
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

              <div className="flex items-center gap-2">
                <Switch
                  id="active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="active">Active</Label>
              </div>

              <div className="p-3 border rounded-lg bg-muted/50 space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>How to calculate paper cost:</strong> Divide the cost of a roll by the number of feet.
                </p>
                <p className="text-sm text-muted-foreground">
                  Example: A 750 ft roll costing $27.50 = <strong>$0.0367</strong>/ft
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editingPaper ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Packing Paper</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingPaper?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPaper && deleteMutation.mutate(deletingPaper.id)}
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
