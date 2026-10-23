import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UPSRate {
  service_type: string;
  service_name: string;
  total_charge: number;
  account_charge?: number;
  currency: string;
  transit_days?: number;
  transit_hours?: number;
  delivery_date?: string;
}

// UPS service type to name mapping
const UPS_SERVICES: Record<string, string> = {
  '03': 'UPS Ground',
  '02': 'UPS 2nd Day Air',
  '01': 'UPS Next Day Air',
  '13': 'UPS Next Day Air Saver',
  '14': 'UPS Next Day Air Early',
  '12': 'UPS 3 Day Select',
  '59': 'UPS 2nd Day Air A.M.',
};

// UPS service type to transit HOURS mapping for high-resolution sorting
// Hours measured from ship date to delivery
const UPS_SERVICE_TRANSIT_HOURS: Record<string, number> = {
  '14': 24,     // UPS Next Day Air Early A.M. (8:00 AM next business day)
  '01': 26.5,   // UPS Next Day Air (10:30 AM next business day)
  '13': 36,     // UPS Next Day Air Saver (3:00-8:00 PM next business day)
  '59': 50.5,   // UPS 2nd Day Air A.M. (10:30 AM day 2)
  '02': 60,     // UPS 2nd Day Air (end of day 2)
  '12': 84,     // UPS 3 Day Select (end of day 3)
  '03': 120,    // UPS Ground (~5 business days)
};

// Convert hours to days for display
const hoursToDisplayDays = (hours: number): number => Math.ceil(hours / 24);

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

function generateMockRates(packages: any[]): UPSRate[] {
  // Calculate base weight
  const totalWeight = packages.reduce((sum, pkg) => sum + (pkg.weight_lbs || 1), 0);
  const baseMultiplier = Math.max(1, totalWeight / 5);

  // Generate retail rates with ~20% discount for account rates
  const groundRetail = Math.round((8.99 + (baseMultiplier * 2.5)) * 100) / 100;
  const threeDayRetail = Math.round((15.99 + (baseMultiplier * 3.5)) * 100) / 100;
  const twoDayAmRetail = Math.round((22.99 + (baseMultiplier * 4)) * 100) / 100;
  const twoDayRetail = Math.round((24.99 + (baseMultiplier * 4.5)) * 100) / 100;
  const nextDaySaverRetail = Math.round((38.99 + (baseMultiplier * 5.5)) * 100) / 100;
  const nextDayRetail = Math.round((45.99 + (baseMultiplier * 6)) * 100) / 100;
  const nextDayEarlyRetail = Math.round((55.99 + (baseMultiplier * 7)) * 100) / 100;

  return [
    {
      service_type: '14',
      service_name: 'UPS Next Day Air Early',
      total_charge: nextDayEarlyRetail,
      account_charge: Math.round(nextDayEarlyRetail * 0.72 * 100) / 100,
      currency: 'USD',
      transit_days: 1,
      transit_hours: 24,
    },
    {
      service_type: '01',
      service_name: 'UPS Next Day Air',
      total_charge: nextDayRetail,
      account_charge: Math.round(nextDayRetail * 0.75 * 100) / 100,
      currency: 'USD',
      transit_days: 1,
      transit_hours: 26.5,
    },
    {
      service_type: '13',
      service_name: 'UPS Next Day Air Saver',
      total_charge: nextDaySaverRetail,
      account_charge: Math.round(nextDaySaverRetail * 0.77 * 100) / 100,
      currency: 'USD',
      transit_days: 1,
      transit_hours: 36,
    },
    {
      service_type: '59',
      service_name: 'UPS 2nd Day Air A.M.',
      total_charge: twoDayAmRetail,
      account_charge: Math.round(twoDayAmRetail * 0.76 * 100) / 100,
      currency: 'USD',
      transit_days: 2,
      transit_hours: 50.5,
    },
    {
      service_type: '02',
      service_name: 'UPS 2nd Day Air',
      total_charge: twoDayRetail,
      account_charge: Math.round(twoDayRetail * 0.78 * 100) / 100,
      currency: 'USD',
      transit_days: 2,
      transit_hours: 60,
    },
    {
      service_type: '12',
      service_name: 'UPS 3 Day Select',
      total_charge: threeDayRetail,
      account_charge: Math.round(threeDayRetail * 0.82 * 100) / 100,
      currency: 'USD',
      transit_days: 3,
      transit_hours: 84,
    },
    {
      service_type: '03',
      service_name: 'UPS Ground',
      total_charge: groundRetail,
      account_charge: Math.round(groundRetail * 0.80 * 100) / 100,
      currency: 'USD',
      transit_days: 5,
      transit_hours: 120,
    },
  ];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let isMock = false;

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['ups']);
    const UPS_CLIENT_ID = TENANT_KEYS['UPS_CLIENT_ID'];
    const UPS_CLIENT_SECRET = TENANT_KEYS['UPS_CLIENT_SECRET'];
    const UPS_ACCOUNT_NUMBER = TENANT_KEYS['UPS_ACCOUNT_NUMBER'];

    const { ship_from, ship_to, packages, ship_date } = await req.json();

    if (!ship_from || !ship_to || !packages || packages.length === 0) {
      throw new Error('Missing required shipping details');
    }

    if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET || !UPS_ACCOUNT_NUMBER) {
      throw new Error('UPS credentials are not set up. Add them in Settings → System → Integrations & API Keys.');
    }

    // Real UPS API call - wrap in try/catch to fall back to mock on failure
    console.log('Getting UPS rates with live credentials');
    
    try {
      const token = await getUPSToken(UPS_CLIENT_ID, UPS_CLIENT_SECRET);

      const rateRequest = {
        RateRequest: {
          Request: {
            RequestOption: 'Shop',
          },
          Shipment: {
            Shipper: {
              Address: {
                AddressLine: [ship_from.street],
                City: ship_from.city,
                StateProvinceCode: ship_from.state,
                PostalCode: ship_from.postal_code,
                CountryCode: ship_from.country || 'US',
              },
              ShipperNumber: UPS_ACCOUNT_NUMBER,
            },
            ShipTo: {
              Address: {
                AddressLine: [ship_to.street],
                City: ship_to.city,
                StateProvinceCode: ship_to.state,
                PostalCode: ship_to.postal_code,
                CountryCode: ship_to.country || 'US',
                ResidentialAddressIndicator: ship_to.residential ? 'Y' : undefined,
              },
            },
            ShipFrom: {
              Address: {
                AddressLine: [ship_from.street],
                City: ship_from.city,
                StateProvinceCode: ship_from.state,
                PostalCode: ship_from.postal_code,
                CountryCode: ship_from.country || 'US',
              },
            },
            ShipmentRatingOptions: {
              NegotiatedRatesIndicator: '',
            },
            Package: packages.map((pkg: any) => ({
              PackagingType: { Code: '02' }, // Customer Supplied Package
              Dimensions: pkg.dimensions ? {
                UnitOfMeasurement: { Code: 'IN' },
                Length: String(pkg.dimensions.length),
                Width: String(pkg.dimensions.width),
                Height: String(pkg.dimensions.height),
              } : undefined,
              PackageWeight: {
                UnitOfMeasurement: { Code: 'LBS' },
                Weight: String(pkg.weight_lbs || 1),
              },
            })),
          },
        },
      };

      const rateResponse = await fetch('https://onlinetools.ups.com/api/rating/v1/Shop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'transId': crypto.randomUUID(),
          'transactionSrc': 'lovable',
        },
        body: JSON.stringify(rateRequest),
      });

      if (!rateResponse.ok) {
        const error = await rateResponse.text();
        console.error('UPS rate error:', error);
        throw new Error('Failed to get UPS rates');
      }

      const rateData = await rateResponse.json();
      const ratedShipments = rateData.RateResponse?.RatedShipment || [];

      const rates: UPSRate[] = ratedShipments.map((shipment: any) => {
        const serviceCode = shipment.Service?.Code;
        // Published/retail rate
        const retailCharge = parseFloat(shipment.TotalCharges?.MonetaryValue || '0');
        // Negotiated rate (if available)
        const negotiatedCharge = shipment.NegotiatedRateCharges?.TotalCharge?.MonetaryValue
          ? parseFloat(shipment.NegotiatedRateCharges.TotalCharge.MonetaryValue)
          : undefined;
        
        // Use high-resolution hours mapping
        const transitHours = UPS_SERVICE_TRANSIT_HOURS[serviceCode] || 120;
        const transitDays = hoursToDisplayDays(transitHours);
        
        return {
          service_type: serviceCode,
          service_name: UPS_SERVICES[serviceCode] || `UPS Service ${serviceCode}`,
          total_charge: retailCharge,
          account_charge: negotiatedCharge !== retailCharge ? negotiatedCharge : undefined,
          currency: shipment.TotalCharges?.CurrencyCode || 'USD',
          transit_days: transitDays,
          transit_hours: transitHours,
        };
      });

      console.log(`Got ${rates.length} UPS rate options`);

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
      console.error('UPS API failed:', apiError.message);
      throw apiError;
    }
  } catch (error: any) {
    console.error('Error getting UPS rates:', error);
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
