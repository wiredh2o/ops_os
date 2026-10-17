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

    // Fetch all companies with their shipping addresses
    const { data: companies, error } = await supabaseClient
      .from("companies")
      .select("customer_number, name, shipping_addresses, default_shipping_address_id")
      .order("customer_number", { ascending: true });

    if (error) throw error;

    console.log(`Fetched ${companies?.length || 0} companies from database`);

    // Define CSV headers
    const headers = [
      "customer_number",
      "customer_name",
      "address_name",
      "address",
      "city",
      "state",
      "zip",
      "country",
      "signature_required",
      "is_default",
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

    // Helper function to parse shipping addresses from JSONB
    const parseShippingAddresses = (rawAddresses: any): any[] => {
      if (!rawAddresses) {
        return [];
      }
      
      // If it's already an array, return it
      if (Array.isArray(rawAddresses)) {
        return rawAddresses;
      }
      
      // If it's a string, try to parse it
      if (typeof rawAddresses === 'string') {
        try {
          const parsed = JSON.parse(rawAddresses);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.error('Failed to parse shipping_addresses string:', e);
          return [];
        }
      }
      
      // If it's an object but not an array, it might be a single address
      if (typeof rawAddresses === 'object') {
        return [rawAddresses];
      }
      
      return [];
    };

    // Build CSV content
    let csvContent = headers.join(",") + "\n";
    let totalAddressesExported = 0;
    let companiesWithAddresses = 0;
    let companiesSkipped = 0;

    companies.forEach((company, index) => {
      console.log(`Processing company ${index + 1}: ${company.name} (${company.customer_number})`);
      console.log(`Raw shipping_addresses type: ${typeof company.shipping_addresses}`);
      console.log(`Raw shipping_addresses value:`, company.shipping_addresses);

      const shippingAddresses = parseShippingAddresses(company.shipping_addresses);
      
      console.log(`Parsed ${shippingAddresses.length} addresses for company ${company.customer_number}`);

      // If no shipping addresses, skip this company
      if (shippingAddresses.length === 0) {
        companiesSkipped++;
        return;
      }

      companiesWithAddresses++;

      shippingAddresses.forEach((addr: any) => {
        const isDefault = company.default_shipping_address_id === addr.id;
        const row = [
          company.customer_number,
          company.name,
          addr.name || "",
          addr.address || "",
          addr.city || "",
          addr.state || "",
          addr.zip || "",
          addr.country || "",
          addr.signature_required ? "true" : "false",
          isDefault ? "true" : "false",
        ];
        csvContent += row.map(escapeCsv).join(",") + "\n";
        totalAddressesExported++;
      });
    });

    console.log(`Export summary: ${totalAddressesExported} addresses from ${companiesWithAddresses} companies, ${companiesSkipped} companies skipped`);

    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="customer-shipping-addresses-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export shipping addresses error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
