import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "@/components/users/UserManagement";
import { CustomerManagement } from "@/components/customers/CustomerManagement";
import { PriceLevelManagement } from "@/components/customers/PriceLevelManagement";
import { VendorManagement } from "@/components/vendors/VendorManagement";
import { PermissionMatrix } from "@/components/permissions/PermissionMatrix";
import { RLSPermissionMatrix } from "@/components/permissions/RLSPermissionMatrix";
import { FieldSecurityMatrix } from "@/components/permissions/FieldSecurityMatrix";
import { HierarchicalPermissionManager } from "@/components/permissions/HierarchicalPermissionManager";
import { TaxSettings } from "@/components/settings/TaxSettings";
import { useAuth } from "@/hooks/useAuth";
import { SystemSettings } from "@/components/settings/SystemSettings";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { NotificationFailureList } from "@/components/settings/NotificationFailureList";
import { PendingRefundsManager } from "@/components/accounting/PendingRefundsManager";
// BoxSizeManager is now imported inside ShippingMaterialsSettings
import { ShippingMaterialsSettings } from "@/components/settings/ShippingMaterialsSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UploadCloud, Image as ImageIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

const BRANDING_BUCKET = "branding";
const COMPANY_LOGO_PATH = "company-logo.png";

const Settings = () => {
  const { roles, rolesLoading } = useAuth();
  const staff = roles.some(role => ['admin', 'sales_support', 'production', 'accounting', 'marketing', 'tech_support'].includes(role));
  const accountingOnly = roles.includes("accounting") && !roles.includes("admin");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Settings - Production Management System";
    const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(COMPANY_LOGO_PATH);
    if (data?.publicUrl) setLogoUrl(data.publicUrl + `?t=${Date.now()}`);
  }, []);

  const triggerPicker = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const { error } = await supabase.storage
        .from(BRANDING_BUCKET)
        .upload(COMPANY_LOGO_PATH, file, { upsert: true, contentType: file.type });

      if (error) throw error;

      const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(COMPANY_LOGO_PATH);
      const url = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
      setLogoUrl(url);

      // Also save the logo URL to system_settings for use in emails
      if (data?.publicUrl) {
        await supabase
          .from("system_settings")
          .upsert({
            setting_key: "company_logo_url",
            setting_value: data.publicUrl,
            description: "Public URL for company logo used in emails",
            is_active: true,
          }, { onConflict: "setting_key" });
      }

      toast({ title: "Logo updated", description: "Your company logo has been uploaded." });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (rolesLoading) return <div className="container py-6">Loading settings…</div>;
  if (!staff) return <div className="container max-w-3xl py-6"><h1 className="text-2xl font-bold">My settings</h1><NotificationPreferences />{roles.some(role => ['car_wash_admin','distributor_admin','vendor_admin'].includes(role)) && <UserManagement notificationsOnly />}</div>;
  if (accountingOnly) return <div className="container py-6"><NotificationFailureList /><TaxSettings /></div>;

  return (
    <div className="bg-gradient-to-br from-gray-50 to-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Settings</h1>
          <p className="text-gray-600">Manage your system configuration and preferences</p>
        </div>
        <NotificationFailureList />

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="pricing">Price Levels</TabsTrigger>
            <TabsTrigger value="vendors">Vendors</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="box-sizes">Shipping Materials</TabsTrigger>
            <TabsTrigger value="refunds">Refunds</TabsTrigger>
            <TabsTrigger value="permissions">Basic Permissions</TabsTrigger>
            <TabsTrigger value="security">Security Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  Manage user accounts, roles, and permissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UserManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Customer Management</CardTitle>
                <CardDescription>
                  Manage customer accounts and information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CustomerManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Price Level Management</CardTitle>
                <CardDescription>
                  Configure customer price levels and discount tiers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PriceLevelManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vendors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Vendor Management</CardTitle>
                <CardDescription>
                  Manage vendor accounts and supplier information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VendorManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>
                  Configure global system settings like tax rates and other defaults
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SystemSettings />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Company Logo</CardTitle>
                <CardDescription>Upload a logo to brand packing slips, emails, and dashboards.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                  <div className="w-40 h-40 border rounded-md bg-muted/20 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Company logo"
                        className="w-full h-full object-contain"
                        loading="lazy"
                        onError={() => setLogoUrl(null)}
                      />
                    ) : (
                      <div className="flex flex-col items-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8 mb-2" />
                        <span className="text-xs">No logo uploaded</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button onClick={triggerPicker} disabled={uploading}>
                        <UploadCloud className="h-4 w-4 mr-2" />
                        {uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}
                      </Button>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recommended: PNG or SVG. Transparent background preferred.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="box-sizes" className="space-y-4">
            <ShippingMaterialsSettings />
          </TabsContent>

          <TabsContent value="refunds" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Refunds</CardTitle>
                <CardDescription>
                  Manage customer refunds that need to be issued via check
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PendingRefundsManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Basic Permission Management</CardTitle>
                <CardDescription>
                  Configure basic role permissions for the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PermissionMatrix />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="security" className="space-y-4">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>RLS Permission Matrix</CardTitle>
                  <CardDescription>
                    Control who can access which records (Row-Level Security)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RLSPermissionMatrix />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Field Security Matrix</CardTitle>
                  <CardDescription>
                    Control which fields are visible and editable within accessible records
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldSecurityMatrix />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;