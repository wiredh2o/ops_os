import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface StripeCustomerResult {
  id: string;
  name: string;
  success: boolean;
  error?: string;
  stripe_customer_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const { customers } = await req.json();
    console.log(`Batch creating Stripe customers for ${customers?.length || 0} companies`);

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          results: { created: 0, failed: 0, failures: [] } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: StripeCustomerResult[] = [];
    let created = 0;
    let failed = 0;
    const failures: Array<{ id: string; name: string; error: string }> = [];

    // Process each customer sequentially with small delays to respect Stripe rate limits
    for (const customer of customers) {
      // Skip if already has Stripe customer ID
      if (customer.stripe_customer_id) {
        console.log(`Skipping ${customer.name} - already has Stripe ID`);
        created++; // Count as success since it's already linked
        continue;
      }

      try {
      // Extract first email if multiple are present (separated by ; or ,)
      const extractFirstEmail = (email: string | null | undefined): string | null => {
        if (!email) return null;
        
        // Split by common delimiters (semicolon, comma) and take first
        const firstEmail = email.split(/[;,]/)[0].trim();
        
        // Validate the extracted email
        if (!firstEmail) return null;
        if (firstEmail.toLowerCase() === 'unknown') return null;
        if (!firstEmail.includes('@')) return null;
        
        // Validate proper domain structure (must have something after @ with a dot)
        const [, domain] = firstEmail.split('@');
        if (!domain || !domain.includes('.')) return null;
        
        return firstEmail;
      };

      // Extract first valid phone number, stripping names/notes
      const extractValidPhone = (phone: string | null | undefined): string | null => {
        if (!phone) return null;
        
        // Extract the phone portion - match common phone patterns
        // This captures digits, dashes, parentheses, spaces, and plus sign
        const phoneMatch = phone.match(/^[\d\s\-\(\)\+\.]+/);
        if (!phoneMatch) return null;
        
        const extractedPhone = phoneMatch[0].trim();
        
        // Stripe allows max 20 characters for phone
        if (extractedPhone.length > 20 || extractedPhone.length < 7) return null;
        
        return extractedPhone;
      };

      // Parse billing address if it's a string
        let addressData: any = {};
        if (customer.billing_address) {
          try {
            const parts = customer.billing_address.split(',').map((p: string) => p.trim());
            
            if (parts.length >= 5) {
              // Format: "Company Name, Street, City, State, ZIP"
              addressData.line1 = parts[1];
              addressData.city = parts[2];
              addressData.state = parts[3];
              addressData.postal_code = parts[4];
              addressData.country = 'US';
            } else if (parts.length === 4) {
              // Format: "Street, City, State, ZIP" (no company name)
              addressData.line1 = parts[0];
              addressData.city = parts[1];
              addressData.state = parts[2];
              addressData.postal_code = parts[3];
              addressData.country = 'US';
            } else if (parts.length === 3) {
              // Legacy format: "Street, City, State ZIP"
              addressData.line1 = parts[0];
              addressData.city = parts[1];
              const stateZip = parts[2].split(' ');
              if (stateZip.length >= 2) {
                addressData.state = stateZip[0];
                addressData.postal_code = stateZip.slice(1).join(' ');
              }
              addressData.country = 'US';
            }
          } catch (e) {
            console.log(`Could not parse billing address for ${customer.name}:`, e);
          }
        }

        // Create customer in Stripe
        const formData = new URLSearchParams();
        formData.append('name', customer.name);
        // Only send email if valid (extract first if multiple present)
        const validEmail = extractFirstEmail(customer.email);
        if (validEmail) {
          formData.append('email', validEmail);
        }
        const validPhone = extractValidPhone(customer.phone);
        if (validPhone) {
          formData.append('phone', validPhone);
        }
        if (addressData.line1) {
          formData.append('address[line1]', addressData.line1);
          if (addressData.city) formData.append('address[city]', addressData.city);
          if (addressData.state) formData.append('address[state]', addressData.state);
          if (addressData.postal_code) formData.append('address[postal_code]', addressData.postal_code);
          if (addressData.country) formData.append('address[country]', addressData.country);
        }
        formData.append('metadata[app_customer_id]', customer.company_id);
        if (customer.customer_number) formData.append('metadata[customer_number]', customer.customer_number.toString());
        if (customer.owners_name) formData.append('metadata[owners_name]', customer.owners_name);

        const stripeResponse = await fetch('https://api.stripe.com/v1/customers', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        if (!stripeResponse.ok) {
          const errorText = await stripeResponse.text();
          console.error(`Stripe API error for ${customer.name}:`, errorText);
          throw new Error(`Stripe API error: ${stripeResponse.status}`);
        }

        const stripeCustomer = await stripeResponse.json();
        console.log(`Created Stripe customer for ${customer.name}:`, stripeCustomer.id);

        // Update company record with Stripe customer ID
        const { error: updateError } = await supabase
          .from('companies')
          .update({
            stripe_customer_id: stripeCustomer.id,
            stripe_sync_status: 'synced',
            stripe_last_synced_at: new Date().toISOString(),
          })
          .eq('id', customer.company_id);

        if (updateError) {
          console.error(`Failed to update company ${customer.name}:`, updateError);
          // Still count as success since Stripe customer was created
        }

        results.push({
          id: customer.id,
          name: customer.name,
          success: true,
          stripe_customer_id: stripeCustomer.id,
        });
        created++;

        // Small delay to respect Stripe rate limits (25 requests per second)
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error: any) {
        console.error(`Error creating Stripe customer for ${customer.name}:`, error);
        results.push({
          id: customer.id,
          name: customer.name,
          success: false,
          error: error.message,
        });
        failed++;
        failures.push({
          id: customer.id,
          name: customer.name,
          error: error.message,
        });
      }
    }

    console.log(`Batch complete: ${created} created, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        results: results,  // Return array of per-customer results for frontend iteration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in batch-create-stripe-customers:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
