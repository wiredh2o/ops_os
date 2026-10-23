import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface USPSRate {
  service_type: string;
  service_name: string;
  total_charge: number;
  account_charge?: number;
  currency: string;
  transit_days?: number;
  transit_hours?: number;
  delivery_date?: string;
  pricing_type?: 'weight_based' | 'flat_rate';
  container_type?: string;
}

// USPS service type to transit HOURS mapping for high-resolution sorting
// USPS is less granular than FedEx/UPS - delivery times are usually "by end of day"
const USPS_SERVICE_TRANSIT_HOURS: Record<string, number> = {
  'PRIORITY_MAIL_EXPRESS': 42,      // Next day by 6:00 PM (1-2 days guaranteed)
  'PRIORITY_MAIL': 72,              // 1-3 business days (no guaranteed time)
  'USPS_GROUND_ADVANTAGE': 120,     // 2-5 business days
  'FIRST_CLASS': 120,               // 2-5 business days
  'PARCEL_SELECT': 168,             // 2-8 business days
  'MEDIA_MAIL': 192,                // 2-8 business days
};

// Convert hours to days for display
const hoursToDisplayDays = (hours: number): number => Math.ceil(hours / 24);

// USPS Flat Rate Box specifications (internal dimensions in inches)
const FLAT_RATE_BOXES = [
  {
    id: 'SMALL_FLAT_RATE_BOX',
    name: 'Small Flat Rate Box',
    dimensions: { length: 8.625, width: 5.375, height: 1.625 },
    maxWeight: 70, // lbs
    commercialPrice: 9.65,
    retailPrice: 10.40,
    mailClass: 'PRIORITY_MAIL',
  },
  {
    id: 'MEDIUM_FLAT_RATE_BOX_TOP',
    name: 'Medium Flat Rate Box (Top-Loading)',
    dimensions: { length: 11.25, width: 8.75, height: 6 },
    maxWeight: 70,
    commercialPrice: 17.05,
    retailPrice: 17.10,
    mailClass: 'PRIORITY_MAIL',
  },
  {
    id: 'MEDIUM_FLAT_RATE_BOX_SIDE',
    name: 'Medium Flat Rate Box (Side-Loading)',
    dimensions: { length: 14, width: 12, height: 3.5 },
    maxWeight: 70,
    commercialPrice: 17.05,
    retailPrice: 17.10,
    mailClass: 'PRIORITY_MAIL',
  },
  {
    id: 'LARGE_FLAT_RATE_BOX',
    name: 'Large Flat Rate Box',
    dimensions: { length: 12.25, width: 12, height: 6 },
    maxWeight: 70,
    commercialPrice: 22.90,
    retailPrice: 23.60,
    mailClass: 'PRIORITY_MAIL',
  },
  {
    id: 'FLAT_RATE_ENVELOPE',
    name: 'Flat Rate Envelope',
    dimensions: { length: 12.5, width: 9.5, height: 0.75 }, // Max thickness ~0.75"
    maxWeight: 70,
    commercialPrice: 9.30,
    retailPrice: 10.00,
    mailClass: 'PRIORITY_MAIL',
  },
];

// Check if package dimensions fit within a container (any orientation)
function fitsInContainer(
  pkg: { length: number; width: number; height: number },
  container: { length: number; width: number; height: number }
): boolean {
  // Sort both sets of dimensions from largest to smallest
  const pkgDims = [pkg.length, pkg.width, pkg.height].sort((a, b) => b - a);
  const containerDims = [container.length, container.width, container.height].sort((a, b) => b - a);
  
  // Package fits if each dimension is <= corresponding container dimension
  return pkgDims[0] <= containerDims[0] && 
         pkgDims[1] <= containerDims[1] && 
         pkgDims[2] <= containerDims[2];
}

// Get eligible flat rate boxes for given package dimensions and weight
function getEligibleFlatRateBoxes(
  packageDims: { length: number; width: number; height: number },
  weightLbs: number
): typeof FLAT_RATE_BOXES {
  return FLAT_RATE_BOXES.filter(box => 
    weightLbs <= box.maxWeight && 
    fitsInContainer(packageDims, box.dimensions)
  );
}

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

  let isMock = false;

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['usps']);
    const USPS_CLIENT_ID = TENANT_KEYS['USPS_CLIENT_ID'];
    const USPS_CLIENT_SECRET = TENANT_KEYS['USPS_CLIENT_SECRET'];

    const { ship_from, ship_to, packages, ship_date } = await req.json();

    if (!ship_from || !ship_to || !packages || packages.length === 0) {
      throw new Error('Missing required shipping details');
    }

    if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
      throw new Error('USPS credentials are not set up. Add them in Settings → System → Integrations & API Keys.');
    }

    // Real USPS API call - wrap in try/catch to fall back to mock on failure
    console.log('Getting USPS rates with live credentials');
    
    try {
      const token = await getUSPSToken(USPS_CLIENT_ID, USPS_CLIENT_SECRET);

      const pkg = packages[0]; // USPS API handles one package at a time
      const MAIL_CLASSES = ['USPS_GROUND_ADVANTAGE', 'PRIORITY_MAIL', 'PRIORITY_MAIL_EXPRESS'];
      const errors: string[] = [];
      const rateOptions: any[] = [];
      await Promise.all(MAIL_CLASSES.map(async (mailClass) => {
        const priceRequest = {
          originZIPCode: ship_from.postal_code,
          destinationZIPCode: ship_to.postal_code,
          weight: pkg.weight_lbs || 1,
          length: pkg.dimensions?.length || 6,
          width: pkg.dimensions?.width || 6,
          height: pkg.dimensions?.height || 6,
          mailClass,
          processingCategory: 'MACHINABLE',
          rateIndicator: 'SP',
          destinationEntryFacilityType: 'NONE',
          priceType: 'COMMERCIAL',
        };
        const priceResponse = await fetch('https://api.usps.com/prices/v3/base-rates/search', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(priceRequest),
        });
        if (!priceResponse.ok) {
          const text = await priceResponse.text();
          console.error(`USPS price error (${mailClass}):`, text);
          let msg = text;
          try { msg = JSON.parse(text)?.error?.message || text; } catch { /* keep text */ }
          errors.push(`${mailClass}: ${String(msg).slice(0, 200)}`);
          return;
        }
        const data = await priceResponse.json();
        for (const r of (data.rates || [])) rateOptions.push({ ...r, mailClass: r.mailClass || mailClass });
        if (!data.rates && data.totalBasePrice != null) rateOptions.push({ ...data, mailClass });
      }));

      if (rateOptions.length === 0) {
        throw new Error(`USPS did not return any prices. ${errors.join(' | ')}`);
      }

      const rates: USPSRate[] = rateOptions.map((rate: any) => {
        const serviceType = rate.mailClass;
        // Use hours mapping or fall back to API-provided days converted to hours
        const transitHours = USPS_SERVICE_TRANSIT_HOURS[serviceType] || (rate.deliveryDays ? rate.deliveryDays * 24 : 120);
        const transitDays = hoursToDisplayDays(transitHours);
        
        return {
          service_type: serviceType,
          service_name: rate.productName || serviceType,
          total_charge: rate.totalBasePrice || rate.price || 0,
          currency: 'USD',
          transit_days: transitDays,
          transit_hours: transitHours,
        };
      });

      console.log(`Got ${rates.length} USPS rate options`);

      return new Response(
        JSON.stringify({
          success: true,
          rates,
          isMock: false,
          environment: 'production',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (apiError: any) {
      console.error('USPS API failed:', apiError.message);
      throw apiError;
    }
  } catch (error: any) {
    console.error('Error getting USPS rates:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        isMock,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
