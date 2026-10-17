/**
 * Drop-Ship Freight Utilities
 * Calculates freight costs from vendor to customer for drop-ship orders
 */

import { supabase } from '@/integrations/supabase/client';

export interface VendorAddress {
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface CustomerAddress {
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface FreightQuote {
  carrier: string;
  service_type: string;
  service_name: string;
  total_charge: number;
  transit_days?: number;
  isMock: boolean;
}

export interface FreightCalculationResult {
  success: boolean;
  cheapestGroundRate?: FreightQuote;
  allRates?: FreightQuote[];
  error?: string;
}

/**
 * Calculate drop-ship freight from vendor to customer
 * Returns the cheapest ground shipping rate
 */
export async function calculateDropShipFreight(
  vendorAddress: VendorAddress,
  customerAddress: CustomerAddress,
  packageWeight: number = 1,
  packageDimensions: { length: number; width: number; height: number } = { length: 6, width: 6, height: 6 }
): Promise<FreightCalculationResult> {
  try {
    // Validate vendor address
    if (!vendorAddress.city || !vendorAddress.state || !vendorAddress.postal_code) {
      return {
        success: false,
        error: 'Vendor is missing structured shipping address. Please update vendor profile with city, state, and postal code.',
      };
    }

    // Call the all-carrier-rates function
    const { data, error } = await supabase.functions.invoke('get-all-carrier-rates', {
      body: {
        ship_from: {
          street: '', // Not needed for rate calculation
          city: vendorAddress.city,
          state: vendorAddress.state,
          postal_code: vendorAddress.postal_code,
          country: vendorAddress.country || 'US',
        },
        ship_to: {
          street: '', // Not needed for rate calculation
          city: customerAddress.city,
          state: customerAddress.state,
          postal_code: customerAddress.zip,
          country: customerAddress.country || 'US',
          residential: true, // Assume residential for drop-ship
        },
        packages: [{
          weight_lbs: packageWeight,
          dimensions: packageDimensions,
        }],
      },
    });

    if (error) {
      console.error('Error fetching carrier rates:', error);
      return {
        success: false,
        error: error.message || 'Failed to get shipping rates',
      };
    }

    if (!data?.rates || data.rates.length === 0) {
      return {
        success: false,
        error: 'No shipping rates available for this route',
      };
    }

    // Convert rates to our format
    const allRates: FreightQuote[] = data.rates.map((rate: any) => ({
      carrier: rate.carrier,
      service_type: rate.service_type,
      service_name: rate.service_name,
      total_charge: rate.total_charge,
      transit_days: rate.transit_days,
      isMock: rate.isMock || false,
    }));

    // Filter for ground services and find the cheapest
    const groundServiceTypes = [
      // FedEx Ground
      'FEDEX_GROUND', 'GROUND_HOME_DELIVERY', 'FEDEX_HOME_DELIVERY', 'FEDEX_GROUND_ECONOMY',
      // UPS Ground
      '03', // UPS Ground
      // USPS Ground
      'USPS_GROUND_ADVANTAGE', 'PARCEL_SELECT_GROUND',
    ];

    const groundRates = allRates.filter(rate => 
      groundServiceTypes.includes(rate.service_type) ||
      rate.service_name.toLowerCase().includes('ground')
    );

    // If no ground rates, use all rates
    const ratesToConsider = groundRates.length > 0 ? groundRates : allRates;

    // Sort by price and get cheapest
    const sortedRates = [...ratesToConsider].sort((a, b) => a.total_charge - b.total_charge);
    const cheapestGroundRate = sortedRates[0];

    return {
      success: true,
      cheapestGroundRate,
      allRates,
    };
  } catch (err: any) {
    console.error('Error calculating drop-ship freight:', err);
    return {
      success: false,
      error: err.message || 'Failed to calculate shipping rates',
    };
  }
}

/**
 * Get vendor's shipping address by vendor ID
 */
export async function getVendorShippingAddress(vendorId: string): Promise<VendorAddress | null> {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('shipping_city, shipping_state, shipping_postal_code, shipping_country')
      .eq('id', vendorId)
      .single();

    if (error || !data) {
      console.error('Error fetching vendor address:', error);
      return null;
    }

    if (!data.shipping_city || !data.shipping_state || !data.shipping_postal_code) {
      return null;
    }

    return {
      city: data.shipping_city,
      state: data.shipping_state,
      postal_code: data.shipping_postal_code,
      country: data.shipping_country || 'US',
    };
  } catch (err) {
    console.error('Error fetching vendor address:', err);
    return null;
  }
}

/**
 * Create or get the Drop Ship Freight labor item
 */
export async function getDropShipFreightLaborItem(): Promise<{ id: string; item_number: string } | null> {
  try {
    // First try to find existing
    const { data: existing, error: findError } = await supabase
      .from('labor_items')
      .select('id, item_number')
      .eq('item_number', 'FREIGHT-DS')
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // Create if not exists
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return null;

    const { data: created, error: createError } = await supabase
      .from('labor_items')
      .insert({
        item_number: 'FREIGHT-DS',
        name: 'Drop Ship Freight',
        description: 'Freight charge for vendor drop-ship orders',
        is_taxable: false, // Freight is NEVER taxable
        hourly_rate: 0,
        unit_of_measure: 'flat',
        created_by: user.user.id,
      })
      .select('id, item_number')
      .single();

    if (createError) {
      console.error('Error creating freight labor item:', createError);
      return null;
    }

    return created;
  } catch (err) {
    console.error('Error getting freight labor item:', err);
    return null;
  }
}
