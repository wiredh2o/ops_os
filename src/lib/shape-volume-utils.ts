export type PackedShape = 'box' | 'cylinder' | 'cone' | 'sphere' | 'triangular_prism';

export interface ShapeDimensions {
  packed_shape: PackedShape;
  // Box: L, W, H; Cylinder: diameter + H; Cone: diameter + H; Sphere: diameter; TriPrism: L(base), W(depth), H(tri height)
  packed_dimension_l?: number | null;
  packed_dimension_w?: number | null;
  packed_dimension_h?: number | null;
  packed_diameter?: number | null;
}

export interface PaperThicknesses {
  paper_thickness_top?: number;
  paper_thickness_bottom?: number;
  paper_thickness_left?: number;
  paper_thickness_right?: number;
  paper_thickness_front?: number;
  paper_thickness_back?: number;
  paper_thickness_side?: number;
  paper_thickness_uniform?: number;
}

export type ShapeItem = ShapeDimensions & PaperThicknesses & {
  actual_packed_volume_cubic_inches?: number | null;
};

// Which paper surfaces are relevant for each shape
export const SHAPE_SURFACES: Record<PackedShape, string[]> = {
  box: ['top', 'bottom', 'left', 'right', 'front', 'back'],
  cylinder: ['top', 'bottom', 'side'],
  cone: ['bottom', 'side'],
  sphere: ['uniform'],
  triangular_prism: ['top', 'bottom', 'left', 'right', 'front', 'back'],
};

export const SHAPE_LABELS: Record<PackedShape, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  cone: 'Cone',
  sphere: 'Sphere',
  triangular_prism: 'Triangular Prism',
};

export const SURFACE_LABELS: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
  front: 'Front',
  back: 'Back',
  side: 'Side (curved)',
  uniform: 'Uniform (all)',
};

/**
 * Calculate the true geometric volume of the packed shape (cubic inches).
 */
export function getShapeVolume(item: ShapeDimensions): number {
  const shape = item.packed_shape || 'box';
  const L = item.packed_dimension_l || 0;
  const W = item.packed_dimension_w || 0;
  const H = item.packed_dimension_h || 0;
  const D = item.packed_diameter || 0;
  const r = D / 2;

  switch (shape) {
    case 'box':
      return L * W * H;
    case 'cylinder':
      return Math.PI * r * r * H;
    case 'cone':
      return (1 / 3) * Math.PI * r * r * H;
    case 'sphere':
      return (4 / 3) * Math.PI * r * r * r;
    case 'triangular_prism':
      // L = base width, H = triangle height, W = depth (length of prism)
      return 0.5 * L * H * W;
    default:
      return L * W * H;
  }
}

/**
 * Get the rectangular constraint dimensions (L, W, H) that the boxing algorithm uses.
 * These are the packed dimensions plus paper thicknesses on each axis.
 * Uses FULL padding on each face (for standalone/wall-adjacent calculations).
 */
export function getConstraintDimensions(item: ShapeItem): { length: number; width: number; height: number } {
  const shape = item.packed_shape || 'box';
  const L = item.packed_dimension_l || 0;
  const W = item.packed_dimension_w || 0;
  const H = item.packed_dimension_h || 0;
  const D = item.packed_diameter || 0;

  const pt = (key: keyof PaperThicknesses) => (item[key] as number) || 0;

  switch (shape) {
    case 'box':
      return {
        length: L + pt('paper_thickness_left') + pt('paper_thickness_right'),
        width: W + pt('paper_thickness_front') + pt('paper_thickness_back'),
        height: H + pt('paper_thickness_top') + pt('paper_thickness_bottom'),
      };
    case 'cylinder':
      return {
        length: D + 2 * pt('paper_thickness_side'),
        width: D + 2 * pt('paper_thickness_side'),
        height: H + pt('paper_thickness_top') + pt('paper_thickness_bottom'),
      };
    case 'cone':
      return {
        length: D + 2 * pt('paper_thickness_side'),
        width: D + 2 * pt('paper_thickness_side'),
        height: H + pt('paper_thickness_bottom') + pt('paper_thickness_side'),
      };
    case 'sphere': {
      const u = pt('paper_thickness_uniform');
      return {
        length: D + 2 * u,
        width: D + 2 * u,
        height: D + 2 * u,
      };
    }
    case 'triangular_prism':
      return {
        length: L + pt('paper_thickness_left') + pt('paper_thickness_right'),
        width: W + pt('paper_thickness_front') + pt('paper_thickness_back'),
        height: H + pt('paper_thickness_bottom') + pt('paper_thickness_top'),
      };
    default:
      return { length: L, width: W, height: H };
  }
}

/**
 * Get constraint dimensions using HALF padding per face.
 * 
 * When two items are placed adjacent in a box, each contributes half-padding
 * on the shared interface, so the total gap equals one full padding thickness.
 * Wall compensation is handled separately by reducing effective bin dimensions.
 */
export function getSharedPaddingConstraintDimensions(item: ShapeItem): { length: number; width: number; height: number } {
  const shape = item.packed_shape || 'box';
  const L = item.packed_dimension_l || 0;
  const W = item.packed_dimension_w || 0;
  const H = item.packed_dimension_h || 0;
  const D = item.packed_diameter || 0;

  const hpt = (key: keyof PaperThicknesses) => ((item[key] as number) || 0) / 2;

  switch (shape) {
    case 'box':
      return {
        length: L + hpt('paper_thickness_left') + hpt('paper_thickness_right'),
        width: W + hpt('paper_thickness_front') + hpt('paper_thickness_back'),
        height: H + hpt('paper_thickness_top') + hpt('paper_thickness_bottom'),
      };
    case 'cylinder':
      return {
        length: D + 2 * hpt('paper_thickness_side'),
        width: D + 2 * hpt('paper_thickness_side'),
        height: H + hpt('paper_thickness_top') + hpt('paper_thickness_bottom'),
      };
    case 'cone':
      return {
        length: D + 2 * hpt('paper_thickness_side'),
        width: D + 2 * hpt('paper_thickness_side'),
        height: H + hpt('paper_thickness_bottom') + hpt('paper_thickness_side'),
      };
    case 'sphere': {
      const hu = hpt('paper_thickness_uniform');
      return {
        length: D + 2 * hu,
        width: D + 2 * hu,
        height: D + 2 * hu,
      };
    }
    case 'triangular_prism':
      return {
        length: L + hpt('paper_thickness_left') + hpt('paper_thickness_right'),
        width: W + hpt('paper_thickness_front') + hpt('paper_thickness_back'),
        height: H + hpt('paper_thickness_bottom') + hpt('paper_thickness_top'),
      };
    default:
      return { length: L, width: W, height: H };
  }
}

/**
 * Get the maximum half-padding offsets across a set of items, per axis.
 * Used for wall compensation: reduce effective bin dims by these amounts
 * so items against walls still get full padding.
 */
export function getWallPaddingOffsets(items: ShapeItem[]): { 
  lengthLeft: number; lengthRight: number;
  widthFront: number; widthBack: number;
  heightTop: number; heightBottom: number;
} {
  let lengthLeft = 0, lengthRight = 0;
  let widthFront = 0, widthBack = 0;
  let heightTop = 0, heightBottom = 0;

  for (const item of items) {
    const shape = item.packed_shape || 'box';
    const pt = (key: keyof PaperThicknesses) => ((item[key] as number) || 0) / 2;

    switch (shape) {
      case 'box':
      case 'triangular_prism':
        lengthLeft = Math.max(lengthLeft, pt('paper_thickness_left'));
        lengthRight = Math.max(lengthRight, pt('paper_thickness_right'));
        widthFront = Math.max(widthFront, pt('paper_thickness_front'));
        widthBack = Math.max(widthBack, pt('paper_thickness_back'));
        heightTop = Math.max(heightTop, pt('paper_thickness_top'));
        heightBottom = Math.max(heightBottom, pt('paper_thickness_bottom'));
        break;
      case 'cylinder':
        lengthLeft = Math.max(lengthLeft, pt('paper_thickness_side'));
        lengthRight = Math.max(lengthRight, pt('paper_thickness_side'));
        widthFront = Math.max(widthFront, pt('paper_thickness_side'));
        widthBack = Math.max(widthBack, pt('paper_thickness_side'));
        heightTop = Math.max(heightTop, pt('paper_thickness_top'));
        heightBottom = Math.max(heightBottom, pt('paper_thickness_bottom'));
        break;
      case 'cone':
        lengthLeft = Math.max(lengthLeft, pt('paper_thickness_side'));
        lengthRight = Math.max(lengthRight, pt('paper_thickness_side'));
        widthFront = Math.max(widthFront, pt('paper_thickness_side'));
        widthBack = Math.max(widthBack, pt('paper_thickness_side'));
        heightBottom = Math.max(heightBottom, pt('paper_thickness_bottom'));
        heightTop = Math.max(heightTop, pt('paper_thickness_side'));
        break;
      case 'sphere': {
        const hu = pt('paper_thickness_uniform');
        lengthLeft = Math.max(lengthLeft, hu);
        lengthRight = Math.max(lengthRight, hu);
        widthFront = Math.max(widthFront, hu);
        widthBack = Math.max(widthBack, hu);
        heightTop = Math.max(heightTop, hu);
        heightBottom = Math.max(heightBottom, hu);
        break;
      }
    }
  }

  return { lengthLeft, lengthRight, widthFront, widthBack, heightTop, heightBottom };
}

/**
 * Get the effective volume for the item (user override or calculated).
 */
export function getEffectiveVolume(item: ShapeItem): number {
  return item.actual_packed_volume_cubic_inches ?? getShapeVolume(item);
}
