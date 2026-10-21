import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LaborItem {
  id: string;
  item_number: string;
  name: string;
  description?: string;
  hourly_rate: number;
  unit_of_measure: string;
  is_taxable: boolean;
}

interface LaborItemFormProps {
  item?: LaborItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const LaborItemForm = ({ item, onClose, onSuccess }: LaborItemFormProps) => {
  const [formData, setFormData] = useState({
    item_number: item?.item_number || '',
    name: item?.name || '',
    description: item?.description || '',
    hourly_rate: item?.hourly_rate?.toString() || '',
    unit_of_measure: item?.unit_of_measure || 'hour',
    is_taxable: item?.is_taxable || false,
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const data = {
        item_number: formData.item_number.trim(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        hourly_rate: parseFloat(formData.hourly_rate),
        unit_of_measure: formData.unit_of_measure,
        is_taxable: formData.is_taxable,
        created_by: user.id,
      };

      if (item) {
        // Update existing item
        const { error } = await supabase
          .from('labor_items')
          .update(data)
          .eq('id', item.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Labor item updated successfully",
        });
      } else {
        // Create new item
        const { error } = await supabase
          .from('labor_items')
          .insert([data]);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Labor item created successfully",
        });
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving labor item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save labor item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit Labor Item' : 'Add Labor Item'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item_number">Item Number *</Label>
            <Input
              id="item_number"
              value={formData.item_number}
              onChange={(e) => setFormData(prev => ({ ...prev, item_number: e.target.value }))}
              placeholder="Enter item number"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter labor item name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter description (optional)"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hourly_rate">Rate *</Label>
              <FinancialGuard kind="revenue"><Input
                id="hourly_rate"
                type="number"
                step="0.0001"
                min="0"
                value={formData.hourly_rate}
                onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: e.target.value }))}
                placeholder="0.00"
                required
              /></FinancialGuard>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit_of_measure">Unit of Measure</Label>
              <Select
                value={formData.unit_of_measure}
                onValueChange={(value) => setFormData(prev => ({ ...prev, unit_of_measure: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="job">Job</SelectItem>
                  <SelectItem value="each">Each</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_taxable"
              checked={formData.is_taxable}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_taxable: checked }))}
            />
            <Label htmlFor="is_taxable">Taxable (Note: Labor is typically non-taxable)</Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : item ? "Update Item" : "Create Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};