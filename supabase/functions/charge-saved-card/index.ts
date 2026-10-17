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

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const { 
      stripe_customer_id, 
      payment_method_id, 
      amount, 
      order_id,
      description 
    } = await req.json();

    console.log('Charging card:', { stripe_customer_id, payment_method_id, amount, order_id });

    if (!stripe_customer_id || !payment_method_id || !amount || !order_id) {
      throw new Error('Missing required fields');
    }

    // Create PaymentIntent
    const formData = new URLSearchParams();
    formData.append('amount', Math.round(amount * 100).toString()); // Convert to cents
    formData.append('currency', 'usd');
    formData.append('customer', stripe_customer_id);
    formData.append('payment_method', payment_method_id);
    formData.append('off_session', 'true');
    formData.append('confirm', 'true');
    formData.append('metadata[order_id]', order_id);
    if (description) formData.append('description', description);

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

    console.log('PaymentIntent status:', paymentIntent.status);

    // Update order with payment info
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const paymentStatus = paymentIntent.status === 'succeeded' ? 'paid' : 'pending';
    
    const { error: updateError } = await supabase
      .from('production_orders')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        payment_status: paymentStatus,
        payment_method: 'card_on_file',
        payment_received_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
      })
      .eq('id', order_id);

    if (updateError) {
      console.error('Failed to update order:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: paymentIntent.status === 'succeeded',
        status: paymentIntent.status,
        payment_intent_id: paymentIntent.id,
        amount: amount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error charging card:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
