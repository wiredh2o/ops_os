import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Settings, ChevronDown, ChevronUp, DollarSign, Truck, Mail } from "lucide-react";
import { useSystemSetting, useUpdateSystemSetting } from "@/hooks/useSystemSettings";
import { CompanyProfileSettings } from "./CompanyProfileSettings";
import { EmailTemplateManager } from "./EmailTemplateManager";
import { TaxSettings } from "./TaxSettings";
import { IntegrationKeysSettings } from "./IntegrationKeysSettings";
import { ZebraPrinterSettings } from "./ZebraPrinterSettings";
import { NotificationFailureList } from './NotificationFailureList';
import { PaymentTermsSettings } from './PaymentTermsSettings';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isValidRoutingNumber, isValidCheckAccountNumber } from "@/lib/check-layout";
import { buildCheckPdf, openPdf } from "@/lib/check-pdf";


export function SystemSettings() {
  const { data: fedexSetting, isLoading: fedexLoading } = useSystemSetting("carrier_fedex_enabled");
  const { data: upsSetting, isLoading: upsLoading } = useSystemSetting("carrier_ups_enabled");
  const { data: uspsSetting, isLoading: uspsLoading } = useSystemSetting("carrier_usps_enabled");
  const updateSystemSetting = useUpdateSystemSetting();
  
  const [companyOpen, setCompanyOpen] = useState(false);
  const [carriersOpen, setCarriersOpen] = useState(false);
  const [emailTemplatesOpen, setEmailTemplatesOpen] = useState(false);
  
  const [carrierSettings, setCarrierSettings] = useState({
    fedex: fedexSetting?.setting_value !== "false",
    ups: upsSetting?.setting_value !== "false", 
    usps: uspsSetting?.setting_value !== "false",
  });

  useEffect(() => {
    setCarrierSettings({
      fedex: fedexSetting?.setting_value !== "false",
      ups: upsSetting?.setting_value !== "false",
      usps: uspsSetting?.setting_value !== "false",
    });
  }, [fedexSetting, upsSetting, uspsSetting]);

  const handleCarrierToggle = async (carrier: 'fedex' | 'ups' | 'usps', enabled: boolean) => {
    setCarrierSettings(prev => ({ ...prev, [carrier]: enabled }));
    
    await updateSystemSetting.mutateAsync({
      settingKey: `carrier_${carrier}_enabled`,
      settingValue: enabled ? "true" : "false",
      description: `Enable ${carrier.toUpperCase()} as a shipping carrier option`
    });
  };

  const isLoading = fedexLoading || upsLoading || uspsLoading;

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


      <IntegrationKeysSettings />

      <ZebraPrinterSettings />

      <TaxSettings />

      <PaymentTermsSettings />

      <CheckPrintingSettings />

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


// ---------------- Check printing (per checking account) ----------------

interface CheckAccount {
  id: string; name: string; bank_name: string | null; bank_address: string | null; routing_number: string | null;
  check_account_number: string | null; next_check_number: number; check_company_name: string | null;
  check_company_address: string | null; check_logo_url: string | null; print_offset_x: number; print_offset_y: number;
}

function CheckPrintingSettings() {
  const { roles } = useAuth();
  const { toast } = useToast();
  const canEdit = roles.includes('admin') || roles.includes('accounting');
  const [accounts, setAccounts] = useState<CheckAccount[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !canEdit) return;
    (supabase as any).from('accounts')
      .select('id, name, bank_name, bank_address, routing_number, check_account_number, next_check_number, check_company_name, check_company_address, check_logo_url, print_offset_x, print_offset_y')
      .eq('account_subtype', 'checking').eq('is_active', true).order('name')
      .then(({ data }: any) => setAccounts(data || []));
  }, [open, canEdit]);

  if (!canEdit) return null;

  const update = (id: string, patch: Partial<CheckAccount>) => setAccounts(list => list.map(a => (a.id === id ? { ...a, ...patch } : a)));

  const save = async (a: CheckAccount) => {
    const routing = (a.routing_number || '').trim();
    const acct = (a.check_account_number || '').trim();
    if (routing && !isValidRoutingNumber(routing)) return toast({ title: 'Routing number is not valid', description: 'It must be 9 digits and pass the bank checksum.', variant: 'destructive' });
    if (acct && !isValidCheckAccountNumber(acct)) return toast({ title: 'Account number is not valid', description: 'Use 4 to 17 digits (dashes allowed).', variant: 'destructive' });
    if (!(Number(a.next_check_number) > 0)) return toast({ title: 'Next check number must be above zero', variant: 'destructive' });
    const { error } = await (supabase as any).from('accounts').update({
      bank_name: a.bank_name || null, bank_address: a.bank_address || null, routing_number: routing || null,
      check_account_number: acct || null, next_check_number: Number(a.next_check_number),
      check_company_name: a.check_company_name || null, check_company_address: a.check_company_address || null,
      check_logo_url: a.check_logo_url || null, print_offset_x: Number(a.print_offset_x) || 0, print_offset_y: Number(a.print_offset_y) || 0,
    }).eq('id', a.id);
    if (error) toast({ title: 'Not saved', description: error.message, variant: 'destructive' });
    else toast({ title: `Check details saved for ${a.name}` });
  };

  const testPrint = async (a: CheckAccount) => {
    if (!a.routing_number || !a.check_account_number) return toast({ title: 'Enter routing and account numbers first', variant: 'destructive' });
    try {
      openPdf(await buildCheckPdf({
        companyName: a.check_company_name || 'Company name', companyAddress: a.check_company_address || '',
        logoUrl: a.check_logo_url, bankName: a.bank_name || 'Bank name', bankAddress: a.bank_address || '',
        routingNumber: a.routing_number, accountNumber: a.check_account_number, checkNumber: a.next_check_number,
        date: new Date().toLocaleDateString('en-US'), payee: 'Alignment Test Vendor', payeeAddress: '123 Main St\nAnytown, CO 80000',
        amount: 1234.56, memo: 'Alignment test — do not cash',
        stubLines: [{ billNumber: 'TEST-1', poNumber: 'PO-TEST', billDate: '', billAmount: 1234.56, paid: 1234.56 }],
        offsetXIn: Number(a.print_offset_x) || 0, offsetYIn: Number(a.print_offset_y) || 0, voided: true,
      }));
    } catch (e: any) { toast({ title: 'Test print failed', description: e.message, variant: 'destructive' }); }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Check Printing</CardTitle>
                <CardDescription>Bank, MICR and company details printed on vendor checks (top-third check, two stubs)</CardDescription>
              </div>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {accounts.length === 0 && <p className="text-sm text-muted-foreground">No active checking accounts. Add one in the chart of accounts.</p>}
            {accounts.map(a => (
              <div key={a.id} className="border rounded-lg p-4 space-y-3">
                <p className="font-medium">{a.name}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label>Company name on check</Label><Input value={a.check_company_name || ''} onChange={e => update(a.id, { check_company_name: e.target.value })} /></div>
                  <div><Label>Bank name</Label><Input value={a.bank_name || ''} onChange={e => update(a.id, { bank_name: e.target.value })} /></div>
                  <div><Label>Company address (one line each)</Label><Textarea rows={3} value={a.check_company_address || ''} onChange={e => update(a.id, { check_company_address: e.target.value })} /></div>
                  <div><Label>Bank address (city, state line for fractional optional)</Label><Textarea rows={3} value={a.bank_address || ''} onChange={e => update(a.id, { bank_address: e.target.value })} /></div>
                  <div><Label>Routing number (MICR)</Label><Input inputMode="numeric" maxLength={9} value={a.routing_number || ''} onChange={e => update(a.id, { routing_number: e.target.value.replace(/\D/g, '') })} /></div>
                  <div><Label>Account number (MICR)</Label><Input inputMode="numeric" maxLength={17} value={a.check_account_number || ''} onChange={e => update(a.id, { check_account_number: e.target.value.replace(/[^0-9-]/g, '') })} /></div>
                  <div><Label>Next check number</Label><Input type="number" min="1" value={a.next_check_number} onChange={e => update(a.id, { next_check_number: parseInt(e.target.value, 10) || 0 })} /></div>
                  <div><Label>Logo image link (optional, PNG or JPG)</Label><Input value={a.check_logo_url || ''} onChange={e => update(a.id, { check_logo_url: e.target.value })} /></div>
                  <div><Label>Printer nudge right (inches, − = left)</Label><Input type="number" step="0.01" value={a.print_offset_x} onChange={e => update(a.id, { print_offset_x: Number(e.target.value) })} /></div>
                  <div><Label>Printer nudge down (inches, − = up)</Label><Input type="number" step="0.01" value={a.print_offset_y} onChange={e => update(a.id, { print_offset_y: Number(e.target.value) })} /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => testPrint(a)}>Print alignment test (VOID)</Button>
                  <Button onClick={() => save(a)}>Save</Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Print at Actual size (100%). Some banks require MICR toner for the bottom number line — ask your bank to test a printed check.</p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
