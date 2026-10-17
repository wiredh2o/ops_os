import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface RepairOrderFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const RepairOrderForm: React.FC<RepairOrderFormProps> = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    priority: 'normal',
    item_description: '',
    problem_description: '',
    repair_cost: '',
    estimated_completion: '',
    customer_company_id: '',
  });
  const [companies, setCompanies] = useState<{ id: string; name: string; }[]>([]);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };
  const { toast } = useToast();

  const generateRepairNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `RPR${year}${month}${day}${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name.trim() || !formData.item_description.trim() || !formData.problem_description.trim()) {
      toast({
        title: "Error",
        description: "Customer name, item description, and problem description are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const repairData = {
        repair_number: generateRepairNumber(),
        customer_name: formData.customer_name.trim(),
        customer_email: formData.customer_email.trim() || null,
        customer_phone: formData.customer_phone.trim() || null,
        customer_company_id: formData.customer_company_id || null,
        priority: formData.priority,
        item_description: formData.item_description.trim(),
        problem_description: formData.problem_description.trim(),
        repair_cost: formData.repair_cost ? parseFloat(formData.repair_cost) : null,
        estimated_completion: formData.estimated_completion || null,
        created_by: user.id,
      };

      const { error } = await supabase
        .from('repair_orders')
        .insert([repairData]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Repair order created successfully",
      });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create repair order: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Repair Order</DialogTitle>
          <DialogDescription>Enter customer and repair details to create a new repair order.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="customer_name">Customer Name *</Label>
            <Input
              id="customer_name"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="customer_email">Customer Email</Label>
            <Input
              id="customer_email"
              type="email"
              value={formData.customer_email}
              onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="customer_phone">Customer Phone</Label>
            <Input
              id="customer_phone"
              type="tel"
              value={formData.customer_phone}
              onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="customer_company">Customer Company</Label>
            <Select 
              value={formData.customer_company_id} 
              onValueChange={(value) => setFormData({ ...formData, customer_company_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="item_description">Item Description *</Label>
            <Input
              id="item_description"
              value={formData.item_description}
              onChange={(e) => setFormData({ ...formData, item_description: e.target.value })}
              placeholder="e.g., Motor Assembly, Control Panel"
              required
            />
          </div>

          <div>
            <Label htmlFor="problem_description">Problem Description *</Label>
            <Textarea
              id="problem_description"
              value={formData.problem_description}
              onChange={(e) => setFormData({ ...formData, problem_description: e.target.value })}
              placeholder="Describe the issue in detail..."
              rows={3}
              required
            />
          </div>

          <div>
            <Label htmlFor="priority">Priority</Label>
            <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="repair_cost">Estimated Repair Cost ($)</Label>
            <Input
              id="repair_cost"
              type="number"
              step="0.01"
              value={formData.repair_cost}
              onChange={(e) => setFormData({ ...formData, repair_cost: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="estimated_completion">Estimated Completion</Label>
            <Input
              id="estimated_completion"
              type="date"
              value={formData.estimated_completion}
              onChange={(e) => setFormData({ ...formData, estimated_completion: e.target.value })}
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {loading ? 'Creating...' : 'Create Repair Order'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};