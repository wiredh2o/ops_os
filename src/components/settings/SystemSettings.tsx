import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Settings, ChevronDown, ChevronUp, DollarSign, CreditCard, Truck, Mail } from "lucide-react";
import { useSystemSetting, useUpdateSystemSetting } from "@/hooks/useSystemSettings";
import { CompanyProfileSettings } from "./CompanyProfileSettings";
import { EmailTemplateManager } from "./EmailTemplateManager";
import { TaxSettings } from "./TaxSettings";
import { NotificationFailureList } from './NotificationFailureList';


export function SystemSettings() {
  const { data: stripeSetting, isLoading: stripeLoading } = useSystemSetting("stripe_publishable_key");
  const { data: fedexSetting, isLoading: fedexLoading } = useSystemSetting("carrier_fedex_enabled");
  const { data: upsSetting, isLoading: upsLoading } = useSystemSetting("carrier_ups_enabled");
  const { data: uspsSetting, isLoading: uspsLoading } = useSystemSetting("carrier_usps_enabled");
  const updateSystemSetting = useUpdateSystemSetting();
  
  const [companyOpen, setCompanyOpen] = useState(false);
  const [stripeOpen, setStripeOpen] = useState(false);
  const [carriersOpen, setCarriersOpen] = useState(false);
  const [emailTemplatesOpen, setEmailTemplatesOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    stripePublishableKey: stripeSetting?.setting_value || ""
  });

  const [carrierSettings, setCarrierSettings] = useState({
    fedex: fedexSetting?.setting_value !== "false",
    ups: upsSetting?.setting_value !== "false", 
    usps: uspsSetting?.setting_value !== "false",
  });

  useEffect(() => {
    if (stripeSetting) {
      setFormData(prev => ({
        ...prev,
        stripePublishableKey: stripeSetting.setting_value
      }));
    }
  }, [stripeSetting]);

  useEffect(() => {
    setCarrierSettings({
      fedex: fedexSetting?.setting_value !== "false",
      ups: upsSetting?.setting_value !== "false",
      usps: uspsSetting?.setting_value !== "false",
    });
  }, [fedexSetting, upsSetting, uspsSetting]);

  const handleStripeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await updateSystemSetting.mutateAsync({
      settingKey: "stripe_publishable_key",
      settingValue: formData.stripePublishableKey,
      description: "Stripe publishable key for payment processing"
    });
  };

  const handleCarrierToggle = async (carrier: 'fedex' | 'ups' | 'usps', enabled: boolean) => {
    setCarrierSettings(prev => ({ ...prev, [carrier]: enabled }));
    
    await updateSystemSetting.mutateAsync({
      settingKey: `carrier_${carrier}_enabled`,
      settingValue: enabled ? "true" : "false",
      description: `Enable ${carrier.toUpperCase()} as a shipping carrier option`
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getMaskedKey = (key: string) => {
    if (!key || key.length < 12) return key;
    return key.substring(0, 7) + '•'.repeat(key.length - 11) + key.substring(key.length - 4);
  };

  const isLoading = stripeLoading || fedexLoading || upsLoading || uspsLoading;

  if (isLoading) {
    return <div>Loading system settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">System Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure global system settings that affect all orders and estimates.
        </p>
      </div>
      <Separator />
      <NotificationFailureList />

      {/* Company Profile Section */}
      <Collapsible open={companyOpen} onOpenChange={setCompanyOpen}>
        <div className="border rounded-lg">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <div>
                  <h4 className="font-medium">Company Profile</h4>
                  <p className="text-sm text-muted-foreground">Business info, addresses, and tax compliance</p>
                </div>
              </div>
              {companyOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-4 pt-0">
              <CompanyProfileSettings />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Carrier Settings Section */}
      <Collapsible open={carriersOpen} onOpenChange={setCarriersOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Shipping Carriers</CardTitle>
                    <CardDescription>
                      Enable or disable shipping carriers for rate quotes and label creation.
                    </CardDescription>
                  </div>
                </div>
                {carriersOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Only enabled carriers will appear in the shipping rate comparison and be available for creating shipping labels.
              </p>
              
              <div className="space-y-4">
                {/* FedEx */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-[120px] flex-shrink-0 flex items-center justify-center">
                      <img 
                        src="/carrier-logos/fedex-logo.png" 
                        alt="FedEx" 
                        className="h-10 w-auto object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fedex-toggle" className="font-medium">FedEx</Label>
                      <p className="text-xs text-muted-foreground">Express and Ground shipping services</p>
                    </div>
                  </div>
                  <Switch
                    id="fedex-toggle"
                    checked={carrierSettings.fedex}
                    onCheckedChange={(checked) => handleCarrierToggle('fedex', checked)}
                    disabled={updateSystemSetting.isPending}
                  />
                </div>

                {/* UPS */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-[120px] flex-shrink-0 flex items-center justify-center">
                      <img 
                        src="/carrier-logos/ups-logo-new.png" 
                        alt="UPS" 
                        className="h-10 w-auto object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ups-toggle" className="font-medium">UPS</Label>
                      <p className="text-xs text-muted-foreground">Next Day Air, Ground, and more</p>
                    </div>
                  </div>
                  <Switch
                    id="ups-toggle"
                    checked={carrierSettings.ups}
                    onCheckedChange={(checked) => handleCarrierToggle('ups', checked)}
                    disabled={updateSystemSetting.isPending}
                  />
                </div>

                {/* USPS */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-[120px] flex-shrink-0 flex items-center justify-center">
                      <img 
                        src="/carrier-logos/usps-logo-new.png" 
                        alt="USPS" 
                        className="h-10 w-auto object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="usps-toggle" className="font-medium">USPS</Label>
                      <p className="text-xs text-muted-foreground">Priority Mail, Ground Advantage, and Flat Rate options</p>
                    </div>
                  </div>
                  <Switch
                    id="usps-toggle"
                    checked={carrierSettings.usps}
                    onCheckedChange={(checked) => handleCarrierToggle('usps', checked)}
                    disabled={updateSystemSetting.isPending}
                  />
                </div>
              </div>

              {!carrierSettings.fedex && !carrierSettings.ups && !carrierSettings.usps && (
                <div className="p-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <strong>Warning:</strong> No carriers are enabled. You must enable at least one carrier to create shipping labels.
                  </p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>


      {/* Stripe Configuration Section */}
      <Collapsible open={stripeOpen} onOpenChange={setStripeOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Stripe Configuration</CardTitle>
                    <CardDescription>
                      Configure Stripe for payment processing.
                    </CardDescription>
                  </div>
                </div>
                {stripeOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <form onSubmit={handleStripeSubmit} className="space-y-4">
                <div className="grid w-full max-w-md items-center gap-1.5">
                  <Label htmlFor="stripePublishableKey">Stripe Publishable Key</Label>
                  <Input
                    id="stripePublishableKey"
                    type="text"
                    value={formData.stripePublishableKey}
                    onChange={(e) => handleChange("stripePublishableKey", e.target.value)}
                    placeholder="pk_test_..."
                  />
                  <p className="text-xs text-muted-foreground">
                    {stripeSetting?.setting_value 
                      ? `Current: ${getMaskedKey(stripeSetting.setting_value)}`
                      : "Not configured. Starts with pk_test_ or pk_live_"
                    }
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={updateSystemSetting.isPending}
                  >
                    {updateSystemSetting.isPending ? "Updating..." : "Update Stripe Settings"}
                  </Button>
                </div>
              </form>

              <div className="mt-4 p-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> This is your publishable key (starts with pk_). It's safe to use in the frontend. Your secret key should be configured separately as an environment secret.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <TaxSettings />

      {/* Email Templates Section */}
      <Collapsible open={emailTemplatesOpen} onOpenChange={setEmailTemplatesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Email Templates</CardTitle>
                    <CardDescription>
                      Customize email templates for orders, payments, notifications, and more.
                    </CardDescription>
                  </div>
                </div>
                {emailTemplatesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <EmailTemplateManager />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
