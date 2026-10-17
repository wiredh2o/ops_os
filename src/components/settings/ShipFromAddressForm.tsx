import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/useCompanySettings";
import { US_STATES } from "@/lib/us-states";

export function ShipFromAddressForm() {
  const { data: settings } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();

  const [formData, setFormData] = useState({
    contactName: "",
    companyName: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
  });

  useEffect(() => {
    if (settings?.shipFromAddress) {
      setFormData({
        contactName: settings.shipFromAddress.contactName || "",
        companyName: settings.shipFromAddress.companyName || "",
        street1: settings.shipFromAddress.street1 || "",
        street2: settings.shipFromAddress.street2 || "",
        city: settings.shipFromAddress.city || "",
        state: settings.shipFromAddress.state || "",
        zip: settings.shipFromAddress.zip || "",
        phone: settings.shipFromAddress.phone || "",
      });
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      ship_from_contact_name: formData.contactName,
      ship_from_company_name: formData.companyName,
      ship_from_street1: formData.street1,
      ship_from_street2: formData.street2,
      ship_from_city: formData.city,
      ship_from_state: formData.state,
      ship_from_zip: formData.zip,
      ship_from_phone: formData.phone,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="shipFromContactName">Contact Name (optional)</Label>
        <Input
          id="shipFromContactName"
          value={formData.contactName}
          onChange={(e) => setFormData((prev) => ({ ...prev, contactName: e.target.value }))}
          placeholder="John Smith"
        />
        <p className="text-xs text-muted-foreground">
          This name will appear as the sender on shipping labels. Leave blank to show only the company name.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="shipFromCompanyName">Company Name (for shipping labels) *</Label>
        <Input
          id="shipFromCompanyName"
          value={formData.companyName}
          onChange={(e) => setFormData((prev) => ({ ...prev, companyName: e.target.value }))}
          placeholder="ABC Corporation"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shipFromStreet1">Street Address *</Label>
        <Input
          id="shipFromStreet1"
          value={formData.street1}
          onChange={(e) => setFormData((prev) => ({ ...prev, street1: e.target.value }))}
          placeholder="123 Warehouse Drive"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shipFromStreet2">Street Address Line 2</Label>
        <Input
          id="shipFromStreet2"
          value={formData.street2}
          onChange={(e) => setFormData((prev) => ({ ...prev, street2: e.target.value }))}
          placeholder="Suite 100, Building B"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="shipFromCity">City *</Label>
          <Input
            id="shipFromCity"
            value={formData.city}
            onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
            placeholder="Dallas"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shipFromState">State *</Label>
          <Select
            value={formData.state}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, state: value }))}
          >
            <SelectTrigger id="shipFromState">
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
          <Label htmlFor="shipFromZip">ZIP Code *</Label>
          <Input
            id="shipFromZip"
            value={formData.zip}
            onChange={(e) => setFormData((prev) => ({ ...prev, zip: e.target.value }))}
            placeholder="75201"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="shipFromPhone">Phone Number (required by FedEx) *</Label>
        <Input
          id="shipFromPhone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
          placeholder="(555) 123-4567"
          required
        />
        <p className="text-xs text-muted-foreground">
          This phone number will appear on shipping labels and may be used by carriers for delivery issues.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={updateSettings.isPending}>
          {updateSettings.isPending ? "Saving..." : "Save Ship-From Address"}
        </Button>
      </div>
    </form>
  );
}
