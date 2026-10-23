import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";

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
    const TENANT_KEYS = await loadTenantKeys(req, ['stripe']);
    const STRIPE_SECRET_KEY = TENANT_KEYS['STRIPE_SECRET_KEY'];
    if (!STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { stripe_customer_id, payment_method_id, type } = await req.json();

    if (!payment_method_id) {
      return new Response(
        JSON.stringify({ error: 'payment_method_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Detaching payment method: ${payment_method_id}, type: ${type}, customer: ${stripe_customer_id}`);

    let response;

    if (type === 'source' && stripe_customer_id) {
      // Legacy source - delete from customer
      console.log('Deleting legacy source from customer');
      response = await fetch(
        `https://api.stripe.com/v1/customers/${stripe_customer_id}/sources/${payment_method_id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          },
        }
      );
    } else {
      // Modern payment method - detach
      console.log('Detaching modern payment method');
      response = await fetch(
        `https://api.stripe.com/v1/payment_methods/${payment_method_id}/detach`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    }

    const result = await response.json();

    if (!response.ok) {
      console.error('Stripe API error:', result);
      return new Response(
        JSON.stringify({ 
          error: result.error?.message || 'Failed to delete payment method',
          details: result.error 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Payment method deleted successfully:', payment_method_id);

    return new Response(
      JSON.stringify({ success: true, deleted_id: payment_method_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in detach-stripe-payment-method:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
