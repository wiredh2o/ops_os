import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Company {
  id: string;
  name: string;
  is_distributor: boolean;
  is_active: boolean;
  is_taxable?: boolean;
  owners_name?: string;
  customer_number?: number;
  start_date?: string;
  last_trans_date?: string;
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies", "all"],
    staleTime: 0,
    queryFn: async () => {
      let allCompanies: Company[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      // Fetch in batches of 1000 until we get all companies
      while (hasMore) {
        const { data, error } = await supabase
          .from("companies")
          .select("id, name, is_distributor, is_active, is_taxable, owners_name, customer_number, start_date, last_trans_date")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allCompanies = [...allCompanies, ...data as Company[]];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      return allCompanies;
    },
  });
}