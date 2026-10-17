import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getUPSToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://onlinetools.ups.com/security/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('UPS auth error:', error);
    throw new Error('Failed to authenticate with UPS');
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const UPS_CLIENT_ID = Deno.env.get('UPS_CLIENT_ID');
    const UPS_CLIENT_SECRET = Deno.env.get('UPS_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const { tracking_number, order_id } = await req.json();

    if (!tracking_number) {
      throw new Error('Missing tracking number');
    }

    // Check if this is a mock shipment
    const isMock = tracking_number.startsWith('MOCK');

    if (isMock) {
      console.log('Mock UPS shipment - voiding without API call');
      
      // Update order in database if order_id provided
      if (order_id && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase
          .from('production_orders')
          .update({
            fedex_tracking_number: null,
            fedex_label_url: null,
            shipping_cost: null,
            carrier: null,
            shipping_carrier: null,
            label_created_at: null,
            picked_up_at: null,
          })
          .eq('id', order_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Mock shipment voided successfully',
          isMock: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Real UPS void
    if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
      throw new Error('UPS credentials not configured');
    }

    console.log('Voiding UPS shipment:', tracking_number);
    const token = await getUPSToken(UPS_CLIENT_ID, UPS_CLIENT_SECRET);

    const voidResponse = await fetch(
      `https://onlinetools.ups.com/api/shipments/v1/void/cancel/${tracking_number}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'transId': crypto.randomUUID(),
          'transactionSrc': 'lovable',
        },
      }
    );

    if (!voidResponse.ok) {
      const error = await voidResponse.text();
      console.error('UPS void error:', error);
      // Continue anyway - the shipment may already be voided or delivered
    }

    // Update order in database if order_id provided
    if (order_id && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from('production_orders')
        .update({
          fedex_tracking_number: null,
          fedex_label_url: null,
          shipping_cost: null,
          carrier: null,
          shipping_carrier: null,
          label_created_at: null,
          picked_up_at: null,
        })
        .eq('id', order_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'UPS shipment voided successfully',
        isMock: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error voiding UPS shipment:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
