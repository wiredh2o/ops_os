import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { stripe_customer_id, company_id, name, email, phone, billing_address } = await req.json();
    console.log('Updating Stripe customer:', stripe_customer_id);

    if (!stripe_customer_id) {
      throw new Error('stripe_customer_id is required');
    }

    // Parse billing address if provided
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

    // Update customer in Stripe
    const formData = new URLSearchParams();
    if (name) formData.append('name', name);
    if (email) formData.append('email', email);
    if (phone) formData.append('phone', phone);
    if (addressData.line1) {
      formData.append('address[line1]', addressData.line1);
      if (addressData.city) formData.append('address[city]', addressData.city);
      if (addressData.state) formData.append('address[state]', addressData.state);
      if (addressData.postal_code) formData.append('address[postal_code]', addressData.postal_code);
      if (addressData.country) formData.append('address[country]', addressData.country);
    }

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/customers/${stripe_customer_id}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text();
      console.error('Stripe API error:', errorText);
      throw new Error(`Failed to update Stripe customer: ${stripeResponse.status}`);
    }

    const stripeCustomer = await stripeResponse.json();
    console.log('Updated Stripe customer:', stripeCustomer.id);

    // Update sync timestamp in database
    if (company_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          stripe_last_synced_at: new Date().toISOString(),
        })
        .eq('id', company_id);

      if (updateError) {
        console.warn('Failed to update sync timestamp:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        customer: {
          id: stripeCustomer.id,
          name: stripeCustomer.name,
          email: stripeCustomer.email,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error updating Stripe customer:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
