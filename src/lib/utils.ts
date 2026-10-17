import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

export function formatCurrencyPrecise(amount: number): string {
  // Determine the number of decimal places in the actual value
  const amountStr = amount.toString();
  const decimalPart = amountStr.split('.')[1] || '';
  const actualDecimals = decimalPart.length;
  
  // Use at least 2 decimal places, but more if the value has more precision
  const decimalPlaces = Math.max(2, actualDecimals);
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(amount);
}

export function formatHoursToHrMin(decimalHours: number): string {
  // Convert decimal hours to "XHr YMin" format
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${hours}Hr ${minutes}Min`;
}
