import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface PriceLevel {
  id: string;
  name: string;
  description?: string;
  discount_percentage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface PriceLevelFormProps {
  priceLevel?: PriceLevel | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function PriceLevelForm({ priceLevel, onClose, onSuccess }: PriceLevelFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    discount_percentage: 0,
    is_active: true,
  });

  useEffect(() => {
    if (priceLevel) {
      setFormData({
        name: priceLevel.name || '',
        description: priceLevel.description || '',
        discount_percentage: priceLevel.discount_percentage || 0,
        is_active: priceLevel.is_active,
      });
    }
  }, [priceLevel]);

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to perform this action',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Price level name is required',
        variant: 'destructive',
      });
      return;
    }

    if (formData.discount_percentage < 0 || formData.discount_percentage > 100) {
      toast({
        title: 'Error',
        description: 'Discount percentage must be between 0 and 100',
        variant: 'destructive',
      });
      return;
    }

    try {
      const updateData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        discount_percentage: formData.discount_percentage,
        is_active: formData.is_active,
      };

      if (priceLevel) {
        const { error } = await supabase
          .from('price_levels')
          .update(updateData)
          .eq('id', priceLevel.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Price level updated successfully',
        });
      } else {
        const { error } = await supabase
          .from('price_levels')
          .insert({
            ...updateData,
            created_by: user.id,
          });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Price level created successfully',
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving price level:', error);
      toast({
        title: 'Error',
        description: 'Failed to save price level',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {priceLevel ? 'Edit Price Level' : 'Add New Price Level'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter price level name"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter description (optional)"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="discount_percentage">Discount Percentage *</Label>
            <Input
              id="discount_percentage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.discount_percentage}
              onChange={(e) => setFormData({ ...formData, discount_percentage: parseFloat(e.target.value) || 0 })}
              placeholder="Enter discount percentage (0-100)"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="flex-1">
            {priceLevel ? 'Update' : 'Create'} Price Level
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}