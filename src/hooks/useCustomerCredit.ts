import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { canViewCredit } from '@/lib/credit-rules';

export interface CustomerCredit {
  company_id: string;
  payment_terms: string;
  uses_credit: boolean;
  credit_limit: number;
  credit_used: number;
  available_credit: number;
  on_hold: boolean;
}

export const CUSTOMER_CREDIT_KEY = 'customer-credit';

/** Live credit figures for the given customers, keyed by company id. Empty for roles that can't see credit. */
export function useCustomerCredit(companyIds: (string | null | undefined)[]) {
  const { roles } = useAuth();
  const ids = [...new Set(companyIds.filter(Boolean) as string[])].sort();
  const allowed = canViewCredit(roles);
  return useQuery({
    queryKey: [CUSTOMER_CREDIT_KEY, ids],
    enabled: allowed && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_customer_credit', { _company_ids: ids });
      if (error) throw error;
      const map: Record<string, CustomerCredit> = {};
      for (const r of data || []) {
        map[r.company_id] = {
          ...r,
          credit_limit: Number(r.credit_limit),
          credit_used: Number(r.credit_used),
          available_credit: Number(r.available_credit),
        };
      }
      return map;
    },
  });
}
