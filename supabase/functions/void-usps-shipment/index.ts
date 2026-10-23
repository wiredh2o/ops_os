import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getUSPSToken(clientId: string, clientSecret: string): Promise<string> {
  console.log('Authenticating with USPS...');
  
  const response = await fetch('https://api.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('USPS auth error:', error);
    throw new Error('Failed to authenticate with USPS');
  }

  const data = await response.json();
  console.log('USPS authentication successful');
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['usps']);
    const USPS_CLIENT_ID = TENANT_KEYS['USPS_CLIENT_ID'];
    const USPS_CLIENT_SECRET = TENANT_KEYS['USPS_CLIENT_SECRET'];
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const { tracking_number, order_id } = await req.json();

    if (!tracking_number) {
      throw new Error('Missing tracking number');
    }

    // Check if this is a mock shipment
    const isMock = tracking_number.startsWith('MOCK');

    if (isMock) {
      console.log('Mock USPS shipment - voiding without API call');
      
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

    // Real USPS refund
    if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
      console.log('USPS credentials not configured - clearing order data only');
      
      // Still clear order data even without API credentials
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
          message: 'Order data cleared (USPS credentials not configured for refund)',
          refundStatus: 'skipped',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Requesting USPS label refund:', tracking_number);
    const token = await getUSPSToken(USPS_CLIENT_ID, USPS_CLIENT_SECRET);

    // Call USPS Label Refund API
    // USPS labels can be refunded within 30 days of purchase if unused
    const refundResponse = await fetch(
      'https://api.usps.com/labels/v3/label-refund',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingNumber: tracking_number,
        }),
      }
    );

    const responseText = await refundResponse.text();
    console.log('USPS refund response status:', refundResponse.status);
    console.log('USPS refund response:', responseText);

    let refundData;
    try {
      refundData = JSON.parse(responseText);
    } catch {
      refundData = { rawResponse: responseText };
    }

    // USPS refund can have various outcomes:
    // - Approved: refund immediately credited to EPS account
    // - Pending: refund under review (30 day window)
    // - Rejected: label already used or expired
    const isSuccess = refundResponse.ok || 
      refundResponse.status === 200 || 
      refundResponse.status === 201 ||
      refundResponse.status === 202;

    // Check for already refunded or used labels
    const alreadyProcessed = responseText.includes('ALREADY') || 
      responseText.includes('REFUND') ||
      responseText.includes('USED') ||
      responseText.includes('EXPIRED');

    // Update order in database
    if (order_id && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Clearing shipping info from order:', order_id);
      
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: updateError } = await supabase
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

      if (updateError) {
        console.error('Failed to update order:', updateError);
      }
    }

    if (isSuccess) {
      console.log('USPS label refund requested successfully');
      
      // Determine refund status from response
      let refundStatus = 'approved';
      if (refundData.status === 'pending' || responseText.includes('PENDING')) {
        refundStatus = 'pending';
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: refundStatus === 'pending' 
            ? 'Label refund submitted - under review (up to 30 days)'
            : 'Label refund approved - credited to EPS account',
          refundStatus,
          uspsResponse: refundData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (alreadyProcessed) {
      console.log('USPS label was already refunded or used');
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Label was already refunded, used, or expired',
          alreadyProcessed: true,
          uspsResponse: refundData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // USPS returned an error but we still clear order data
      console.warn('USPS refund failed but continuing:', refundData);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Label refund attempted - order data cleared',
          uspsResponse: refundData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error refunding USPS label:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        message: 'Failed to refund label but order can still be deleted'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
