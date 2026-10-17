import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize country codes to ISO 3166-1 alpha-2 (2-letter codes)
function normalizeCountryCode(country: string | undefined): string {
  if (!country) return 'US';
  
  const trimmed = country.trim();
  const upper = trimmed.toUpperCase();
  
  // Common mappings
  const mapping: Record<string, string> = {
    'USA': 'US',
    'UNITED STATES': 'US',
    'UNITED STATES OF AMERICA': 'US',
    'CANADA': 'CA',
    'CAN': 'CA',
    'MEXICO': 'MX',
    'MEX': 'MX',
    'UNITED KINGDOM': 'GB',
    'UK': 'GB',
    'GBR': 'GB',
    'GREAT BRITAIN': 'GB',
  };
  
  // Check direct mapping first
  if (mapping[upper]) {
    return mapping[upper];
  }
  
  // If already 2 letters, return as-is (uppercase)
  if (trimmed.length === 2) {
    return upper;
  }
  
  // Default to US if we can't determine
  console.warn(`Unknown country code "${country}", defaulting to US`);
  return 'US';
}

// Determine FedEx environment and credentials
function getFedExConfig(): { apiKey: string; secretKey: string; account: string; baseUrl: string; environment: 'production' | 'sandbox' } {
  // Try production credentials first
  const prodApiKey = Deno.env.get('FEDEX_API_KEY');
  const prodSecretKey = Deno.env.get('FEDEX_SECRET_KEY');
  const prodAccount = Deno.env.get('FEDEX_ACCOUNT');
  
  if (prodApiKey && prodSecretKey && prodAccount) {
    console.log('Using FedEx PRODUCTION credentials');
    return {
      apiKey: prodApiKey,
      secretKey: prodSecretKey,
      account: prodAccount,
      baseUrl: 'https://apis.fedex.com',
      environment: 'production',
    };
  }
  
  // Fall back to sandbox credentials
  const sandboxApiKey = Deno.env.get('FEDEX_SANDBOX_API_KEY');
  const sandboxSecretKey = Deno.env.get('FEDEX_SANDBOX_SECRET_KEY');
  const sandboxAccount = Deno.env.get('FEDEX_SANDBOX_ACCOUNT');
  
  if (sandboxApiKey && sandboxSecretKey && sandboxAccount) {
    console.log('Using FedEx SANDBOX credentials');
    return {
      apiKey: sandboxApiKey,
      secretKey: sandboxSecretKey,
      account: sandboxAccount,
      baseUrl: 'https://apis-sandbox.fedex.com',
      environment: 'sandbox',
    };
  }
  
  throw new Error('No FedEx credentials configured. Set either FEDEX_API_KEY/FEDEX_SECRET_KEY/FEDEX_ACCOUNT (production) or FEDEX_SANDBOX_* (sandbox)');
}

async function getFedExToken(baseUrl: string, apiKey: string, secretKey: string): Promise<string> {
  const response = await fetch(`${baseUrl}/oauth/token`, {
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
  return data.access_token;
}

async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<{ response: Response; errorData?: any }> {
  let lastError: Error | null = null;
  let lastErrorData: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return { response };
      }
      
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      lastErrorData = errorData;
      
      // Check if it's a retryable error (SYSTEM.UNEXPECTED.ERROR)
      const isRetryable = errorData.errors?.some(
        (e: any) => e.code === 'SYSTEM.UNEXPECTED.ERROR'
      );
      
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        console.log(`FedEx returned retryable error, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Not retryable or out of retries - return structured error
      console.error(`FedEx rate error (attempt ${attempt}):`, errorText);
      const firstError = errorData.errors?.[0];
      throw {
        code: firstError?.code || 'UNKNOWN_ERROR',
        message: firstError?.message || 'Unknown FedEx API error',
        details: errorData,
      };
      
    } catch (error: any) {
      // If it's our structured error, re-throw it
      if (error.code) {
        throw error;
      }
      
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        console.log(`Network error, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError || new Error('Failed after max retries');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let environment: 'production' | 'sandbox' = 'sandbox';
  
  try {
    const config = getFedExConfig();
    environment = config.environment;

    const { 
      ship_from,
      ship_to,
      packages,
      ship_date
    } = await req.json();

    // Normalize country codes
    const normalizedShipFromCountry = normalizeCountryCode(ship_from?.country);
    const normalizedShipToCountry = normalizeCountryCode(ship_to?.country);

    console.log('Getting FedEx rates:', { 
      environment,
      ship_from: { ...ship_from, country: normalizedShipFromCountry },
      ship_to: { ...ship_to, country: normalizedShipToCountry },
      packages: packages?.length 
    });

    if (!ship_from || !ship_to || !packages || packages.length === 0) {
      throw new Error('Missing required shipping details');
    }

    // Get auth token
    const token = await getFedExToken(config.baseUrl, config.apiKey, config.secretKey);

    // Build rate request with normalized country codes
    const rateRequest = {
      accountNumber: {
        value: config.account,
      },
      rateRequestControlParameters: {
        returnTransitTimes: true,
        rateSortOrder: 'COMMITASCENDING',
      },
      requestedShipment: {
        shipper: {
          address: {
            streetLines: [ship_from.street],
            city: ship_from.city,
            stateOrProvinceCode: ship_from.state,
            postalCode: ship_from.postal_code,
            countryCode: normalizedShipFromCountry,
          },
        },
        recipient: {
          address: {
            streetLines: [ship_to.street],
            city: ship_to.city,
            stateOrProvinceCode: ship_to.state,
            postalCode: ship_to.postal_code,
            countryCode: normalizedShipToCountry,
            residential: ship_to.residential ?? true,
          },
        },
        shipDateStamp: ship_date || new Date().toISOString().split('T')[0],
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        rateRequestType: ['ACCOUNT', 'LIST'],
        requestedPackageLineItems: packages.map((pkg: any, index: number) => ({
          groupPackageCount: 1,
          weight: {
            value: pkg.weight_lbs || 1,
            units: 'LB',
          },
          dimensions: pkg.dimensions ? {
            length: pkg.dimensions.length,
            width: pkg.dimensions.width,
            height: pkg.dimensions.height,
            units: 'IN',
          } : undefined,
        })),
      },
    };

    const { response: rateResponse } = await fetchWithRetry(
      `${config.baseUrl}/rate/v1/rates/quotes`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US',
        },
        body: JSON.stringify(rateRequest),
      },
      3
    );

    const rateData = await rateResponse.json();
    
    // FedEx service type to transit HOURS mapping - FALLBACK only when API doesn't provide commit date
    const FEDEX_SERVICE_TRANSIT_HOURS_FALLBACK: Record<string, number> = {
      'FIRST_OVERNIGHT': 24,
      'FEDEX_FIRST_OVERNIGHT': 24,
      'FEDEX_FIRST_OVERNIGHT_EXTRA_HOURS': 24,
      'PRIORITY_OVERNIGHT': 26.5,
      'FEDEX_PRIORITY_OVERNIGHT': 26.5,
      'FEDEX_PRIORITY_OVERNIGHT_EXTRA_HOURS': 26.5,
      'STANDARD_OVERNIGHT': 36,
      'FEDEX_STANDARD_OVERNIGHT': 36,
      'FEDEX_STANDARD_OVERNIGHT_EXTRA_HOURS': 36,
      'FEDEX_2_DAY_AM': 50.5,
      'FEDEX_2_DAY': 60,
      'FEDEX_EXPRESS_SAVER': 84,
      'FEDEX_GROUND': 120,
      'GROUND_HOME_DELIVERY': 120,
      'FEDEX_HOME_DELIVERY': 120,
      'FEDEX_GROUND_ECONOMY': 168,
      'SMART_POST': 192,
    };
    
    // Ship date for calculating transit days from commit date
    const shipDateStr = ship_date || new Date().toISOString().split('T')[0];
    const shipDateObj = new Date(shipDateStr + 'T00:00:00');
    
    // Transform response - extract both LIST (retail) and ACCOUNT (negotiated) rates
    const rates = rateData.output?.rateReplyDetails?.map((detail: any) => {
      // Extract FedEx commit date (actual delivery date from API)
      // Format is typically "2025-01-14" in dayFormat
      const commitDateStr = detail.commit?.dateDetail?.dayFormat || null;
      
      let transitDays: number;
      let transitHours: number;
      
      if (commitDateStr) {
        // Parse FedEx commit date and calculate actual transit days
        const commitDate = new Date(commitDateStr + 'T00:00:00');
        const diffMs = commitDate.getTime() - shipDateObj.getTime();
        transitDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        transitHours = transitDays * 24;
        console.log(`${detail.serviceType}: FedEx commit date ${commitDateStr}, calculated ${transitDays} transit days`);
      } else {
        // Fallback to static config if no commit date
        transitHours = FEDEX_SERVICE_TRANSIT_HOURS_FALLBACK[detail.serviceType] || 120;
        transitDays = Math.ceil(transitHours / 24);
        console.log(`${detail.serviceType}: No commit date, using fallback ${transitDays} days`);
      }
      
      // Extract both rate types from ratedShipmentDetails
      const ratedDetails = detail.ratedShipmentDetails || [];
      let listRate: number | undefined;
      let accountRate: number | undefined;
      
      for (const rateDetail of ratedDetails) {
        const rateType = rateDetail.rateType;
        const charge = rateDetail.totalNetCharge;
        
        if (rateType === 'PAYOR_LIST_PACKAGE' || rateType === 'LIST') {
          listRate = charge;
        } else if (rateType === 'PAYOR_ACCOUNT_PACKAGE' || rateType === 'ACCOUNT') {
          accountRate = charge;
        }
      }
      
      // Use list rate (retail) as primary, fall back to first available
      const primaryCharge = listRate ?? accountRate ?? ratedDetails[0]?.totalNetCharge;
      
      return {
        service_type: detail.serviceType,
        service_name: detail.serviceName,
        commit_date: commitDateStr,  // Pass through actual FedEx commit date
        delivery_day_of_week: detail.commit?.dateDetail?.dayOfWeek,
        transit_days: transitDays,
        transit_hours: transitHours,
        total_charge: primaryCharge,
        account_charge: accountRate,
        currency: ratedDetails[0]?.currency || 'USD',
      };
    }) || [];

    console.log(`Got ${rates.length} rate options from FedEx ${environment}`);

    return new Response(
      JSON.stringify({ 
        rates,
        environment,
        success: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error getting FedEx rates:', error);
    
    // Structured error response
    const errorCode = error.code || 'UNKNOWN_ERROR';
    const errorMessage = error.message || 'Unknown error occurred';
    
    // Provide user-friendly messages for common errors
    let userMessage = errorMessage;
    let hint = 'Please check the shipping address and try again.';
    
    if (errorCode === 'DESTINATION.COUNTRY.INVALID' || errorCode === 'ORIGIN.COUNTRY.INVALID') {
      userMessage = 'Invalid country code in shipping address';
      hint = 'The country code format may be incorrect. Please verify the address.';
    } else if (errorCode === 'DESTINATION.STATE.INVALID' || errorCode === 'ORIGIN.STATE.INVALID') {
      userMessage = 'Invalid state/province code in shipping address';
      hint = 'Please verify the state/province is correct for the given country.';
    } else if (errorCode === 'DESTINATION.POSTALCODE.INVALID' || errorCode === 'ORIGIN.POSTALCODE.INVALID') {
      userMessage = 'Invalid postal code in shipping address';
      hint = 'Please verify the postal/zip code is correct.';
    } else if (errorMessage.includes('authenticate')) {
      userMessage = 'FedEx authentication failed';
      hint = 'There may be an issue with FedEx API credentials. Please contact support.';
    }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: userMessage,
        error_code: errorCode,
        hint,
        environment,
        details: error.details || null,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
