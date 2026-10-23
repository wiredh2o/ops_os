import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in user's company Stripe publishable key (sandbox or live, decided by the key itself). */
export function useStripePublishableKey() {
  const { data, isLoading } = useQuery({
    queryKey: ["stripe-publishable-key"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-integrations", { body: { action: "publishable" } });
      if (error) return "";
      return (data?.publishable_key as string | null) ?? "";
    },
    staleTime: 5 * 60 * 1000,
  });
  const publishableKey = data || "";
  return { publishableKey, isLoading, isConfigured: publishableKey.startsWith("pk_") };
}
