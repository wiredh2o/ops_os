import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { showToast } from "@/lib/toast-utils";

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export function useSystemSettings() {
  return useQuery({
    queryKey: ["system_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .eq("is_active", true)
        .order("setting_key", { ascending: true });

      if (error) throw error;
      return data as SystemSetting[];
    },
  });
}

export function useSystemSetting(settingKey: string) {
  return useQuery({
    queryKey: ["system_setting", settingKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .eq("setting_key", settingKey)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data as SystemSetting | null;
    },
  });
}

export function useUpdateSystemSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      settingKey, 
      settingValue, 
      description 
    }: { 
      settingKey: string; 
      settingValue: string; 
      description?: string; 
    }) => {
      // First check if setting exists
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("setting_key", settingKey)
        .maybeSingle();

      if (existing) {
        // Update existing setting
        const { data, error } = await supabase
          .from("system_settings")
          .update({ 
            setting_value: settingValue,
            description,
            updated_at: new Date().toISOString()
          })
          .eq("setting_key", settingKey)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new setting
        const { data, error } = await supabase
          .from("system_settings")
          .insert({ 
            setting_key: settingKey,
            setting_value: settingValue,
            description
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_settings"] });
      queryClient.invalidateQueries({ queryKey: ["system_setting"] });
      showToast.updateSuccess("Setting");
    },
    onError: () => {
      showToast.updateError("Setting");
    },
  });
}

export function useSalesTaxPercentage() {
  const { data: setting } = useSystemSetting("sales_tax_percentage");
  return parseFloat(setting?.setting_value || "0");
}

export interface EnabledCarriers {
  fedex: boolean;
  ups: boolean;
  usps: boolean;
}

export function useEnabledCarriers(): EnabledCarriers {
  const { data: fedexSetting } = useSystemSetting("carrier_fedex_enabled");
  const { data: upsSetting } = useSystemSetting("carrier_ups_enabled");
  const { data: uspsSetting } = useSystemSetting("carrier_usps_enabled");
  
  return {
    // Default to true if no setting exists (backwards compatible)
    fedex: fedexSetting?.setting_value !== "false",
    ups: upsSetting?.setting_value !== "false",
    usps: uspsSetting?.setting_value !== "false",
  };
}

// Default paper weight: 0.5 oz per foot of 24" wide crunched paper
const DEFAULT_PAPER_WEIGHT_OZ_PER_FOOT = 0.5;

export function usePaperWeightPerFoot(): number {
  const { data: setting } = useSystemSetting("paper_weight_oz_per_foot");
  return parseFloat(setting?.setting_value || String(DEFAULT_PAPER_WEIGHT_OZ_PER_FOOT));
}