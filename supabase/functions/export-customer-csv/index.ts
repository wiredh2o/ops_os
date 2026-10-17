import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Fetch all companies in batches to overcome the 1000-row limit
    let allCompanies: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseClient
        .from("companies")
        .select("*")
        .order("customer_number", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allCompanies = [...allCompanies, ...data];
        from += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const companies = allCompanies;

    // Define CSV headers
    const headers = [
      "customer_number",
      "name",
      "email",
      "phone",
      "owners_name",
      "start_date",
      "last_trans_date",
      "billing_address",
      "is_active",
      "is_distributor",
      "is_taxable",
      "preferred_shipping_carrier",
      "signature_required",
      "default_shipping_address_name",
      "sales_tax_license_expires_at",
      "sales_tax_license_url",
      "use_third_party_shipping",
      "fedex_account_number",
      "ups_account_number",
    ];

    // Helper function to escape CSV values
    const escapeCsv = (value: any): string => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Helper to find default shipping address name
    const getDefaultShippingAddressName = (company: any): string => {
      if (!company.default_shipping_address_id || !company.shipping_addresses) return "";
      const shippingAddresses = Array.isArray(company.shipping_addresses) 
        ? company.shipping_addresses 
        : [];
      const defaultAddr = shippingAddresses.find(
        (addr: any) => addr.id === company.default_shipping_address_id
      );
      return defaultAddr?.name || "";
    };

    // Build CSV content
    let csvContent = headers.join(",") + "\n";

    companies.forEach((company) => {
      const row = [
        company.customer_number,
        company.name,
        company.email,
        company.phone,
        company.owners_name,
        company.start_date,
        company.last_trans_date,
        company.billing_address,
        company.is_active,
        company.is_distributor,
        company.is_taxable,
        company.preferred_shipping_carrier,
        company.signature_required,
        getDefaultShippingAddressName(company),
        company.sales_tax_license_expires_at,
        company.sales_tax_license_url,
        company.use_third_party_shipping,
        company.fedex_account_number,
        company.ups_account_number,
      ];
      csvContent += row.map(escapeCsv).join(",") + "\n";
    });

    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="customers-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
