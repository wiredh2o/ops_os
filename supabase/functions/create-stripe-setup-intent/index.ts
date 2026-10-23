import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['stripe']);
    const STRIPE_SECRET_KEY = TENANT_KEYS['STRIPE_SECRET_KEY'];
    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const { stripe_customer_id } = await req.json();

    if (!stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'stripe_customer_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating SetupIntent for customer: ${stripe_customer_id}`);

    // Create a Stripe SetupIntent to save a payment method without charging
    const response = await fetch('https://api.stripe.com/v1/setup_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': stripe_customer_id,
        'payment_method_types[]': 'card',
        'usage': 'off_session',
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Stripe API error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to create SetupIntent');
    }

    const setupIntent = await response.json();
    console.log(`SetupIntent created: ${setupIntent.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        client_secret: setupIntent.client_secret,
        setup_intent_id: setupIntent.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating SetupIntent:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
