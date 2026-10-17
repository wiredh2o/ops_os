import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { SHIPPING_CARRIERS, getShippingMethodsForCarrier } from '@/lib/shipping-carrier-options';
import { VendorShippingAddressFields } from './VendorShippingAddressFields';

interface Vendor {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  lead_time_days: number;
  is_active: boolean;
  payment_terms?: string;
  tax_id?: string;
  notes?: string;
  default_shipping_carrier?: string | null;
  default_shipping_method?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
}

interface VendorFormProps {
  vendor?: Vendor | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function VendorForm({ vendor, onClose, onSuccess }: VendorFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    lead_time_days: 14,
    is_active: true,
    payment_terms: '',
    tax_id: '',
    notes: '',
    default_shipping_carrier: '',
    default_shipping_method: '',
    shipping_city: '',
    shipping_state: '',
    shipping_postal_code: '',
    shipping_country: 'US',
  });

  useEffect(() => {
    if (vendor) {
      setFormData({
        name: vendor.name || '',
        contact_person: vendor.contact_person || '',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.address || '',
        lead_time_days: vendor.lead_time_days || 14,
        is_active: vendor.is_active,
        payment_terms: vendor.payment_terms || '',
        tax_id: vendor.tax_id || '',
        notes: vendor.notes || '',
        default_shipping_carrier: vendor.default_shipping_carrier || '',
        default_shipping_method: vendor.default_shipping_method || '',
        shipping_city: vendor.shipping_city || '',
        shipping_state: vendor.shipping_state || '',
        shipping_postal_code: vendor.shipping_postal_code || '',
        shipping_country: vendor.shipping_country || 'US',
      });
    }
  }, [vendor]);

  const handleCarrierChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      default_shipping_carrier: value,
      default_shipping_method: '', // Reset method when carrier changes
    }));
  };

  const availableMethods = getShippingMethodsForCarrier(formData.default_shipping_carrier);

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
        description: 'Vendor name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (vendor) {
        // Update existing vendor
        const { error } = await supabase
          .from('suppliers')
          .update({
            name: formData.name,
            contact_person: formData.contact_person || null,
            email: formData.email || null,
            phone: formData.phone || null,
            address: formData.address || null,
            lead_time_days: formData.lead_time_days,
            is_active: formData.is_active,
            payment_terms: formData.payment_terms || null,
            tax_id: formData.tax_id || null,
            notes: formData.notes || null,
            default_shipping_carrier: formData.default_shipping_carrier || null,
            default_shipping_method: formData.default_shipping_method || null,
            shipping_city: formData.shipping_city || null,
            shipping_state: formData.shipping_state || null,
            shipping_postal_code: formData.shipping_postal_code || null,
            shipping_country: formData.shipping_country || 'US',
          })
          .eq('id', vendor.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Vendor updated successfully',
        });
      } else {
        // Create new vendor
        const { error } = await supabase
          .from('suppliers')
          .insert({
            name: formData.name,
            contact_person: formData.contact_person || null,
            email: formData.email || null,
            phone: formData.phone || null,
            address: formData.address || null,
            lead_time_days: formData.lead_time_days,
            is_active: formData.is_active,
            payment_terms: formData.payment_terms || null,
            tax_id: formData.tax_id || null,
            notes: formData.notes || null,
            default_shipping_carrier: formData.default_shipping_carrier || null,
            default_shipping_method: formData.default_shipping_method || null,
            shipping_city: formData.shipping_city || null,
            shipping_state: formData.shipping_state || null,
            shipping_postal_code: formData.shipping_postal_code || null,
            shipping_country: formData.shipping_country || 'US',
            created_by: user.id,
          });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Vendor created successfully',
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving vendor:', error);
      toast({
        title: 'Error',
        description: 'Failed to save vendor',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Vendor Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter vendor name"
            />
          </div>

          <div>
            <Label htmlFor="contact_person">Contact Person</Label>
            <Input
              id="contact_person"
              value={formData.contact_person}
              onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              placeholder="Enter contact person name"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Enter phone number"
            />
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Enter vendor address"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="lead_time_days">Lead Time (Days)</Label>
            <Input
              id="lead_time_days"
              type="number"
              value={formData.lead_time_days}
              onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 14 })}
              placeholder="14"
            />
          </div>

          <div>
            <Label htmlFor="payment_terms">Payment Terms</Label>
            <Input
              id="payment_terms"
              value={formData.payment_terms}
              onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
              placeholder="e.g., Net 30"
            />
          </div>

          <div>
            <Label htmlFor="tax_id">Tax ID</Label>
            <Input
              id="tax_id"
              value={formData.tax_id}
              onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
              placeholder="Enter tax ID"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about the vendor"
              rows={3}
            />
          </div>

          {/* Shipping Origin Address for Rate Calculation */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <VendorShippingAddressFields
              shippingCity={formData.shipping_city}
              shippingState={formData.shipping_state}
              shippingPostalCode={formData.shipping_postal_code}
              shippingCountry={formData.shipping_country}
              onShippingCityChange={(value) => setFormData({ ...formData, shipping_city: value })}
              onShippingStateChange={(value) => setFormData({ ...formData, shipping_state: value })}
              onShippingPostalCodeChange={(value) => setFormData({ ...formData, shipping_postal_code: value })}
              onShippingCountryChange={(value) => setFormData({ ...formData, shipping_country: value })}
            />
          </div>

          {/* Shipping Preferences */}
          <div className="space-y-2">
            <Label>Default Shipping Preference</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select 
                value={formData.default_shipping_carrier} 
                onValueChange={handleCarrierChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Carrier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {SHIPPING_CARRIERS.map((carrier) => (
                    <SelectItem key={carrier.value} value={carrier.value}>
                      {carrier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select 
                value={formData.default_shipping_method} 
                onValueChange={(value) => setFormData({ ...formData, default_shipping_method: value })}
                disabled={!formData.default_shipping_carrier}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  {availableMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Used as default when sending purchase orders to this vendor
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active">Active Vendor</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="flex-1">
              {vendor ? 'Update' : 'Create'} Vendor
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}