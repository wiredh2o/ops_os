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

    const { 
      stripe_customer_id, 
      amount, 
      order_id,
      order_number,
      save_card
    } = await req.json();

    console.log('Creating payment intent:', { stripe_customer_id, amount, order_id, save_card });

    if (!amount || !order_id) {
      throw new Error('Missing required fields: amount and order_id');
    }

    // Build form data for PaymentIntent creation
    const formData = new URLSearchParams();
    formData.append('amount', Math.round(amount * 100).toString()); // Convert to cents
    formData.append('currency', 'usd');
    formData.append('metadata[order_id]', order_id);
    
    if (order_number) {
      formData.append('metadata[order_number]', order_number);
      formData.append('description', `Order ${order_number}`);
    }
    
    if (stripe_customer_id) {
      formData.append('customer', stripe_customer_id);
    }

    // Payment method types - use only card for reliability
    // Other methods (cashapp, amazon_pay, klarna, etc.) require explicit account enablement
    if (save_card) {
      formData.append('setup_future_usage', 'off_session');
    }
    formData.append('payment_method_types[]', 'card');

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const paymentIntent = await response.json();

    if (paymentIntent.error) {
      console.error('Stripe error:', paymentIntent.error);
      throw new Error(paymentIntent.error.message);
    }

    console.log('Created payment intent:', paymentIntent.id);

    // Update order with payment intent ID
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error: updateError } = await supabase
      .from('production_orders')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        payment_status: 'pending',
        payment_method: 'manual_entry',
      })
      .eq('id', order_id);

    if (updateError) {
      console.error('Failed to update order:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
