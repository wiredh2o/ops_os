import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, ExternalLink, Loader2 } from "lucide-react";
import { useCompanySettings, useUpdateCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { showToast } from "@/lib/toast-utils";

export function TaxComplianceForm() {
  const { data: settings } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    ein: "",
    stateTaxId: "",
    salesTaxLicenseUrl: "",
    salesTaxLicenseExpires: "",
  });

  useEffect(() => {
    if (settings?.taxInfo) {
      setFormData({
        ein: settings.taxInfo.ein || "",
        stateTaxId: settings.taxInfo.stateTaxId || "",
        salesTaxLicenseUrl: settings.taxInfo.salesTaxLicenseUrl || "",
        salesTaxLicenseExpires: settings.taxInfo.salesTaxLicenseExpires || "",
      });
    }
  }, [settings]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `company-sales-tax-license-${Date.now()}.${fileExt}`;
      const filePath = `company-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      setFormData((prev) => ({ ...prev, salesTaxLicenseUrl: publicUrl }));
      
      await updateSettings.mutateAsync({
        company_sales_tax_license_url: publicUrl,
      });

      showToast.success("Sales tax license uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      showToast.error("Failed to upload sales tax license");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      company_ein: formData.ein,
      company_state_tax_id: formData.stateTaxId,
      company_sales_tax_license_expires: formData.salesTaxLicenseExpires,
    });
  };

  const formatEIN = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ein">EIN (Federal Tax ID)</Label>
          <Input
            id="ein"
            value={formData.ein}
            onChange={(e) => setFormData((prev) => ({ ...prev, ein: formatEIN(e.target.value) }))}
            placeholder="XX-XXXXXXX"
            maxLength={10}
          />
          <p className="text-xs text-muted-foreground">
            Format: XX-XXXXXXX (9 digits)
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stateTaxId">State Tax ID</Label>
          <Input
            id="stateTaxId"
            value={formData.stateTaxId}
            onChange={(e) => setFormData((prev) => ({ ...prev, stateTaxId: e.target.value }))}
            placeholder="State-specific format"
          />
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t">
        <div className="space-y-2">
          <Label>Sales Tax License</Label>
          <p className="text-xs text-muted-foreground">
            Upload your company's sales tax license. This may be included with purchase orders when required.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload License
              </>
            )}
          </Button>

          {formData.salesTaxLicenseUrl && (
            <a
              href={formData.salesTaxLicenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4" />
              View Current License
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="salesTaxLicenseExpires">License Expiration Date</Label>
          <Input
            id="salesTaxLicenseExpires"
            type="date"
            value={formData.salesTaxLicenseExpires}
            onChange={(e) => setFormData((prev) => ({ ...prev, salesTaxLicenseExpires: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={updateSettings.isPending}>
          {updateSettings.isPending ? "Saving..." : "Save Tax Information"}
        </Button>
      </div>
    </form>
  );
}
