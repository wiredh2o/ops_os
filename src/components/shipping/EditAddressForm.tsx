import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, MapPin, X, Trash2 } from 'lucide-react';
import { US_STATES } from '@/lib/us-states';

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
  is_taxable?: boolean;
  usps_eligible?: boolean;
  email?: string | null;
  phone?: string | null;
}

interface EditAddressFormProps {
  address: ShippingAddress;
  isDefault: boolean;
  canDelete: boolean;
  onSave: (address: ShippingAddress, setAsDefault: boolean) => Promise<void>;
  onDelete: (addressId: string) => Promise<void>;
  onCancel: () => void;
  /** Distributor-owned drop-ship address: not tied to a car-wash account. */
  dropShip?: boolean;
}

export function EditAddressForm({ 
  address, 
  isDefault, 
  canDelete,
  onSave, 
  onDelete, 
  onCancel,
  dropShip = false,
}: EditAddressFormProps) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [setAsDefault, setSetAsDefault] = useState(isDefault);
  const [formData, setFormData] = useState({
    is_taxable: address.is_taxable !== false,
    id: address.id,
    name: address.name || '',
    address: address.address || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || '',
    country: address.country || 'US',
    signature_required: address.signature_required || false,
    usps_eligible: address.usps_eligible === true,
    email: address.email || '',
    phone: address.phone || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.address || !formData.city || !formData.state || !formData.zip) {
      return;
    }

    setSaving(true);
    try {
      await onSave(formData, setAsDefault);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(address.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {dropShip ? 'Edit Drop-Ship Address' : 'Edit Shipping Address'}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{dropShip ? 'Car wash name (label recipient)' : 'Location Name'}</Label>
            <Input
              id="name"
              placeholder={dropShip ? "e.g., Sparkle Car Wash" : "e.g., Main Store, Warehouse"}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              placeholder="123 Main Street"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="state">State</Label>
              <Select 
                value={formData.state} 
                onValueChange={(value) => setFormData({ ...formData, state: value })}
              >
                <SelectTrigger id="state">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((state) => (
                    <SelectItem key={state.value} value={state.value}>
                      {state.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                placeholder="12345"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2"><Switch id="edit-address-taxable" checked={formData.is_taxable} onCheckedChange={is_taxable => setFormData({ ...formData, is_taxable })}/><Label htmlFor="edit-address-taxable">Taxable ship-to address</Label></div>

          {dropShip && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2"><Switch id="edit-usps-eligible" checked={formData.usps_eligible} onCheckedChange={usps_eligible => setFormData({ ...formData, usps_eligible })}/><Label htmlFor="edit-usps-eligible">USPS eligible</Label></div>
              <p className="text-xs text-muted-foreground">USPS cannot be selected for this address until it is flagged USPS eligible.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="edit-ds-email">Notification email (optional)</Label><Input id="edit-ds-email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}/></div>
                <div className="space-y-2"><Label htmlFor="edit-ds-phone">Notification phone (optional)</Label><Input id="edit-ds-phone" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}/></div>
              </div>
              <p className="text-xs text-muted-foreground">If an email or phone is entered, a shipment notice is sent to each one provided.</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="signature"
                checked={formData.signature_required}
                onCheckedChange={(checked) => setFormData({ ...formData, signature_required: checked })}
              />
              <Label htmlFor="signature" className="text-sm">Signature Required</Label>
            </div>
            
            {!dropShip && <div className="flex items-center space-x-2">
              <Checkbox 
                id="setDefault" 
                checked={setAsDefault}
                onCheckedChange={(checked) => setSetAsDefault(checked === true)}
              />
              <Label htmlFor="setDefault" className="text-sm">Set as default address</Label>
            </div>}
          </div>

          <div className="flex gap-2 pt-2">
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="icon" disabled={saving || deleting}>
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Address?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{formData.name}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving || deleting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving || deleting}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
