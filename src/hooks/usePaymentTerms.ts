import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PaymentTerm } from '@/lib/credit-rules';

export const PAYMENT_TERMS_KEY = ['payment-terms'];

/** The settings list of standard terms (all, including inactive ones). */
export function usePaymentTerms() {
  return useQuery({
    queryKey: PAYMENT_TERMS_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('payment_terms')
        .select('code, label, net_days, deposit_percent, uses_credit, active, sort_order')
        .order('sort_order');
      if (error) throw error;
      return (data || []) as PaymentTerm[];
    },
    staleTime: 60_000,
  });
}
