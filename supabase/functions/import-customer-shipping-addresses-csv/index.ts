import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShippingAddress {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  signature_required: boolean;
}

// Helper to parse boolean values case-insensitively
const parseBoolean = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
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

    const { csvData, replaceAll = false } = await req.json();
    
    // Parse CSV
    const lines = csvData.split("\n").filter((line: string) => line.trim());
    const headerLine = lines[0];
    const headers = headerLine.split(",").map((h: string) => h.trim().replace(/^"|"$/g, ''));
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Group addresses by customer_number
    const addressesByCustomer: Record<string, any[]> = {};

    for (let i = 1; i < lines.length; i++) {
      try {
        const line = lines[i];
        const values: string[] = [];
        let currentValue = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim());
        
        const record: any = {};
        headers.forEach((header, idx) => {
          record[header] = values[idx]?.replace(/^"|"$/g, '') || '';
        });

        if (!record.customer_number || !record.address_name) {
          errors.push(`Row ${i} missing required fields (customer_number or address_name)`);
          skipped++;
          continue;
        }

        const customerNumber = record.customer_number;
        if (!addressesByCustomer[customerNumber]) {
          addressesByCustomer[customerNumber] = [];
        }

        addressesByCustomer[customerNumber].push({
          name: record.address_name,
          address: record.address || "",
          city: record.city || "",
          state: record.state || "",
          zip: record.zip || "",
          country: record.country || "",
          signature_required: parseBoolean(record.signature_required),
          is_default: parseBoolean(record.is_default),
        });
      } catch (rowError: any) {
        errors.push(`Row ${i} error: ${rowError.message}`);
        skipped++;
      }
    }

    // Process each customer's addresses
    for (const [customerNumber, newAddresses] of Object.entries(addressesByCustomer)) {
      try {
        // Check if multiple addresses are marked as default
        const defaultAddresses = newAddresses.filter((addr: any) => addr.is_default);
        if (defaultAddresses.length > 1) {
          console.warn(`Customer ${customerNumber} has ${defaultAddresses.length} addresses marked as default. Using first one: "${defaultAddresses[0].name}"`);
          errors.push(`Warning: Customer ${customerNumber} has ${defaultAddresses.length} addresses marked as default`);
        }
        // Find the company
        const { data: company, error: companyError } = await supabaseClient
          .from("companies")
          .select("id, shipping_addresses, default_shipping_address_id")
          .eq("customer_number", parseInt(customerNumber))
          .single();

        if (companyError || !company) {
          errors.push(`Customer ${customerNumber} not found`);
          skipped += newAddresses.length;
          continue;
        }

        // Helper function to parse shipping addresses from JSONB
        const parseShippingAddresses = (rawAddresses: any): ShippingAddress[] => {
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
              console.error(`Failed to parse shipping_addresses for customer ${customerNumber}:`, e);
              return [];
            }
          }
          
          // If it's an object but not an array, it might be a single address
          if (typeof rawAddresses === 'object') {
            return [rawAddresses];
          }
          
          return [];
        };

        // Get existing shipping addresses with robust parsing
        let existingAddresses: ShippingAddress[] = parseShippingAddresses(company.shipping_addresses);
        
        console.log(`Customer ${customerNumber}: Found ${existingAddresses.length} existing addresses`);

        // Process addresses based on replaceAll flag
        let finalAddresses: ShippingAddress[];
        let newDefaultId: string | null = company.default_shipping_address_id;

        if (replaceAll) {
          // Replace all addresses - generate new GUIDs
          finalAddresses = newAddresses.map((addr: any) => {
            const newId = crypto.randomUUID();
            if (addr.is_default) {
              newDefaultId = newId;
            }
            return {
              id: newId,
              name: addr.name,
              address: addr.address,
              city: addr.city,
              state: addr.state,
              zip: addr.zip,
              country: addr.country,
              signature_required: addr.signature_required,
            };
          });
          created += finalAddresses.length;
        } else {
          // Merge mode - update existing or add new
          const addressMap = new Map(existingAddresses.map(addr => [addr.name, addr]));

          for (const newAddr of newAddresses) {
            const existing = addressMap.get(newAddr.name);
            if (existing) {
              // Update existing address (keep same ID)
              existing.address = newAddr.address;
              existing.city = newAddr.city;
              existing.state = newAddr.state;
              existing.zip = newAddr.zip;
              existing.country = newAddr.country;
              existing.signature_required = newAddr.signature_required;
              if (newAddr.is_default) {
                newDefaultId = existing.id;
              }
              updated++;
            } else {
              // Add new address
              const newId = crypto.randomUUID();
              if (newAddr.is_default) {
                newDefaultId = newId;
              }
              addressMap.set(newAddr.name, {
                id: newId,
                name: newAddr.name,
                address: newAddr.address,
                city: newAddr.city,
                state: newAddr.state,
                zip: newAddr.zip,
                country: newAddr.country,
                signature_required: newAddr.signature_required,
              });
              created++;
            }
          }

          finalAddresses = Array.from(addressMap.values());
        }

        // Update the company record
        const defaultAddress = finalAddresses.find((addr: any) => addr.id === newDefaultId);
        console.log(`Customer ${customerNumber}: Setting default address to "${defaultAddress?.name || 'none'}" (ID: ${newDefaultId || 'none'})`);
        
        const { error: updateError } = await supabaseClient
          .from("companies")
          .update({
            shipping_addresses: finalAddresses,
            default_shipping_address_id: newDefaultId,
          })
          .eq("id", company.id);

        if (updateError) {
          errors.push(`Error updating customer ${customerNumber}: ${updateError.message}`);
        }
      } catch (customerError: any) {
        errors.push(`Customer ${customerNumber} processing error: ${customerError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        created, 
        updated, 
        skipped, 
        errors: errors.length > 0 ? errors : undefined 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Import shipping addresses error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
