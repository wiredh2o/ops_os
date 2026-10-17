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

interface PackingTape {
  id: string;
  name: string;
  width_inches: number;
  length_yards: number;
  cost_per_roll: number;
  shipping_cost_multiplier: number;
  supplier: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
}

interface TapeFormData {
  name: string;
  width_inches: string;
  length_yards: string;
  cost_per_roll: string;
  freight_percent: string;
  supplier: string;
  is_active: boolean;
}

const DEFAULT_FORM_DATA: TapeFormData = {
  name: "",
  width_inches: "",
  length_yards: "",
  cost_per_roll: "",
  freight_percent: "0",
  supplier: "",
  is_active: true,
};

// Conversion functions
const multiplierToPercent = (multiplier: number): number => Math.round((multiplier - 1) * 100);
const percentToMultiplier = (percent: number): number => 1 + (percent / 100);

export function PackingTapeManager() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingTape, setEditingTape] = useState<PackingTape | null>(null);
  const [deletingTape, setDeletingTape] = useState<PackingTape | null>(null);
  const [formData, setFormData] = useState<TapeFormData>(DEFAULT_FORM_DATA);

  const { data: tapes = [], isLoading } = useQuery({
    queryKey: ["packing-tapes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packing_tapes")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as PackingTape[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TapeFormData) => {
      const { error } = await supabase.from("packing_tapes").insert({
        name: data.name,
        width_inches: parseFloat(data.width_inches),
        length_yards: parseFloat(data.length_yards),
        cost_per_roll: parseFloat(data.cost_per_roll) || 0,
        shipping_cost_multiplier: percentToMultiplier(parseFloat(data.freight_percent) || 0),
        supplier: data.supplier || null,
        is_active: data.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-tapes"] });
      toast.success("Packing tape added");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Failed to add tape: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TapeFormData }) => {
      const { error } = await supabase
        .from("packing_tapes")
        .update({
          name: data.name,
          width_inches: parseFloat(data.width_inches),
          length_yards: parseFloat(data.length_yards),
          cost_per_roll: parseFloat(data.cost_per_roll) || 0,
          shipping_cost_multiplier: percentToMultiplier(parseFloat(data.freight_percent) || 0),
          supplier: data.supplier || null,
          is_active: data.is_active,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-tapes"] });
      toast.success("Packing tape updated");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Failed to update tape: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("packing_tapes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-tapes"] });
      toast.success("Packing tape deleted");
      setIsDeleteDialogOpen(false);
      setDeletingTape(null);
    },
    onError: (error) => {
      toast.error("Failed to delete tape: " + error.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("packing_tapes")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packing-tapes"] });
    },
    onError: (error) => {
      toast.error("Failed to update tape: " + error.message);
    },
  });

  const handleOpenAdd = () => {
    setEditingTape(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (tape: PackingTape) => {
    setEditingTape(tape);
    setFormData({
      name: tape.name,
      width_inches: tape.width_inches.toString(),
      length_yards: tape.length_yards.toString(),
      cost_per_roll: tape.cost_per_roll.toString(),
      freight_percent: multiplierToPercent(tape.shipping_cost_multiplier).toString(),
      supplier: tape.supplier || "",
      is_active: tape.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTape(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const handleOpenDelete = (tape: PackingTape) => {
    setDeletingTape(tape);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.width_inches || !formData.length_yards) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (editingTape) {
      updateMutation.mutate({ id: editingTape.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Calculate effective cost for preview
  const baseCost = parseFloat(formData.cost_per_roll) || 0;
  const freightPercent = parseFloat(formData.freight_percent) || 0;
  const effectiveCost = baseCost * percentToMultiplier(freightPercent);

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading packing tapes...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-muted-foreground">Packing Tape</h3>
        <Button size="sm" onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Tape
        </Button>
      </div>

      {tapes.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
          No packing tapes configured. Add one to track tape costs.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Width</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Base Cost</TableHead>
                <TableHead>Effective Cost</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tapes.map((tape) => {
                const tapeEffective = tape.cost_per_roll * tape.shipping_cost_multiplier;
                return (
                  <TableRow key={tape.id}>
                    <TableCell className="font-medium">{tape.name}</TableCell>
                    <TableCell>{tape.width_inches}"</TableCell>
                    <TableCell>{tape.length_yards} yds</TableCell>
                    <TableCell>${tape.cost_per_roll.toFixed(2)}</TableCell>
                    <TableCell className="font-medium">${tapeEffective.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{tape.supplier || "-"}</TableCell>
                    <TableCell>
                      <Switch
                        checked={tape.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: tape.id, is_active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenEdit(tape)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleOpenDelete(tape)}
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
            <DialogTitle>{editingTape ? "Edit Packing Tape" : "Add Packing Tape"}</DialogTitle>
            <DialogDescription>
              Configure tape specifications and cost information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Tape Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="3M 375 Heavy Duty"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="width">Width (inches) *</Label>
                  <Input
                    id="width"
                    type="number"
                    step="0.25"
                    min="0"
                    value={formData.width_inches}
                    onChange={(e) => setFormData({ ...formData, width_inches: e.target.value })}
                    placeholder="2"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="length">Roll Length (yards) *</Label>
                  <Input
                    id="length"
                    type="number"
                    step="1"
                    min="0"
                    value={formData.length_yards}
                    onChange={(e) => setFormData({ ...formData, length_yards: e.target.value })}
                    placeholder="110"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cost">Base Cost ($ per roll)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost_per_roll}
                    onChange={(e) => setFormData({ ...formData, cost_per_roll: e.target.value })}
                    placeholder="4.50"
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
                    <span>${baseCost.toFixed(2)}/roll</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Inbound Freight: </span>
                    <span>{freightPercent}%</span>
                  </p>
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground">Effective Cost: </span>
                    <span>${effectiveCost.toFixed(2)}/roll</span>
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
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editingTape ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Packing Tape</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTape?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTape && deleteMutation.mutate(deletingTape.id)}
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
