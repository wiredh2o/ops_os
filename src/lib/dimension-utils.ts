/**
 * Utility functions for standardized dimension handling
 * Supports automatic sorting of dimensions for box optimization
 */

export interface DimensionInput {
  width: number | null;
  length: number | null;
  depth: number | null;
}

export interface StandardizedDimensions {
  dimension_l: number | null; // Longest dimension
  dimension_w: number | null; // Middle dimension
  dimension_h: number | null; // Smallest dimension
}

/**
 * Sorts three dimension values into L, W, H (largest to smallest)
 * @param width - Width dimension
 * @param length - Length dimension  
 * @param depth - Depth dimension
 * @returns Sorted dimensions object with L, W, H
 */
export function sortDimensions(
  width: number | string | null,
  length: number | string | null,
  depth: number | string | null
): StandardizedDimensions {
  // Convert to numbers and filter out null/invalid values
  const dimensions = [
    width ? parseFloat(width.toString()) : null,
    length ? parseFloat(length.toString()) : null,
    depth ? parseFloat(depth.toString()) : null
  ].filter((d): d is number => d !== null && !isNaN(d) && d > 0);

  // If no valid dimensions, return null values
  if (dimensions.length === 0) {
    return { dimension_l: null, dimension_w: null, dimension_h: null };
  }

  // Sort in descending order (largest to smallest)
  dimensions.sort((a, b) => b - a);

  return {
    dimension_l: dimensions[0] || null,
    dimension_w: dimensions[1] || null,
    dimension_h: dimensions[2] || null
  };
}

/**
 * Calculates volume from L × W × H dimensions
 * @param dimension_l - Longest dimension
 * @param dimension_w - Middle dimension
 * @param dimension_h - Smallest dimension
 * @returns Volume in cubic inches, or null if any dimension is missing
 */
export function calculateVolume(
  dimension_l: number | string | null,
  dimension_w: number | string | null,
  dimension_h: number | string | null
): number | null {
  const l = dimension_l ? parseFloat(dimension_l.toString()) : null;
  const w = dimension_w ? parseFloat(dimension_w.toString()) : null;
  const h = dimension_h ? parseFloat(dimension_h.toString()) : null;

  if (!l || !w || !h || l <= 0 || w <= 0 || h <= 0) {
    return null;
  }

  return l * w * h;
}

/**
 * Formats dimensions for display as "L × W × H"
 * @param dimensions - Standardized dimensions object
 * @param precision - Decimal places to show (default: 2)
 * @returns Formatted dimension string
 */
export function formatDimensionsDisplay(
  dimensions: StandardizedDimensions,
  precision: number = 2
): string {
  if (!dimensions.dimension_l && !dimensions.dimension_w && !dimensions.dimension_h) {
    return "Not specified";
  }

  const l = dimensions.dimension_l?.toFixed(precision) || "0";
  const w = dimensions.dimension_w?.toFixed(precision) || "0";  
  const h = dimensions.dimension_h?.toFixed(precision) || "0";

  return `${l} × ${w} × ${h}`;
}

/**
 * Calculates volume from standardized dimensions object
 * @param dimensions - Standardized dimensions object
 * @returns Volume in cubic inches, or null if any dimension is missing
 */
export function calculateVolumeFromDimensions(
  dimensions: StandardizedDimensions
): number | null {
  return calculateVolume(dimensions.dimension_l, dimensions.dimension_w, dimensions.dimension_h);
}

/**
 * Validates that dimensions are in correct order (L ≥ W ≥ H)
 * @param dimension_l - Longest dimension
 * @param dimension_w - Middle dimension
 * @param dimension_h - Smallest dimension
 * @returns true if dimensions are properly ordered
 */
export function validateDimensionOrder(
  dimension_l: number | null,
  dimension_w: number | null,
  dimension_h: number | null
): boolean {
  if (!dimension_l || !dimension_w || !dimension_h) {
    return true; // Allow partial dimensions
  }

  return dimension_l >= dimension_w && dimension_w >= dimension_h;
}

/**
 * Converts legacy dimension format to standardized format
 * @param item - Object with width, length, depth properties
 * @returns Object with dimension_l, dimension_w, dimension_h properties
 */
export function convertLegacyDimensions(item: {
  width?: number | null;
  length?: number | null;
  depth?: number | null;
}): StandardizedDimensions {
  return sortDimensions(item.width, item.length, item.depth);
}