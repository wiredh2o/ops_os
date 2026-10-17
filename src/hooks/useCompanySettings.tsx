import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { showToast } from "@/lib/toast-utils";

export interface ShipFromAddress {
  companyName: string;
  contactName?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

export interface MailingAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface CompanyInfo {
  legalName: string;
  dba?: string;
  phone: string;
  email: string;
  website?: string;
}

export interface CompanyTaxInfo {
  ein?: string;
  stateTaxId?: string;
  salesTaxLicenseUrl?: string;
  salesTaxLicenseExpires?: string;
}

export interface CompanySettings {
  companyInfo: CompanyInfo;
  taxInfo: CompanyTaxInfo;
  shipFromAddress: ShipFromAddress;
  mailingAddress: MailingAddress;
  mailingSameAsShipFrom: boolean;
}

const COMPANY_SETTING_KEYS = [
  "company_legal_name",
  "company_dba",
  "company_phone",
  "company_email",
  "company_website",
  "company_ein",
  "company_state_tax_id",
  "company_sales_tax_license_url",
  "company_sales_tax_license_expires",
  "ship_from_company_name",
  "ship_from_contact_name",
  "ship_from_street1",
  "ship_from_street2",
  "ship_from_city",
  "ship_from_state",
  "ship_from_zip",
  "ship_from_phone",
  "mailing_same_as_ship_from",
  "mailing_street1",
  "mailing_street2",
  "mailing_city",
  "mailing_state",
  "mailing_zip",
] as const;

type CompanySettingKey = typeof COMPANY_SETTING_KEYS[number];

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_key, setting_value")
        .in("setting_key", COMPANY_SETTING_KEYS)
        .eq("is_active", true);

      if (error) throw error;

      const settingsMap = new Map<string, string>();
      data?.forEach((s) => settingsMap.set(s.setting_key, s.setting_value));

      const get = (key: CompanySettingKey) => settingsMap.get(key) || "";

      const settings: CompanySettings = {
        companyInfo: {
          legalName: get("company_legal_name"),
          dba: get("company_dba"),
          phone: get("company_phone"),
          email: get("company_email"),
          website: get("company_website"),
        },
        taxInfo: {
          ein: get("company_ein"),
          stateTaxId: get("company_state_tax_id"),
          salesTaxLicenseUrl: get("company_sales_tax_license_url"),
          salesTaxLicenseExpires: get("company_sales_tax_license_expires"),
        },
        shipFromAddress: {
          companyName: get("ship_from_company_name"),
          contactName: get("ship_from_contact_name"),
          street1: get("ship_from_street1"),
          street2: get("ship_from_street2"),
          city: get("ship_from_city"),
          state: get("ship_from_state"),
          zip: get("ship_from_zip"),
          phone: get("ship_from_phone"),
        },
        mailingAddress: {
          street1: get("mailing_street1"),
          street2: get("mailing_street2"),
          city: get("mailing_city"),
          state: get("mailing_state"),
          zip: get("mailing_zip"),
        },
        mailingSameAsShipFrom: get("mailing_same_as_ship_from") === "true",
      };

      return settings;
    },
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<Record<CompanySettingKey, string>>) => {
      const updates = Object.entries(settings).map(async ([key, value]) => {
        const { data: existing } = await supabase
          .from("system_settings")
          .select("id")
          .eq("setting_key", key)
          .maybeSingle();

        if (existing) {
          return supabase
            .from("system_settings")
            .update({ 
              setting_value: value || "",
              updated_at: new Date().toISOString()
            })
            .eq("setting_key", key);
        } else {
          return supabase
            .from("system_settings")
            .insert({ 
              setting_key: key,
              setting_value: value || "",
            });
        }
      });

      const results = await Promise.all(updates);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        throw new Error("Failed to update some settings");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_settings"] });
      queryClient.invalidateQueries({ queryKey: ["system_settings"] });
      showToast.updateSuccess("Company settings");
    },
    onError: () => {
      showToast.updateError("Company settings");
    },
  });
}

// Convenience hooks for specific sections
export function useShipFromAddress() {
  const { data } = useCompanySettings();
  return data?.shipFromAddress;
}

export function useCompanyInfo() {
  const { data } = useCompanySettings();
  return data?.companyInfo;
}

export function useCompanyTaxInfo() {
  const { data } = useCompanySettings();
  return data?.taxInfo;
}
