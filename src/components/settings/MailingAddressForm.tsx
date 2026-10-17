import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/useCompanySettings";
import { US_STATES } from "@/lib/us-states";

export function MailingAddressForm() {
  const { data: settings } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();

  const [sameAsShipFrom, setSameAsShipFrom] = useState(true);
  const [formData, setFormData] = useState({
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
  });

  useEffect(() => {
    if (settings) {
      setSameAsShipFrom(settings.mailingSameAsShipFrom);
      setFormData({
        street1: settings.mailingAddress.street1 || "",
        street2: settings.mailingAddress.street2 || "",
        city: settings.mailingAddress.city || "",
        state: settings.mailingAddress.state || "",
        zip: settings.mailingAddress.zip || "",
      });
    }
  }, [settings]);

  const handleToggleSameAs = async (checked: boolean) => {
    setSameAsShipFrom(checked);
    await updateSettings.mutateAsync({
      mailing_same_as_ship_from: checked ? "true" : "false",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      mailing_street1: formData.street1,
      mailing_street2: formData.street2,
      mailing_city: formData.city,
      mailing_state: formData.state,
      mailing_zip: formData.zip,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="sameAsShipFrom">Same as Ship-From Address</Label>
          <p className="text-xs text-muted-foreground">
            Use the warehouse address for all correspondence
          </p>
        </div>
        <Switch
          id="sameAsShipFrom"
          checked={sameAsShipFrom}
          onCheckedChange={handleToggleSameAs}
        />
      </div>

      {!sameAsShipFrom && (
        <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="mailingStreet1">Street Address *</Label>
            <Input
              id="mailingStreet1"
              value={formData.street1}
              onChange={(e) => setFormData((prev) => ({ ...prev, street1: e.target.value }))}
              placeholder="P.O. Box 1234"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailingStreet2">Street Address Line 2</Label>
            <Input
              id="mailingStreet2"
              value={formData.street2}
              onChange={(e) => setFormData((prev) => ({ ...prev, street2: e.target.value }))}
              placeholder="Suite 100"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="mailingCity">City *</Label>
              <Input
                id="mailingCity"
                value={formData.city}
                onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="Dallas"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailingState">State *</Label>
              <Select
                value={formData.state}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, state: value }))}
              >
                <SelectTrigger id="mailingState">
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
            <div className="space-y-2">
              <Label htmlFor="mailingZip">ZIP Code *</Label>
              <Input
                id="mailingZip"
                value={formData.zip}
                onChange={(e) => setFormData((prev) => ({ ...prev, zip: e.target.value }))}
                placeholder="75201"
                required
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Mailing Address"}
            </Button>
          </div>
        </form>
      )}

      {sameAsShipFrom && settings?.shipFromAddress && (
        <div className="p-4 bg-muted/50 rounded-lg text-sm">
          <p className="font-medium">{settings.shipFromAddress.companyName || "Not set"}</p>
          <p>{settings.shipFromAddress.street1 || "Address not configured"}</p>
          {settings.shipFromAddress.street2 && <p>{settings.shipFromAddress.street2}</p>}
          <p>
            {settings.shipFromAddress.city}, {settings.shipFromAddress.state} {settings.shipFromAddress.zip}
          </p>
        </div>
      )}
    </div>
  );
}
