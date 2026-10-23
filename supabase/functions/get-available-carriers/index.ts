import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CarrierInfo {
  id: string;
  name: string;
  available: boolean;
  isMock: boolean;
  logo?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const carriers: CarrierInfo[] = [];

    // Check FedEx credentials
    const TENANT_KEYS = await loadTenantKeys(req, ['fedex', 'ups', 'usps']);
    const hasFedExProd = !!(
      TENANT_KEYS['FEDEX_API_KEY'] && 
      TENANT_KEYS['FEDEX_SECRET_KEY'] && 
      TENANT_KEYS['FEDEX_ACCOUNT']
    );
    const hasFedExSandbox = !!(
      TENANT_KEYS['FEDEX_SANDBOX_API_KEY'] && 
      TENANT_KEYS['FEDEX_SANDBOX_SECRET_KEY'] && 
      TENANT_KEYS['FEDEX_SANDBOX_ACCOUNT']
    );
    
    carriers.push({
      id: 'fedex',
      name: 'FedEx',
      available: hasFedExProd || hasFedExSandbox,
      isMock: false, // FedEx always uses real API (sandbox or production)
    });

    // Check UPS credentials
    const hasUPS = !!(
      TENANT_KEYS['UPS_CLIENT_ID'] && 
      TENANT_KEYS['UPS_CLIENT_SECRET'] && 
      TENANT_KEYS['UPS_ACCOUNT_NUMBER']
    );
    
    carriers.push({
      id: 'ups',
      name: 'UPS',
      available: hasUPS,
      isMock: false,
    });

    // Check USPS credentials
    const hasUSPS = !!(
      TENANT_KEYS['USPS_CLIENT_ID'] && 
      TENANT_KEYS['USPS_CLIENT_SECRET']
    );
    
    carriers.push({
      id: 'usps',
      name: 'USPS',
      available: hasUSPS,
      isMock: false,
    });

    console.log('Available carriers:', carriers.map(c => `${c.id}:${c.isMock ? 'mock' : 'live'}`).join(', '));

    return new Response(
      JSON.stringify({ 
        success: true,
        carriers,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error checking carriers:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        carriers: [],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
