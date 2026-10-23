import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
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
    const TENANT_KEYS = await loadTenantKeys(req, ['stripe']);
    const STRIPE_SECRET_KEY = TENANT_KEYS['STRIPE_SECRET_KEY'];
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const { company_id, stripe_customer_id, customer_number } = await req.json();
    console.log('Linking Stripe customer:', { company_id, stripe_customer_id });

    if (!company_id || !stripe_customer_id) {
      throw new Error('company_id and stripe_customer_id are required');
    }

    // Update Stripe customer metadata to include app reference
    const formData = new URLSearchParams();
    formData.append('metadata[app_customer_id]', company_id);
    if (customer_number) formData.append('metadata[customer_number]', customer_number.toString());

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

    // Update company in database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error: updateError } = await supabase
      .from('companies')
      .update({
        stripe_customer_id: stripe_customer_id,
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
    console.error('Error linking Stripe customer:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
