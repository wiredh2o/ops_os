import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    const { stripe_customer_id } = await req.json();
    console.log('Getting payment methods for:', stripe_customer_id);

    if (!stripe_customer_id) {
      throw new Error('stripe_customer_id is required');
    }

    // Determine if we're using test or live key
    const isTestKey = STRIPE_SECRET_KEY.startsWith('sk_test_');
    const keyType = isTestKey ? 'TEST' : 'LIVE';
    console.log(`Stripe key type: ${keyType}`);

    // Get customer to check default payment method and default source
    const customerResponse = await fetch(
      `https://api.stripe.com/v1/customers/${stripe_customer_id}`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    // Handle customer not found - this is the key diagnostic for TEST/LIVE mismatch
    if (!customerResponse.ok) {
      const errorData = await customerResponse.json().catch(() => ({}));
      const errorCode = errorData?.error?.code || 'unknown_error';
      const errorMessage = errorData?.error?.message || 'Unknown Stripe error';
      
      console.error(`Stripe customer lookup failed: ${customerResponse.status}`, errorData);
      
      // Specific handling for "resource_missing" (customer not found)
      if (customerResponse.status === 404 || errorCode === 'resource_missing') {
        return new Response(
          JSON.stringify({ 
            error: 'stripe_customer_not_found',
            message: `Stripe customer ${stripe_customer_id} not found in ${keyType} mode. This likely means the customer was created in ${isTestKey ? 'LIVE' : 'TEST'} mode but you're using a ${keyType} API key.`,
            hint: `Check your STRIPE_SECRET_KEY - you're using a ${keyType} key`,
            meta: {
              livemode: !isTestKey,
              key_type: keyType,
              stripe_customer_id,
              customer_found: false,
              counts: { payment_methods: 0, legacy_sources: 0, total: 0 }
            }
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Other errors
      return new Response(
        JSON.stringify({ 
          error: 'stripe_api_error',
          message: errorMessage,
          meta: {
            livemode: !isTestKey,
            key_type: keyType,
            stripe_customer_id,
            customer_found: false,
            counts: { payment_methods: 0, legacy_sources: 0, total: 0 }
          }
        }),
        { status: customerResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const customer = await customerResponse.json();
    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || null;
    const defaultSourceId = customer.default_source || null;
    const customerLivemode = customer.livemode;
    
    console.log('Customer found:', {
      id: customer.id,
      livemode: customerLivemode,
      default_payment_method: defaultPaymentMethodId,
      default_source: defaultSourceId
    });

    // Get modern payment methods
    const pmResponse = await fetch(
      `https://api.stripe.com/v1/payment_methods?customer=${stripe_customer_id}&type=card`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    let paymentMethods: any[] = [];
    if (pmResponse.ok) {
      const pmData = await pmResponse.json();
      paymentMethods = pmData.data.map((pm: any) => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        is_default: pm.id === defaultPaymentMethodId,
        type: 'payment_method'
      }));
      console.log(`Found ${paymentMethods.length} modern payment methods`);
    } else {
      console.warn('Failed to fetch payment methods:', await pmResponse.text());
    }

    // Get legacy sources (cards saved via older Stripe API)
    const sourcesResponse = await fetch(
      `https://api.stripe.com/v1/customers/${stripe_customer_id}/sources?object=card`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    let legacySources: any[] = [];
    if (sourcesResponse.ok) {
      const sourcesData = await sourcesResponse.json();
      legacySources = sourcesData.data.map((source: any) => ({
        id: source.id,
        brand: source.brand,
        last4: source.last4,
        exp_month: source.exp_month,
        exp_year: source.exp_year,
        is_default: source.id === defaultSourceId,
        type: 'source'
      }));
      console.log(`Found ${legacySources.length} legacy sources`);
    } else {
      console.warn('Failed to fetch legacy sources:', await sourcesResponse.text());
    }

    // Combine both arrays (modern payment methods first, then legacy sources)
    const allPaymentMethods = [...paymentMethods, ...legacySources];
    console.log(`Total payment methods: ${allPaymentMethods.length}`);

    return new Response(
      JSON.stringify({ 
        payment_methods: allPaymentMethods,
        meta: {
          livemode: customerLivemode,
          key_type: keyType,
          stripe_customer_id,
          customer_found: true,
          customer_name: customer.name || null,
          customer_email: customer.email || null,
          counts: {
            payment_methods: paymentMethods.length,
            legacy_sources: legacySources.length,
            total: allPaymentMethods.length
          },
          defaults: {
            default_payment_method_id: defaultPaymentMethodId,
            default_source_id: defaultSourceId
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error getting payment methods:', error);
    return new Response(
      JSON.stringify({ 
        error: 'internal_error',
        message: error.message,
        meta: {
          customer_found: false,
          counts: { payment_methods: 0, legacy_sources: 0, total: 0 }
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
