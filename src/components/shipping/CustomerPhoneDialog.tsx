import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CustomerPhoneDialogProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  onPhoneSaved: (phone: string) => void;
}

export function CustomerPhoneDialog({
  open,
  onClose,
  customerId,
  customerName,
  onPhoneSaved,
}: CustomerPhoneDialogProps) {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Format phone number as user types
  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    
    // Format as (XXX) XXX-XXXX
    if (limited.length >= 7) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    } else if (limited.length >= 4) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else if (limited.length > 0) {
      return `(${limited}`;
    }
    return '';
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const getDigitsOnly = (formatted: string) => {
    return formatted.replace(/\D/g, '');
  };

  const isValidPhone = () => {
    const digits = getDigitsOnly(phone);
    return digits.length === 10;
  };

  const handleSave = async () => {
    if (!isValidPhone()) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid 10-digit phone number',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const digits = getDigitsOnly(phone);
      
      const { error } = await supabase
        .from('companies')
        .update({ phone: digits })
        .eq('id', customerId);

      if (error) throw error;

      toast({
        title: 'Phone Number Saved',
        description: 'Customer phone number has been updated',
      });

      onPhoneSaved(digits);
    } catch (error: any) {
      console.error('Error saving phone number:', error);
      toast({
        title: 'Error',
        description: 'Failed to save phone number',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Number Required
          </DialogTitle>
          <DialogDescription>
            FedEx requires a phone number to create a shipping label.
            Please enter a phone number for this customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Customer</Label>
            <p className="font-medium">{customerName}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(555) 555-5555"
              value={phone}
              onChange={handlePhoneChange}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              This will be saved to the customer record for future orders.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !isValidPhone()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save & Continue'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
