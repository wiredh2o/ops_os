import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES } from "@/lib/us-states";
import { MapPin } from "lucide-react";

interface VendorShippingAddressFieldsProps {
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
  onShippingCityChange: (value: string) => void;
  onShippingStateChange: (value: string) => void;
  onShippingPostalCodeChange: (value: string) => void;
  onShippingCountryChange: (value: string) => void;
}

export function VendorShippingAddressFields({
  shippingCity,
  shippingState,
  shippingPostalCode,
  shippingCountry,
  onShippingCityChange,
  onShippingStateChange,
  onShippingPostalCodeChange,
  onShippingCountryChange,
}: VendorShippingAddressFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="h-4 w-4" />
        Shipping Origin (for rate calculation)
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shipping-city" className="text-xs">City</Label>
          <Input
            id="shipping-city"
            value={shippingCity}
            onChange={(e) => onShippingCityChange(e.target.value)}
            placeholder="City"
          />
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="shipping-state" className="text-xs">State</Label>
          <Select value={shippingState} onValueChange={onShippingStateChange}>
            <SelectTrigger id="shipping-state">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((state) => (
                <SelectItem key={state.value} value={state.value}>
                  {state.value} - {state.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shipping-zip" className="text-xs">ZIP Code</Label>
          <Input
            id="shipping-zip"
            value={shippingPostalCode}
            onChange={(e) => onShippingPostalCodeChange(e.target.value)}
            placeholder="ZIP Code"
            maxLength={10}
          />
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="shipping-country" className="text-xs">Country</Label>
          <Select value={shippingCountry} onValueChange={onShippingCountryChange}>
            <SelectTrigger id="shipping-country">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="CA">Canada</SelectItem>
              <SelectItem value="MX">Mexico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground">
        Used to calculate drop-ship freight rates from this vendor
      </p>
    </div>
  );
}
