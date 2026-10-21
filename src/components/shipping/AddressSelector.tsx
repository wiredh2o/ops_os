import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Check, Star, Plus, Pencil } from 'lucide-react';

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
  /** Present on distributor-owned drop-ship addresses. */
  recipient_name?: string;
  usps_eligible?: boolean;
  drop_ship?: boolean;
  email?: string | null;
  phone?: string | null;
}

interface AddressSelectorProps {
  addresses: ShippingAddress[];
  selectedAddress: ShippingAddress | null;
  defaultAddressId: string | null;
  companyName: string;
  onSelect: (address: ShippingAddress) => void;
  onSetDefault: (addressId: string) => void;
  onAddAddress: () => void;
  onEditAddress: (address: ShippingAddress) => void;
  /** Drop-ship mode: addresses are owned by the distributor, not a car-wash account. */
  dropShip?: boolean;
  hideContinue?: boolean;
}

export function AddressSelector({ 
  addresses, 
  selectedAddress, 
  defaultAddressId,
  companyName,
  onSelect, 
  onSetDefault,
  onAddAddress,
  onEditAddress,
  dropShip = false,
  hideContinue = false,
}: AddressSelectorProps) {
  if (addresses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{dropShip ? 'No Drop-Ship Addresses' : 'No Shipping Addresses'}</h3>
        <p className="text-muted-foreground mb-4">
          {dropShip ? 'This distributor has no saved drop-ship addresses yet.' : "This customer doesn't have any shipping addresses configured."}
        </p>
        <Button onClick={onAddAddress}>
          <Plus className="h-4 w-4 mr-2" />
          {dropShip ? 'Add Drop-Ship Address' : 'Add Shipping Address'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{dropShip ? 'Select Drop-Ship Address' : 'Select Shipping Address'}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={onAddAddress}>
          <Plus className="h-4 w-4 mr-2" />
          Add New
        </Button>
      </div>

      <div className="grid gap-3">
        {addresses.map((address) => {
          const isDefault = address.id === defaultAddressId;
          const isSelected = selectedAddress?.id === address.id;
          
          return (
            <Card 
              key={address.id}
              className={`cursor-pointer transition-all hover:border-primary ${
                isSelected ? 'border-2 border-primary bg-primary/5' : ''
              }`}
              onClick={() => onSelect(address)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Ship To: {address.name || 'Address'}
                      </p>
                      {isDefault && (
                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          Default
                        </Badge>
                      )}
                      {(dropShip || address.drop_ship) && <Badge variant="outline" className="text-xs">Drop-ship</Badge>}
                      {(dropShip || address.drop_ship) && <Badge variant={address.usps_eligible ? 'secondary' : 'outline'} className="text-xs">{address.usps_eligible ? 'USPS eligible' : 'No USPS'}</Badge>}
                      {address.signature_required && (
                        <Badge variant="outline" className="text-xs">Signature Required</Badge>
                      )}
                    </div>
                    <p className="font-medium">{address.recipient_name || companyName}</p>
                    <p className="text-sm text-muted-foreground">{address.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {address.city}, {address.state} {address.zip}
                    </p>
                    {(address.email || address.phone) && <p className="text-xs text-muted-foreground">Notify: {[address.email, address.phone].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditAddress(address);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    {!isDefault && !dropShip && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetDefault(address.id);
                        }}
                      >
                        Set Default
                      </Button>
                    )}
                    {isSelected && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedAddress && !hideContinue && (
        <div className="flex justify-end pt-4">
          <Button onClick={() => onSelect(selectedAddress)}>
            Continue to Shipping Rates
          </Button>
        </div>
      )}
    </div>
  );
}
