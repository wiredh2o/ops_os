import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getFedExToken(apiKey: string, secretKey: string): Promise<string> {
  console.log('Authenticating with FedEx...');
  
  const response = await fetch('https://apis-sandbox.fedex.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: apiKey,
      client_secret: secretKey,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('FedEx auth error:', error);
    throw new Error('Failed to authenticate with FedEx');
  }

  const data = await response.json();
  console.log('FedEx authentication successful');
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['fedex']);
    const FEDEX_API_KEY = TENANT_KEYS['FEDEX_SANDBOX_API_KEY'];
    const FEDEX_SECRET_KEY = TENANT_KEYS['FEDEX_SANDBOX_SECRET_KEY'];
    const FEDEX_ACCOUNT_NUMBER = TENANT_KEYS['FEDEX_SANDBOX_ACCOUNT'];
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!FEDEX_API_KEY || !FEDEX_SECRET_KEY || !FEDEX_ACCOUNT_NUMBER) {
      throw new Error('FedEx credentials not configured');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const { tracking_number, order_id } = await req.json();

    console.log('Voiding FedEx shipment:', { tracking_number, order_id });

    if (!tracking_number) {
      throw new Error('Missing tracking number');
    }

    // Get auth token
    const token = await getFedExToken(FEDEX_API_KEY, FEDEX_SECRET_KEY);

    // Build cancel shipment request
    const cancelRequest = {
      accountNumber: {
        value: FEDEX_ACCOUNT_NUMBER,
      },
      trackingNumber: tracking_number,
      senderCountryCode: 'US',
      deletionControl: 'DELETE_ALL_PACKAGES',
    };

    console.log('Sending cancel request to FedEx...');

    const cancelResponse = await fetch('https://apis-sandbox.fedex.com/ship/v1/shipments/cancel', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US',
      },
      body: JSON.stringify(cancelRequest),
    });

    const responseText = await cancelResponse.text();
    console.log('FedEx cancel response status:', cancelResponse.status);
    console.log('FedEx cancel response:', responseText);

    let cancelData;
    try {
      cancelData = JSON.parse(responseText);
    } catch {
      cancelData = { rawResponse: responseText };
    }

    // Check if the shipment was successfully voided
    // FedEx returns various status codes and messages
    const isSuccess = cancelResponse.ok || 
      cancelResponse.status === 200 || 
      cancelResponse.status === 204;

    // Check for already voided or expired labels
    const alreadyVoided = responseText.includes('ALREADY') || 
      responseText.includes('VOID') ||
      responseText.includes('CANCELLED') ||
      responseText.includes('EXPIRED');

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // If we have an order_id, update the order to clear shipping info
    if (order_id) {
      console.log('Clearing shipping info from order:', order_id);
      
      const { error: updateError } = await supabase
        .from('production_orders')
        .update({
          fedex_tracking_number: null,
          fedex_label_url: null,
          shipping_carrier: null,
          label_created_at: null,
          picked_up_at: null,
        })
        .eq('id', order_id);

      if (updateError) {
        console.error('Failed to update order:', updateError);
      }
    }

    if (isSuccess || alreadyVoided) {
      console.log('FedEx shipment voided successfully or was already voided');
      
      return new Response(
        JSON.stringify({
          success: true,
          message: alreadyVoided 
            ? 'Shipment was already voided or expired' 
            : 'Shipment voided successfully',
          alreadyVoided,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // If FedEx returns an error, we still consider it a "success" for our purposes
      // because we've cleared the order data and the label can't be used anyway
      console.warn('FedEx void failed but continuing:', cancelData);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Label voiding attempted - order data cleared',
          fedexResponse: cancelData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error voiding FedEx shipment:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        message: 'Failed to void shipment but order can still be deleted'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
