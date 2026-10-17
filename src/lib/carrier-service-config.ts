/**
 * Carrier Service Configuration
 * 
 * Defines delivery time configurations for all carrier services.
 * Used to calculate estimated delivery dates and times.
 */

export interface ServiceConfig {
  transitDays: number;
  deliveryHour: number;
  deliveryMinute: number;
  saturdayDelivery: boolean;
  sundayDelivery?: boolean;
  residentialSaturdayOnly?: boolean;
}

export const CARRIER_SERVICE_CONFIG: Record<string, Record<string, ServiceConfig>> = {
  fedex: {
    // FedEx Express Services
    'FIRST_OVERNIGHT': {
      transitDays: 1,
      deliveryHour: 8,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: false,
    },
    'FEDEX_FIRST_OVERNIGHT': {
      transitDays: 1,
      deliveryHour: 8,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: false,
    },
    'PRIORITY_OVERNIGHT': {
      transitDays: 1,
      deliveryHour: 10,
      deliveryMinute: 30,
      saturdayDelivery: true,
      residentialSaturdayOnly: false,
    },
    'FEDEX_PRIORITY_OVERNIGHT': {
      transitDays: 1,
      deliveryHour: 10,
      deliveryMinute: 30,
      saturdayDelivery: true,
      residentialSaturdayOnly: false,
    },
    'STANDARD_OVERNIGHT': {
      transitDays: 1,
      deliveryHour: 15,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    'FEDEX_STANDARD_OVERNIGHT': {
      transitDays: 1,
      deliveryHour: 15,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    'FEDEX_2_DAY_AM': {
      transitDays: 2,
      deliveryHour: 10,
      deliveryMinute: 30,
      saturdayDelivery: false,
    },
    'FEDEX_2_DAY': {
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    'FEDEX_EXPRESS_SAVER': {
      transitDays: 3,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    // FedEx Ground Services (Saturday delivery for residential)
    'FEDEX_GROUND': {
      transitDays: 5,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: true,
    },
    'GROUND_HOME_DELIVERY': {
      transitDays: 5,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: true,
    },
    'FEDEX_HOME_DELIVERY': {
      transitDays: 5,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: true,
    },
    'SMART_POST': {
      transitDays: 7,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: true,
    },
    'FEDEX_GROUND_ECONOMY': {
      transitDays: 7,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: true,
    },
  },
  
  ups: {
    // UPS Service Codes
    '14': { // Next Day Air Early
      transitDays: 1,
      deliveryHour: 8,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    '01': { // Next Day Air
      transitDays: 1,
      deliveryHour: 10,
      deliveryMinute: 30,
      saturdayDelivery: true,
    },
    '13': { // Next Day Air Saver
      transitDays: 1,
      deliveryHour: 15,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    '02': { // 2nd Day Air
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    '59': { // 2nd Day Air AM
      transitDays: 2,
      deliveryHour: 10,
      deliveryMinute: 30,
      saturdayDelivery: false,
    },
    '12': { // 3 Day Select
      transitDays: 3,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: false,
    },
    '03': { // Ground
      transitDays: 5,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      residentialSaturdayOnly: true,
    },
  },
  
  usps: {
    'PRIORITY_MAIL_EXPRESS': {
      transitDays: 1,
      deliveryHour: 18,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: true, // USPS delivers Sunday for Priority Express
    },
    'PRIORITY_MAIL': {
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: false,
    },
    'USPS_GROUND_ADVANTAGE': {
      transitDays: 5,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: false,
    },
    // Flat Rate variants (same transit as Priority Mail)
    'FLAT_RATE_SMALL_FLAT_RATE_BOX': {
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: false,
    },
    'FLAT_RATE_MEDIUM_FLAT_RATE_BOX_TOP': {
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: false,
    },
    'FLAT_RATE_MEDIUM_FLAT_RATE_BOX_SIDE': {
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: false,
    },
    'FLAT_RATE_LARGE_FLAT_RATE_BOX': {
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: false,
    },
    'FLAT_RATE_FLAT_RATE_ENVELOPE': {
      transitDays: 2,
      deliveryHour: 20,
      deliveryMinute: 0,
      saturdayDelivery: true,
      sundayDelivery: false,
    },
  },
};

/**
 * Get service configuration for a carrier and service type
 * Returns a default config if not found
 */
export function getServiceConfig(carrier: string, serviceType: string): ServiceConfig {
  const carrierConfig = CARRIER_SERVICE_CONFIG[carrier.toLowerCase()];
  
  if (carrierConfig && carrierConfig[serviceType]) {
    return carrierConfig[serviceType];
  }
  
  // Default configuration for unknown services
  return {
    transitDays: 5,
    deliveryHour: 20,
    deliveryMinute: 0,
    saturdayDelivery: false,
  };
}

/**
 * Get display name for delivery time
 */
export function getDeliveryTimeDisplay(config: ServiceConfig): string {
  if (config.deliveryHour >= 20) {
    return 'by end of day';
  }
  
  const hour = config.deliveryHour;
  const minute = config.deliveryMinute;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  
  if (minute === 0) {
    return `by ${displayHour}:00 ${period}`;
  }
  
  return `by ${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}
