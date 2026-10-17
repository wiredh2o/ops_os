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
      amount, 
      order_id,
      order_number,
      success_url,
      cancel_url,
      line_items,
      save_card
    } = await req.json();

    console.log('Creating checkout session:', { stripe_customer_id, amount, order_id });

    if (!amount || !order_id || !success_url) {
      throw new Error('Missing required fields');
    }

    // Build line items for checkout
    const formData = new URLSearchParams();
    formData.append('mode', 'payment');
    formData.append('success_url', success_url);
    formData.append('cancel_url', cancel_url || success_url);
    formData.append('metadata[order_id]', order_id);
    if (order_number) formData.append('metadata[order_number]', order_number);
    
    if (stripe_customer_id) {
      formData.append('customer', stripe_customer_id);
    }

    // If save_card is true, set up payment intent for future usage
    if (save_card) {
      formData.append('payment_intent_data[setup_future_usage]', 'off_session');
    }

    // If line items provided, use them; otherwise create a single line item
    if (line_items && line_items.length > 0) {
      line_items.forEach((item: any, index: number) => {
        formData.append(`line_items[${index}][price_data][currency]`, 'usd');
        formData.append(`line_items[${index}][price_data][unit_amount]`, Math.round(item.amount * 100).toString());
        formData.append(`line_items[${index}][price_data][product_data][name]`, item.name);
        formData.append(`line_items[${index}][quantity]`, (item.quantity || 1).toString());
      });
    } else {
      formData.append('line_items[0][price_data][currency]', 'usd');
      formData.append('line_items[0][price_data][unit_amount]', Math.round(amount * 100).toString());
      formData.append('line_items[0][price_data][product_data][name]', `Order ${order_number || order_id}`);
      formData.append('line_items[0][quantity]', '1');
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const session = await response.json();

    if (session.error) {
      console.error('Stripe error:', session.error);
      throw new Error(session.error.message);
    }

    console.log('Created checkout session:', session.id);

    // Update order with checkout session ID
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error: updateError } = await supabase
      .from('production_orders')
      .update({
        stripe_checkout_session_id: session.id,
        payment_status: 'pending',
        payment_method: 'checkout_link',
      })
      .eq('id', order_id);

    if (updateError) {
      console.error('Failed to update order:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkout_url: session.url,
        session_id: session.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
