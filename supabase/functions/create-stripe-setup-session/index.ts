import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const { stripe_customer_id, return_url } = await req.json();

    if (!stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'stripe_customer_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!return_url) {
      return new Response(
        JSON.stringify({ error: 'return_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating setup session for customer: ${stripe_customer_id}`);

    // Create a Stripe Checkout Session in setup mode to add a new payment method
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'setup',
        'customer': stripe_customer_id,
        'payment_method_types[0]': 'card',
        'success_url': `${return_url}?setup_success=true`,
        'cancel_url': `${return_url}?setup_cancelled=true`,
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Stripe API error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to create setup session');
    }

    const session = await response.json();
    console.log(`Setup session created: ${session.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        setup_url: session.url,
        session_id: session.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating setup session:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
