/**
 * Shipping Time Utilities
 * 
 * Calculates effective pickup times based on 5pm Mountain Time cutoff,
 * handles federal holidays, and computes weekend-weighted value hours.
 */

// Mountain Time zone offset (UTC-7 standard, UTC-6 DST)
const MOUNTAIN_TZ = 'America/Denver';
const PICKUP_CUTOFF_HOUR = 17; // 5pm Mountain Time
const WEEKEND_HOUR_MULTIPLIER = 2.5;

/**
 * US Federal Holidays (observed dates)
 * Returns holidays for a given year
 */
export function getFederalHolidays(year: number): Date[] {
  const holidays: Date[] = [];
  
  // New Year's Day - January 1
  holidays.push(observedDate(new Date(year, 0, 1)));
  
  // Martin Luther King Jr. Day - 3rd Monday of January
  holidays.push(nthWeekdayOfMonth(year, 0, 1, 3));
  
  // Presidents' Day - 3rd Monday of February
  holidays.push(nthWeekdayOfMonth(year, 1, 1, 3));
  
  // Memorial Day - Last Monday of May
  holidays.push(lastWeekdayOfMonth(year, 4, 1));
  
  // Juneteenth - June 19
  holidays.push(observedDate(new Date(year, 5, 19)));
  
  // Independence Day - July 4
  holidays.push(observedDate(new Date(year, 6, 4)));
  
  // Labor Day - 1st Monday of September
  holidays.push(nthWeekdayOfMonth(year, 8, 1, 1));
  
  // Columbus Day - 2nd Monday of October
  holidays.push(nthWeekdayOfMonth(year, 9, 1, 2));
  
  // Veterans Day - November 11
  holidays.push(observedDate(new Date(year, 10, 11)));
  
  // Thanksgiving - 4th Thursday of November
  holidays.push(nthWeekdayOfMonth(year, 10, 4, 4));
  
  // Christmas Day - December 25
  holidays.push(observedDate(new Date(year, 11, 25)));
  
  return holidays;
}

/**
 * Get the nth weekday of a month
 * weekday: 0=Sunday, 1=Monday, etc.
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  const day = 1 + dayOffset + (n - 1) * 7;
  return new Date(year, month, day);
}

/**
 * Get the last weekday of a month
 */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();
  let dayOffset = lastWeekday - weekday;
  if (dayOffset < 0) dayOffset += 7;
  return new Date(year, month + 1, -dayOffset);
}

/**
 * Get the observed date for a holiday (Friday if Saturday, Monday if Sunday)
 */
function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) { // Saturday -> Friday
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  } else if (day === 0) { // Sunday -> Monday
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return date;
}

/**
 * Check if a date is a federal holiday
 */
export function isFederalHoliday(date: Date): boolean {
  const holidays = getFederalHolidays(date.getFullYear());
  const dateStr = formatDateOnly(date);
  return holidays.some(h => formatDateOnly(h) === dateStr);
}

/**
 * Format date as YYYY-MM-DD for comparison
 */
function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if a date is a business day (weekday and not a federal holiday)
 */
export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isFederalHoliday(date);
}

/**
 * Get the current time in Mountain Time zone
 */
export function getMountainTime(date: Date = new Date()): Date {
  // Convert to Mountain Time by using toLocaleString and parsing back
  const mtStr = date.toLocaleString('en-US', { timeZone: MOUNTAIN_TZ });
  return new Date(mtStr);
}

/**
 * Get the next business day at 5pm Mountain Time
 */
export function getNextBusinessDay(from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(PICKUP_CUTOFF_HOUR, 0, 0, 0);
  
  // Keep advancing until we find a business day
  while (!isBusinessDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

/**
 * Calculate the effective pickup time based on 5pm Mountain Time cutoff
 * 
 * Rules:
 * - If before 5pm MT on a business day → today at 5pm MT
 * - If after 5pm MT or weekend/holiday → next business day at 5pm MT
 */
export function getEffectivePickupTime(requestTime: Date = new Date()): Date {
  const mtTime = getMountainTime(requestTime);
  
  // Create a pickup time for today at 5pm
  const todayPickup = new Date(mtTime);
  todayPickup.setHours(PICKUP_CUTOFF_HOUR, 0, 0, 0);
  
  // Check if we can make today's pickup
  const isBeforeCutoff = mtTime.getHours() < PICKUP_CUTOFF_HOUR;
  const isTodayBusinessDay = isBusinessDay(mtTime);
  
  if (isBeforeCutoff && isTodayBusinessDay) {
    return todayPickup;
  }
  
  // Otherwise, find the next business day
  return getNextBusinessDay(mtTime);
}

/**
 * Check if the current time is past the pickup cutoff
 */
export function isPastCutoff(requestTime: Date = new Date()): boolean {
  const mtTime = getMountainTime(requestTime);
  const isAfterCutoff = mtTime.getHours() >= PICKUP_CUTOFF_HOUR;
  const isNonBusinessDay = !isBusinessDay(mtTime);
  
  return isAfterCutoff || isNonBusinessDay;
}

/**
 * Add business days to a date (skipping weekends and holidays)
 */
export function addBusinessDays(from: Date, days: number): Date {
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

/**
 * Calculate the estimated delivery datetime based on service configuration
 */
export function calculateDeliveryTime(
  pickupTime: Date,
  transitDays: number,
  deliveryHour: number,
  deliveryMinute: number = 0,
  saturdayDelivery: boolean = false,
  residentialSaturdayOnly: boolean = false,
  isResidential: boolean = false
): Date {
  // Add transit days (business days for most services)
  let deliveryDate = addBusinessDays(pickupTime, transitDays);
  
  // Set delivery time
  deliveryDate.setHours(deliveryHour, deliveryMinute, 0, 0);
  
  // Handle Saturday delivery
  if (deliveryDate.getDay() === 6) { // Saturday
    const canDeliverSaturday = saturdayDelivery && 
      (!residentialSaturdayOnly || isResidential);
    
    if (!canDeliverSaturday) {
      // Push to Monday (or next business day)
      deliveryDate = addBusinessDays(deliveryDate, 1);
      deliveryDate.setHours(deliveryHour, deliveryMinute, 0, 0);
    }
  }
  
  // Handle Sunday (no carriers deliver Sunday except USPS Priority Express)
  if (deliveryDate.getDay() === 0) { // Sunday
    deliveryDate = addBusinessDays(deliveryDate, 1);
    deliveryDate.setHours(deliveryHour, deliveryMinute, 0, 0);
  }
  
  return deliveryDate;
}

/**
 * Calculate customer value hours with weekend weighting
 * 
 * Weekend hours (Saturday/Sunday) count as 2.5x weekday hours
 * Lower score = faster/better value for customer
 */
export function calculateCustomerValueHours(pickup: Date, delivery: Date): number {
  let valueHours = 0;
  const current = new Date(pickup);
  
  // Iterate hour by hour
  while (current < delivery) {
    const hourWeight = isWeekend(current) ? WEEKEND_HOUR_MULTIPLIER : 1;
    valueHours += hourWeight;
    current.setHours(current.getHours() + 1);
  }
  
  return valueHours;
}

/**
 * Format delivery time for display
 * e.g., "by 10:30 AM" or "by end of day"
 */
export function formatDeliveryTime(hour: number, minute: number = 0): string {
  if (hour >= 20) {
    return 'by end of day';
  }
  
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  
  if (minute === 0) {
    return `by ${displayHour}:00 ${period}`;
  }
  
  return `by ${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

/**
 * Format date for display
 * e.g., "Sat, Jan 11"
 */
export function formatDeliveryDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Get cutoff warning message if past cutoff
 */
export function getCutoffWarning(effectivePickup: Date): string | null {
  const now = new Date();
  const mtNow = getMountainTime(now);
  
  if (!isPastCutoff(now)) {
    return null;
  }
  
  const pickupDate = formatDeliveryDate(effectivePickup);
  return `Today's pickup cutoff (5pm MT) has passed. Packages will ship ${pickupDate}.`;
}
