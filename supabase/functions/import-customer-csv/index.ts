import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://deno.land/std@0.208.0/csv/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { csvData, updateExisting = true } = await req.json();
    
    console.log('Customer CSV import started');
    
    // Parse CSV - auto-detect columns from header row
    const records = parse(csvData, {
      skipFirstRow: true,
    });
    
    console.log(`Parsed ${records.length} records from CSV`);
    
    // Fetch ALL existing companies in batches to overcome 1000-row limit
    let existingCompanies: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error: fetchError } = await supabaseClient
        .from("companies")
        .select("id, customer_number, name")
        .range(from, from + batchSize - 1);

      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        existingCompanies = [...existingCompanies, ...data];
        from += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`Fetched ${existingCompanies.length} existing companies for matching`);
    
    // Build lookup map by customer_number only
    const companyByNumber = new Map();
    existingCompanies?.forEach(c => {
      if (c.customer_number) companyByNumber.set(c.customer_number, c);
    });
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    const newCustomerIds: string[] = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const record = records[i];

        // Validate required fields
        if (!record.name || record.name.trim() === '') {
          errors.push(`Row ${i + 1} missing required 'name' field`);
          skipped++;
          continue;
        }

        // Build company object
        const companyData: any = {
          name: record.name,
          start_date: record.start_date || new Date().toISOString().split("T")[0],
          last_trans_date: record.last_trans_date || null,
          owners_name: record.owners_name || null,
          email: record.email || null,
          phone: record.phone || null,
          billing_address: record.billing_address || null,
          is_active: record.is_active === "false" ? false : true,
          is_distributor: ["1", "true", "yes"].includes(record.is_distributor?.toLowerCase() || ""),
          is_taxable: record.is_taxable === "false" ? false : true,
          preferred_shipping_carrier: record.preferred_shipping_carrier || null,
          signature_required: record.signature_required === "true",
          sales_tax_license_expires_at: record.sales_tax_license_expires_at || null,
          sales_tax_license_url: record.sales_tax_license_url || null,
          // Third-party shipping account fields
          use_third_party_shipping: ["1", "true", "yes"].includes(record.use_third_party_shipping?.toLowerCase() || ""),
          fedex_account_number: record.fedex_account_number || null,
          ups_account_number: record.ups_account_number || null,
        };

        // Match by customer_number only
        let existingCompany = null;
        
        if (record.customer_number && updateExisting) {
          existingCompany = companyByNumber.get(parseInt(record.customer_number));
        }

        if (existingCompany) {
          // Update existing record
          toUpdate.push({ ...companyData, id: existingCompany.id });
        } else {
          // Create new record
          if (record.customer_number) {
            companyData.customer_number = parseInt(record.customer_number);
          }
          toInsert.push(companyData);
        }
      } catch (rowError: any) {
        errors.push(`Row ${i + 1} error: ${rowError.message}`);
        skipped++;
      }
    }

    // Batch insert new companies
    if (toInsert.length > 0) {
      const { data: insertedData, error: insertError } = await supabaseClient
        .from("companies")
        .insert(toInsert)
        .select("id");
      
      if (insertError) {
        errors.push(`Batch insert error: ${insertError.message}`);
        skipped += toInsert.length;
      } else {
        created = toInsert.length;
        // Collect the IDs of newly inserted companies
        if (insertedData) {
          insertedData.forEach((company: { id: string }) => {
            newCustomerIds.push(company.id);
          });
        }
      }
    }

    // Update existing companies
    for (const company of toUpdate) {
      const { error: updateError } = await supabaseClient
        .from("companies")
        .update(company)
        .eq("id", company.id);
      
      if (updateError) {
        errors.push(`Update error for ${company.name}: ${updateError.message}`);
        skipped++;
      } else {
        updated++;
      }
    }

    console.log(`Import complete: ${created} created, ${updated} updated, ${skipped} skipped`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        created, 
        updated, 
        skipped, 
        newCustomerIds,
        errors: errors.length > 0 ? errors : undefined 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
