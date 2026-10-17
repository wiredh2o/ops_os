import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ==========================================
// Time Calculation Utilities
// ==========================================

const MOUNTAIN_TZ = 'America/Denver';
const PICKUP_CUTOFF_HOUR = 17; // 5pm Mountain Time
const WEEKEND_HOUR_MULTIPLIER = 2.5;

// Get US Federal Holidays for a given year
function getFederalHolidays(year: number): Date[] {
  const holidays: Date[] = [];
  
  // Helper: nth weekday of month
  const nthWeekday = (y: number, m: number, wd: number, n: number): Date => {
    const first = new Date(y, m, 1);
    let offset = wd - first.getDay();
    if (offset < 0) offset += 7;
    return new Date(y, m, 1 + offset + (n - 1) * 7);
  };
  
  // Helper: last weekday of month
  const lastWeekday = (y: number, m: number, wd: number): Date => {
    const last = new Date(y, m + 1, 0);
    let offset = last.getDay() - wd;
    if (offset < 0) offset += 7;
    return new Date(y, m + 1, -offset);
  };
  
  // Helper: observed date (Friday if Sat, Monday if Sun)
  const observed = (d: Date): Date => {
    const day = d.getDay();
    if (day === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    if (day === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return d;
  };
  
  holidays.push(observed(new Date(year, 0, 1)));   // New Year's Day
  holidays.push(nthWeekday(year, 0, 1, 3));        // MLK Day
  holidays.push(nthWeekday(year, 1, 1, 3));        // Presidents' Day
  holidays.push(lastWeekday(year, 4, 1));          // Memorial Day
  holidays.push(observed(new Date(year, 5, 19))); // Juneteenth
  holidays.push(observed(new Date(year, 6, 4)));  // Independence Day
  holidays.push(nthWeekday(year, 8, 1, 1));        // Labor Day
  holidays.push(nthWeekday(year, 9, 1, 2));        // Columbus Day
  holidays.push(observed(new Date(year, 10, 11)));// Veterans Day
  holidays.push(nthWeekday(year, 10, 4, 4));       // Thanksgiving
  holidays.push(observed(new Date(year, 11, 25)));// Christmas
  
  return holidays;
}

function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isFederalHoliday(date: Date): boolean {
  const holidays = getFederalHolidays(date.getFullYear());
  const dateStr = formatDateOnly(date);
  return holidays.some(h => formatDateOnly(h) === dateStr);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isFederalHoliday(date);
}

function getMountainTime(date: Date = new Date()): Date {
  const mtStr = date.toLocaleString('en-US', { timeZone: MOUNTAIN_TZ });
  return new Date(mtStr);
}

function getNextBusinessDay(from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(PICKUP_CUTOFF_HOUR, 0, 0, 0);
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getEffectivePickupTime(requestTime: Date = new Date()): Date {
  const mtTime = getMountainTime(requestTime);
  const todayPickup = new Date(mtTime);
  todayPickup.setHours(PICKUP_CUTOFF_HOUR, 0, 0, 0);
  
  const isBeforeCutoff = mtTime.getHours() < PICKUP_CUTOFF_HOUR;
  const isTodayBusinessDay = isBusinessDay(mtTime);
  
  if (isBeforeCutoff && isTodayBusinessDay) {
    return todayPickup;
  }
  return getNextBusinessDay(mtTime);
}

function isPastCutoff(requestTime: Date = new Date()): boolean {
  const mtTime = getMountainTime(requestTime);
  return mtTime.getHours() >= PICKUP_CUTOFF_HOUR || !isBusinessDay(mtTime);
}

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) {
      added++;
    }
  }
  return result;
}

function calculateDeliveryTime(
  pickupTime: Date,
  transitDays: number,
  deliveryHour: number,
  deliveryMinute: number,
  saturdayDelivery: boolean,
  sundayDelivery: boolean,
  residentialSaturdayOnly: boolean,
  isResidential: boolean
): Date {
  let deliveryDate = addBusinessDays(pickupTime, transitDays);
  deliveryDate.setHours(deliveryHour, deliveryMinute, 0, 0);
  
  // Handle Saturday
  if (deliveryDate.getDay() === 6) {
    const canDeliverSaturday = saturdayDelivery && (!residentialSaturdayOnly || isResidential);
    if (!canDeliverSaturday) {
      deliveryDate = addBusinessDays(deliveryDate, 1);
      deliveryDate.setHours(deliveryHour, deliveryMinute, 0, 0);
    }
  }
  
  // Handle Sunday
  if (deliveryDate.getDay() === 0 && !sundayDelivery) {
    deliveryDate = addBusinessDays(deliveryDate, 1);
    deliveryDate.setHours(deliveryHour, deliveryMinute, 0, 0);
  }
  
  return deliveryDate;
}

function calculateCustomerValueHours(pickup: Date, delivery: Date): number {
  let valueHours = 0;
  const current = new Date(pickup);
  while (current < delivery) {
    valueHours += isWeekend(current) ? WEEKEND_HOUR_MULTIPLIER : 1;
    current.setHours(current.getHours() + 1);
  }
  return valueHours;
}

// ==========================================
// Carrier Service Configuration
// ==========================================

interface ServiceConfig {
  transitDays: number;
  deliveryHour: number;
  deliveryMinute: number;
  saturdayDelivery: boolean;
  sundayDelivery: boolean;
  residentialSaturdayOnly: boolean;
}

const CARRIER_SERVICE_CONFIG: Record<string, Record<string, ServiceConfig>> = {
  fedex: {
    'FIRST_OVERNIGHT': { transitDays: 1, deliveryHour: 8, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'FEDEX_FIRST_OVERNIGHT': { transitDays: 1, deliveryHour: 8, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'PRIORITY_OVERNIGHT': { transitDays: 1, deliveryHour: 10, deliveryMinute: 30, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'FEDEX_PRIORITY_OVERNIGHT': { transitDays: 1, deliveryHour: 10, deliveryMinute: 30, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'STANDARD_OVERNIGHT': { transitDays: 1, deliveryHour: 15, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    'FEDEX_STANDARD_OVERNIGHT': { transitDays: 1, deliveryHour: 15, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    'FEDEX_2_DAY_AM': { transitDays: 2, deliveryHour: 10, deliveryMinute: 30, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    'FEDEX_2_DAY': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    'FEDEX_EXPRESS_SAVER': { transitDays: 3, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    'FEDEX_GROUND': { transitDays: 5, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: true },
    'GROUND_HOME_DELIVERY': { transitDays: 5, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: true },
    'FEDEX_HOME_DELIVERY': { transitDays: 5, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: true },
    'SMART_POST': { transitDays: 7, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: true },
    'FEDEX_GROUND_ECONOMY': { transitDays: 7, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: true },
  },
  ups: {
    '14': { transitDays: 1, deliveryHour: 8, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    '01': { transitDays: 1, deliveryHour: 10, deliveryMinute: 30, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    '13': { transitDays: 1, deliveryHour: 15, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    '02': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    '59': { transitDays: 2, deliveryHour: 10, deliveryMinute: 30, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    '12': { transitDays: 3, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false },
    '03': { transitDays: 5, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: true },
  },
  usps: {
    'PRIORITY_MAIL_EXPRESS': { transitDays: 1, deliveryHour: 18, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: true, residentialSaturdayOnly: false },
    'PRIORITY_MAIL': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'USPS_GROUND_ADVANTAGE': { transitDays: 5, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'FLAT_RATE_SMALL_FLAT_RATE_BOX': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'FLAT_RATE_MEDIUM_FLAT_RATE_BOX_TOP': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'FLAT_RATE_MEDIUM_FLAT_RATE_BOX_SIDE': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'FLAT_RATE_LARGE_FLAT_RATE_BOX': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
    'FLAT_RATE_FLAT_RATE_ENVELOPE': { transitDays: 2, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: true, sundayDelivery: false, residentialSaturdayOnly: false },
  },
};

function getServiceConfig(carrier: string, serviceType: string): ServiceConfig {
  const carrierConfig = CARRIER_SERVICE_CONFIG[carrier.toLowerCase()];
  if (carrierConfig && carrierConfig[serviceType]) {
    return carrierConfig[serviceType];
  }
  return { transitDays: 5, deliveryHour: 20, deliveryMinute: 0, saturdayDelivery: false, sundayDelivery: false, residentialSaturdayOnly: false };
}

function formatDeliveryTimeDisplay(hour: number, minute: number): string {
  if (hour >= 20) return 'by end of day';
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  if (minute === 0) return `by ${displayHour}:00 ${period}`;
  return `by ${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

// ==========================================
// Retry Helper
// ==========================================

async function fetchWithRetry(url: string, options: RequestInit, label: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status >= 500 && attempt < maxRetries) {
        console.warn(`[${label}] Attempt ${attempt}/${maxRetries} failed with HTTP ${response.status}, retrying in ${attempt * 500}ms...`);
        await new Promise(r => setTimeout(r, attempt * 500));
        continue;
      }
      return response; // 4xx or last attempt — return as-is
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${err.message}, retrying in ${attempt * 500}ms...`);
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  throw new Error(`[${label}] All ${maxRetries} retry attempts exhausted`);
}

// ==========================================
// Main Handler
// ==========================================

interface UnifiedRate {
  carrier: 'fedex' | 'ups' | 'usps';
  service_type: string;
  service_name: string;
  total_charge: number;
  account_charge?: number;
  currency: string;
  transit_days: number;
  transit_hours: number;
  pricing_type?: 'weight_based' | 'flat_rate';
  container_type?: string;
  isMock: boolean;
  // Time-aware fields
  effective_pickup: string;
  estimated_delivery: string;
  delivery_time_display: string;
  customer_value_hours: number;
  saturday_delivery: boolean;
}

interface CarrierResponse {
  success: boolean;
  rates?: any[];
  error?: string;
  isMock?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const body = await req.json();
    const { ship_from, ship_to, packages, ship_date, enabled_carriers } = body;

    if (!ship_from || !ship_to || !packages || packages.length === 0) {
      throw new Error('Missing required shipping details');
    }

    const isResidential = ship_to.residential === true;

    // Calculate effective pickup time
    const now = new Date();
    const effectivePickup = getEffectivePickupTime(now);
    const pastCutoff = isPastCutoff(now);

    // Prepare the common request body
    const rateRequestBody = JSON.stringify({
      ship_from,
      ship_to,
      packages,
      ship_date,
    });

    // Determine which carriers to fetch from
    // If enabled_carriers is provided, only fetch from those; otherwise fetch from all
    const allCarrierFunctions = ['get-fedex-rates', 'get-ups-rates', 'get-usps-rates'];
    const carrierFunctions = enabled_carriers && enabled_carriers.length > 0
      ? allCarrierFunctions.filter(fn => {
          const carrier = fn.replace('get-', '').replace('-rates', '');
          return enabled_carriers.includes(carrier);
        })
      : allCarrierFunctions;

    console.log(`Fetching rates from carriers: ${carrierFunctions.map(fn => fn.replace('get-', '').replace('-rates', '')).join(', ')}`);
    
    const results = await Promise.allSettled(
      carrierFunctions.map(async (fnName) => {
        const response = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/${fnName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: rateRequestBody,
        });

        if (!response.ok) {
          throw new Error(`${fnName} returned ${response.status}`);
        }

        return {
          carrier: fnName.replace('get-', '').replace('-rates', '') as 'fedex' | 'ups' | 'usps',
          data: await response.json() as CarrierResponse,
        };
      })
    );

    // Collect all successful rates
    const allRates: UnifiedRate[] = [];
    const carrierStatuses: Record<string, { available: boolean; error?: string; isMock: boolean }> = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { carrier, data } = result.value;
        
        if (data.success && data.rates && data.rates.length > 0) {
          carrierStatuses[carrier] = { 
            available: true, 
            isMock: data.isMock || false 
          };

          for (const rate of data.rates) {
            const serviceConfig = getServiceConfig(carrier, rate.service_type);
            
            // Use transit days from carrier API (already calculated from commit date) or fall back to config
            const transitDays = rate.transit_days || serviceConfig.transitDays;
            const transitHours = rate.transit_hours || (transitDays * 24);
            
            let estimatedDelivery: Date;
            
            // If carrier provides commit_date, use it directly (FedEx provides this)
            if (rate.commit_date) {
              try {
                // Normalize the commit date string to ensure timezone is present
                let commitDateStr = rate.commit_date;
                
                // If it has a T but no timezone indicator, add Z (UTC)
                if (commitDateStr.includes('T') && !commitDateStr.endsWith('Z') && !commitDateStr.includes('+')) {
                  commitDateStr = commitDateStr + 'Z';
                } else if (!commitDateStr.includes('T')) {
                  // Date-only format: add time and timezone
                  commitDateStr = commitDateStr + 'T12:00:00Z';
                }
                
                estimatedDelivery = new Date(commitDateStr);
                
                // Validate the date is actually valid before using it
                if (isNaN(estimatedDelivery.getTime())) {
                  throw new Error('Invalid date parsed from commit_date');
                }
                
                // Override with service config delivery hour for consistency
                estimatedDelivery.setUTCHours(serviceConfig.deliveryHour, serviceConfig.deliveryMinute, 0, 0);
                console.log(`${carrier}/${rate.service_type}: Using API commit date ${estimatedDelivery.toISOString()}`);
              } catch (dateError) {
                console.warn(`${carrier}/${rate.service_type}: Failed to parse commit_date "${rate.commit_date}", using calculated delivery`);
                // Fall back to calculated delivery
                estimatedDelivery = calculateDeliveryTime(
                  effectivePickup,
                  transitDays,
                  serviceConfig.deliveryHour,
                  serviceConfig.deliveryMinute,
                  serviceConfig.saturdayDelivery,
                  serviceConfig.sundayDelivery,
                  serviceConfig.residentialSaturdayOnly,
                  isResidential
                );
              }
            } else {
              // Calculate estimated delivery time using transit days from API or config
              estimatedDelivery = calculateDeliveryTime(
                effectivePickup,
                transitDays,
                serviceConfig.deliveryHour,
                serviceConfig.deliveryMinute,
                serviceConfig.saturdayDelivery,
                serviceConfig.sundayDelivery,
                serviceConfig.residentialSaturdayOnly,
                isResidential
              );
            }
            
            // Calculate customer value hours (weekend-weighted)
            const customerValueHours = calculateCustomerValueHours(effectivePickup, estimatedDelivery);
            
            allRates.push({
              carrier,
              service_type: rate.service_type,
              service_name: rate.service_name || rate.service_type,
              total_charge: rate.total_charge,
              account_charge: rate.account_charge,
              currency: rate.currency || 'USD',
              transit_days: transitDays,
              transit_hours: transitHours,
              pricing_type: rate.pricing_type || 'weight_based',
              container_type: rate.container_type,
              isMock: data.isMock || false,
              // Time-aware fields
              effective_pickup: effectivePickup.toISOString(),
              estimated_delivery: estimatedDelivery.toISOString(),
              delivery_time_display: formatDeliveryTimeDisplay(serviceConfig.deliveryHour, serviceConfig.deliveryMinute),
              customer_value_hours: customerValueHours,
              saturday_delivery: serviceConfig.saturdayDelivery && (!serviceConfig.residentialSaturdayOnly || isResidential),
            });
          }
        } else {
          carrierStatuses[carrier] = { 
            available: false, 
            error: data.error || 'No rates returned',
            isMock: false 
          };
        }
      } else {
        // Extract carrier name from error
        const fnName = carrierFunctions[results.indexOf(result)];
        const carrier = fnName.replace('get-', '').replace('-rates', '');
        carrierStatuses[carrier] = { 
          available: false, 
          error: result.reason?.message || 'Failed to fetch rates',
          isMock: false 
        };
      }
    }

    // Sort by customer value hours (accounts for weekend weighting), then by price
    allRates.sort((a, b) => {
      if (a.customer_value_hours !== b.customer_value_hours) {
        return a.customer_value_hours - b.customer_value_hours;
      }
      return a.total_charge - b.total_charge;
    });

    console.log(`Fetched ${allRates.length} rates from ${Object.keys(carrierStatuses).filter(c => carrierStatuses[c].available).length} carriers`);

    return new Response(
      JSON.stringify({
        success: true,
        rates: allRates,
        carriers: carrierStatuses,
        effective_pickup: effectivePickup.toISOString(),
        past_cutoff: pastCutoff,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error fetching all carrier rates:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
