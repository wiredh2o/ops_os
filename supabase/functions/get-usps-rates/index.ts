import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

function generateMockRates(packages: any[]): USPSRate[] {
  const pkg = packages[0] || {};
  const totalWeight = packages.reduce((sum, p) => sum + (p.weight_lbs || 1), 0);
  const baseMultiplier = Math.max(1, totalWeight / 5);
  
  const rates: USPSRate[] = [];
  
  // Weight-based rates - retail with commercial discount
  const groundRetail = Math.round((5.99 + (baseMultiplier * 1.5)) * 100) / 100;
  const priorityRetail = Math.round((9.99 + (baseMultiplier * 2.5)) * 100) / 100;
  const expressRetail = Math.round((28.99 + (baseMultiplier * 4)) * 100) / 100;
  
  rates.push({
    service_type: 'USPS_GROUND_ADVANTAGE',
    service_name: 'USPS Ground Advantage',
    total_charge: groundRetail,
    account_charge: Math.round(groundRetail * 0.85 * 100) / 100,
    currency: 'USD',
    transit_days: 5,
    transit_hours: 120,
    pricing_type: 'weight_based',
  });
  
  rates.push({
    service_type: 'PRIORITY_MAIL',
    service_name: 'Priority Mail',
    total_charge: priorityRetail,
    account_charge: Math.round(priorityRetail * 0.88 * 100) / 100,
    currency: 'USD',
    transit_days: 3,
    transit_hours: 72,
    pricing_type: 'weight_based',
  });
  
  rates.push({
    service_type: 'PRIORITY_MAIL_EXPRESS',
    service_name: 'Priority Mail Express',
    total_charge: expressRetail,
    account_charge: Math.round(expressRetail * 0.82 * 100) / 100,
    currency: 'USD',
    transit_days: 2,
    transit_hours: 42,
    pricing_type: 'weight_based',
  });
  
  // Check for eligible flat rate boxes - use retail price as primary, commercial as account
  const pkgDims = pkg.dimensions || { length: 6, width: 6, height: 6 };
  const eligibleBoxes = getEligibleFlatRateBoxes(pkgDims, totalWeight);
  
  for (const box of eligibleBoxes) {
    rates.push({
      service_type: `FLAT_RATE_${box.id}`,
      service_name: `Priority Mail ${box.name}`,
      total_charge: box.retailPrice,
      account_charge: box.commercialPrice,
      currency: 'USD',
      transit_days: 3,
      transit_hours: 72,  // Priority Mail flat rate = same as Priority Mail
      pricing_type: 'flat_rate',
      container_type: box.id,
    });
  }
  
  return rates;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let isMock = false;

  try {
    const USPS_CLIENT_ID = Deno.env.get('USPS_CLIENT_ID');
    const USPS_CLIENT_SECRET = Deno.env.get('USPS_CLIENT_SECRET');

    const { ship_from, ship_to, packages, ship_date } = await req.json();

    if (!ship_from || !ship_to || !packages || packages.length === 0) {
      throw new Error('Missing required shipping details');
    }

    // If no USPS credentials, return mock rates
    if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
      console.log('USPS credentials not configured - returning mock rates');
      isMock = true;

      const mockRates = generateMockRates(packages);

      return new Response(
        JSON.stringify({
          success: true,
          rates: mockRates,
          isMock: true,
          environment: 'sandbox',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Real USPS API call - wrap in try/catch to fall back to mock on failure
    console.log('Getting USPS rates with live credentials');
    
    try {
      const token = await getUSPSToken(USPS_CLIENT_ID, USPS_CLIENT_SECRET);

      const pkg = packages[0]; // USPS API handles one package at a time
      const priceRequest = {
        originZIPCode: ship_from.postal_code,
        destinationZIPCode: ship_to.postal_code,
        weight: pkg.weight_lbs || 1,
        length: pkg.dimensions?.length || 6,
        width: pkg.dimensions?.width || 6,
        height: pkg.dimensions?.height || 6,
        mailClass: 'ALL',
        processingCategory: 'MACHINABLE',
        rateIndicator: 'SP', // Single Piece
        destinationEntryFacilityType: 'NONE',
        priceType: 'COMMERCIAL',
      };

      const priceResponse = await fetch('https://api.usps.com/prices/v3/base-rates/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(priceRequest),
      });

      if (!priceResponse.ok) {
        const error = await priceResponse.text();
        console.error('USPS price error:', error);
        throw new Error('Failed to get USPS rates');
      }

      const priceData = await priceResponse.json();
      const rateOptions = priceData.rates || [];

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
      // API call failed (invalid credentials, network error, etc.) - fall back to mock rates
      console.warn('USPS API failed, falling back to mock rates:', apiError.message);
      
      const mockRates = generateMockRates(packages);
      
      return new Response(
        JSON.stringify({
          success: true,
          rates: mockRates,
          isMock: true,
          environment: 'sandbox',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
