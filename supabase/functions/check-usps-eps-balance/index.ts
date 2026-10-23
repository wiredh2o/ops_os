import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getUSPSToken(clientId: string, clientSecret: string): Promise<string> {
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
    const USPS_ACCOUNT_ID = TENANT_KEYS['USPS_ACCOUNT_ID'];

    // Parse URL for mock balance parameter
    const url = new URL(req.url);
    const mockBalanceParam = url.searchParams.get('mockBalance');

    // If no USPS credentials, return mock balance
    if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET || !USPS_ACCOUNT_ID) {
      console.log('USPS credentials not configured - returning mock balance');

      // Default mock balance is $100, but can be overridden for testing
      const mockBalance = mockBalanceParam ? parseFloat(mockBalanceParam) : 100.00;

      return new Response(
        JSON.stringify({
          success: true,
          balance: mockBalance,
          accountId: 'MOCK-ACCOUNT',
          isMock: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Real USPS API call
    console.log('Checking USPS EPS balance with live credentials');
    const token = await getUSPSToken(USPS_CLIENT_ID, USPS_CLIENT_SECRET);

    const balanceResponse = await fetch(
      `https://api.usps.com/payments/v3/payment-account/${USPS_ACCOUNT_ID}/balance`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!balanceResponse.ok) {
      const error = await balanceResponse.text();
      console.error('USPS balance error:', error);
      throw new Error('Failed to get EPS balance');
    }

    const balanceData = await balanceResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        balance: balanceData.balance || balanceData.availableBalance || 0,
        accountId: USPS_ACCOUNT_ID,
        isMock: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error checking USPS EPS balance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
