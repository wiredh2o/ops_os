import { useSystemSetting } from "@/hooks/useSystemSettings";

export function useStripePublishableKey() {
  const { data: setting, isLoading } = useSystemSetting("stripe_publishable_key");
  
  const publishableKey = setting?.setting_value || "";
  const isConfigured = Boolean(publishableKey && publishableKey.startsWith("pk_"));
  
  return {
    publishableKey,
    isLoading,
    isConfigured,
  };
}
