import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Building2, ChevronDown, ChevronUp, FileText, Globe, Mail, Phone } from "lucide-react";
import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/useCompanySettings";
import { ShipFromAddressForm } from "./ShipFromAddressForm";
import { MailingAddressForm } from "./MailingAddressForm";
import { TaxComplianceForm } from "./TaxComplianceForm";

export function CompanyProfileSettings() {
  const { data: settings, isLoading } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();

  const [businessInfoOpen, setBusinessInfoOpen] = useState(true);
  const [shipFromOpen, setShipFromOpen] = useState(true);
  const [mailingOpen, setMailingOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);

  const [formData, setFormData] = useState({
    legalName: "",
    dba: "",
    phone: "",
    email: "",
    website: "",
  });

  useEffect(() => {
    if (settings?.companyInfo) {
      setFormData({
        legalName: settings.companyInfo.legalName || "",
        dba: settings.companyInfo.dba || "",
        phone: settings.companyInfo.phone || "",
        email: settings.companyInfo.email || "",
        website: settings.companyInfo.website || "",
      });
    }
  }, [settings]);

  const handleSubmitBusinessInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      company_legal_name: formData.legalName,
      company_dba: formData.dba,
      company_phone: formData.phone,
      company_email: formData.email,
      company_website: formData.website,
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading company settings...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Business Information */}
      <Collapsible open={businessInfoOpen} onOpenChange={setBusinessInfoOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Business Information</CardTitle>
                    <CardDescription>Legal name, contact details, and website</CardDescription>
                  </div>
                </div>
                {businessInfoOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <form onSubmit={handleSubmitBusinessInfo} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="legalName">Company Legal Name *</Label>
                    <Input
                      id="legalName"
                      value={formData.legalName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, legalName: e.target.value }))}
                      placeholder="ABC Corporation"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dba">DBA (Doing Business As)</Label>
                    <Input
                      id="dba"
                      value={formData.dba}
                      onChange={(e) => setFormData((prev) => ({ ...prev, dba: e.target.value }))}
                      placeholder="ABC Co"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessPhone" className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Business Phone *
                    </Label>
                    <Input
                      id="businessPhone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="(555) 123-4567"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessEmail" className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Business Email *
                    </Label>
                    <Input
                      id="businessEmail"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="contact@company.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website" className="flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Website URL
                  </Label>
                  <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
                    placeholder="https://www.company.com"
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={updateSettings.isPending}>
                    {updateSettings.isPending ? "Saving..." : "Save Business Info"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Ship-From Address */}
      <Collapsible open={shipFromOpen} onOpenChange={setShipFromOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Ship-From Address</CardTitle>
                    <CardDescription>Primary warehouse address for shipping labels (required for FedEx)</CardDescription>
                  </div>
                </div>
                {shipFromOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <ShipFromAddressForm />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Mailing Address */}
      <Collapsible open={mailingOpen} onOpenChange={setMailingOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Mailing Address</CardTitle>
                    <CardDescription>Address for correspondence (if different from ship-from)</CardDescription>
                  </div>
                </div>
                {mailingOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <MailingAddressForm />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Tax & Compliance */}
      <Collapsible open={taxOpen} onOpenChange={setTaxOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Tax & Compliance</CardTitle>
                    <CardDescription>EIN, Tax IDs, and Sales Tax License</CardDescription>
                  </div>
                </div>
                {taxOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <TaxComplianceForm />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
