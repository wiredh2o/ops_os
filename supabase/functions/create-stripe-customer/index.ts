import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const { company_id, name, email, phone, billing_address, customer_number, owners_name } = await req.json();
    console.log('Creating Stripe customer for company:', company_id);

    if (!company_id || !name) {
      throw new Error('company_id and name are required');
    }

    // Parse billing address if it's a string
    let addressData: any = {};
    if (billing_address) {
      try {
        const parts = billing_address.split(',').map((p: string) => p.trim());
        
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
        console.log('Could not parse billing address:', e);
      }
    }

    // Create customer in Stripe
    const formData = new URLSearchParams();
    formData.append('name', name);
    if (email) formData.append('email', email);
    if (phone) formData.append('phone', phone);
    if (addressData.line1) {
      formData.append('address[line1]', addressData.line1);
      if (addressData.city) formData.append('address[city]', addressData.city);
      if (addressData.state) formData.append('address[state]', addressData.state);
      if (addressData.postal_code) formData.append('address[postal_code]', addressData.postal_code);
      if (addressData.country) formData.append('address[country]', addressData.country);
    }
    formData.append('metadata[app_customer_id]', company_id);
    if (customer_number) formData.append('metadata[customer_number]', customer_number.toString());
    if (owners_name) formData.append('metadata[owners_name]', owners_name);

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
      console.error('Stripe API error:', errorText);
      throw new Error(`Failed to create Stripe customer: ${stripeResponse.status}`);
    }

    const stripeCustomer = await stripeResponse.json();
    console.log('Created Stripe customer:', stripeCustomer.id);

    // Update company record with Stripe customer ID
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error: updateError } = await supabase
      .from('companies')
      .update({
        stripe_customer_id: stripeCustomer.id,
        stripe_sync_status: 'synced',
        stripe_last_synced_at: new Date().toISOString(),
      })
      .eq('id', company_id);

    if (updateError) {
      console.error('Failed to update company:', updateError);
      throw new Error('Failed to link Stripe customer to company');
    }

    return new Response(
      JSON.stringify({
        success: true,
        stripe_customer_id: stripeCustomer.id,
        customer: {
          id: stripeCustomer.id,
          name: stripeCustomer.name,
          email: stripeCustomer.email,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
