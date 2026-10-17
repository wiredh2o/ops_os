/**
 * 3D Box Packing Algorithm with Paper Fill Calculation
 * 
 * All items are treated as rectangular boxes using their constraint dimensions.
 * Constraint dims are sorted L >= W >= H (flat orientation) before placement.
 * Layer-based stacking with L/W rotation. Post-placement center-clustering
 * positions the item group at the bottom-center of the box.
 * 
 * Paper fill formula: 5ft of 24" paper fills 6"×6"×6" (216 cu in)
 * = 3.6 cubic inches per linear inch of paper
 */

import { 
  getSharedPaddingConstraintDimensions, 
  getEffectiveVolume, 
  getWallPaddingOffsets,
  getShapeVolume,
  type ShapeItem, 
  type PackedShape 
} from './shape-volume-utils';

// Paper fill ratio is now configured per packing paper record (cubic_inches_per_linear_inch).
// No hardcoded fallback — callers must provide the value via PackingOptions.

// Paper weight and cost are now configured per packing paper record in the database.
// No hardcoded fallbacks — callers must provide values via PackingOptions.

// Types
export interface BoxSize {
  id: string;
  name: string;
  dimension_l: number;
  dimension_w: number;
  dimension_h: number;
  max_weight_oz: number | null;
  cost_per_box: number;
  shipping_cost_multiplier?: number; // Multiplier to account for shipping boxes to facility
  weight_oz?: number; // Empty box tare weight
  is_active: boolean;
}

export interface PackableItem {
  id: string;
  name: string;
  packed_dimension_l: number;
  packed_dimension_w: number;
  packed_dimension_h: number;
  weight_oz: number;
  quantity: number;
  // If true, single units ship without outer box; multiples consolidate
  ships_in_own_packaging?: boolean;
  // Stacking control flags
  always_ship_stacked?: boolean;
  max_stack_quantity?: number | null;
  // Shape & packing paper fields
  packed_shape?: PackedShape;
  packed_diameter?: number;
  actual_packed_volume?: number;
  paper_thickness_top?: number;
  paper_thickness_bottom?: number;
  paper_thickness_left?: number;
  paper_thickness_right?: number;
  paper_thickness_front?: number;
  paper_thickness_back?: number;
  paper_thickness_side?: number;
  paper_thickness_uniform?: number;
}

export interface Orientation {
  l: number;
  w: number;
  h: number;
}

export interface PackedItemPosition {
  itemId: string;
  x: number;
  y: number;
  z: number;
  finalL: number;
  finalW: number;
  finalH: number;
  // Original packed dimensions (canonical/unpermuted) for true geometry rendering
  originalL: number;
  originalW: number;
  originalH: number;
  // Which of the 6 axis permutations was chosen (0-5), used for 3D rotation
  rotationIndex: number;
  // Shape rendering metadata
  packedShape?: PackedShape;
  isStacked?: boolean;
  // When true, this wedge should be rendered flipped (hypotenuse-to-hypotenuse with its pair)
  pairedMirror?: boolean;
}

export interface PackingResult {
  box: BoxSize | null;
  packedItems: PackedItemPosition[];
  itemVolume: number;
  boxVolume: number;
  voidVolume: number;
  fillPercentage: number;
  paperFillInches: number;
  paperFillFeet: number;
  paperWeightOz: number;
  totalItemWeightOz: number;
  
  // Box weight (tare weight of empty box)
  boxWeightOz: number;
  
  // Total package weight (items + box + paper)
  totalPackageWeightOz: number;
  
  // Cost calculations
  boxCost: number;
  paperCost: number;
  totalMaterialCost: number;
  
  allItemsFit: boolean;
  weightOk: boolean;
  noBoxAvailable: boolean;
  minimumRequiredDimensions: Orientation | null;
  
  // Track which items were packed (for multi-box scenarios)
  packedItemIds?: string[];
  
  // Self-packaged item metadata
  isSelfPackaged?: boolean;
  selfPackagedDimensions?: Orientation;
}

export interface BoxRecommendation {
  primary: PackingResult;
  alternatives: PackingResult[];
  itemsMissingDimensions: string[];
}

// Multi-box packing types
export interface MultiBoxPackingResult {
  packages: PackingResult[];
  requiresMultipleBoxes: boolean;
  allItemsFit: boolean;
  
  // Totals across all packages
  totalWeightOz: number;
  totalMaterialCost: number;
  totalPaperFeet: number;
  totalBoxCost: number;
  totalPaperCost: number;
  
  // Items that couldn't be packed
  unpackedItems: PackableItem[];
  itemsMissingDimensions: string[];
}

interface PlacedBox {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  itemId: string;
  // Original packed dimensions (canonical/unpermuted, no padding)
  origL: number;
  origW: number;
  origH: number;
  // Which permutation index was chosen (0-5)
  rotationIndex: number;
  // Shape metadata for volume and rendering
  packedShape?: PackedShape;
  actualVolume: number;
  // Weight for CoG balancing
  weightOz: number;
  // True when placed as part of an alwaysStacked vertical stack — protects from layer split/merge
  isStacked?: boolean;
  // Pre-consolidated stack unit metadata
  isStackUnit?: boolean;
  constituentItems?: ExpandedItem[];
  // True when placed during intra-layer gap-fill (used by centering to exclude from bounding box)
  isGapFill?: boolean;
}

// Internal expanded item type carrying shape + volume metadata
interface ExpandedItem {
  l: number;
  w: number;
  h: number;
  // Original packed dimensions (no padding) for geometry rendering
  origL: number;
  origW: number;
  origH: number;
  id: string;
  originalId: string;
  volume: number; // constraint volume for sorting
  actualVolume: number; // true geometric volume
  packedShape?: PackedShape;
  // Weight for CoG balancing
  weightOz: number;
  // Stacking control flags
  alwaysStacked: boolean;
  maxStackQty: number | null;
  // Wedge pairing tracking
  isPairedWedge?: boolean;
  pairedItemIds?: string[];
  pairedOriginalIds?: string[];
  // Pre-consolidated stack unit metadata
  isStackUnit?: boolean;
  constituentItems?: ExpandedItem[];
}


// ─── Core Geometry Utilities ─────────────────────────────────────────────────

/**
 * Generate all 6 unique orientations for an item
 */
export function getAllOrientations(l: number, w: number, h: number): Orientation[] {
  const orientations: Orientation[] = [
    { l, w, h },
    { l, w: h, h: w },
    { l: w, w: l, h },
    { l: w, w: h, h: l },
    { l: h, w: l, h: w },
    { l: h, w, h: l },
  ];

  // Remove duplicates (important for cubes or items with equal dimensions)
  const unique: Orientation[] = [];
  const seen = new Set<string>();
  
  for (const o of orientations) {
    const posKey = `${o.l},${o.w},${o.h}`;
    if (!seen.has(posKey)) {
      seen.add(posKey);
      unique.push(o);
    }
  }
  
  return unique;
}

/**
 * Check if an item can fit in a box in any orientation
 */
export function fitsInBoxWithRotation(
  item: { l: number; w: number; h: number },
  box: { l: number; w: number; h: number }
): boolean {
  const orientations = getAllOrientations(item.l, item.w, item.h);
  
  return orientations.some(o => 
    o.l <= box.l && o.w <= box.w && o.h <= box.h
  );
}




// ─── Boundary Check (Rule 2) ────────────────────────────────────────────────

/**
 * Check if a single item's flat-sorted constraint dims fit within the box's sorted dims.
 * Both are sorted descending so we compare largest-to-largest, mid-to-mid, smallest-to-smallest.
 */
function canItemFitInBox(
  itemDims: [number, number, number],
  boxDims: [number, number, number]
): boolean {
  // Both arrays must already be sorted descending
  return itemDims[0] <= boxDims[0] + 0.001
    && itemDims[1] <= boxDims[1] + 0.001
    && itemDims[2] <= boxDims[2] + 0.001;
}

/**
 * Check if ALL expanded items can fit within the box's effective dimensions.
 * Returns false if ANY single item violates the boundary.
 */
function allItemsFitBoundary(
  expandedItems: ExpandedItem[],
  effectiveBinL: number,
  effectiveBinW: number,
  effectiveBinH: number
): boolean {
  const boxDims: [number, number, number] = [effectiveBinL, effectiveBinW, effectiveBinH].sort((a, b) => b - a) as [number, number, number];
  
  for (const item of expandedItems) {
    const itemDims: [number, number, number] = [item.l, item.w, item.h].sort((a, b) => b - a) as [number, number, number];
    if (!canItemFitInBox(itemDims, boxDims)) {
      return false;
    }
  }
  return true;
}

// ─── Placement Sort Strategies ──────────────────────────────────────────────

type PlacementSortStrategy = 'footprint-desc' | 'face-area-desc' | 'volume-desc' | 'height-asc-face-desc';

// ─── Layer Stacking (Clean 7-Step Algorithm) ────────────────────────────────

/**
 * Layer-based 3D bin packing algorithm — STRICT footprint-group discipline.
 *
 * At each layer boundary, ALL remaining items are sorted by footprint area
 * descending. Only the CURRENT LARGEST footprint group is considered for each
 * layer (items within 5% footprint tolerance). This ensures the largest-footprint
 * SKU is fully exhausted before any smaller-footprint SKU begins placement.
 *
 * Items within the same footprint group are placed using grid (uniform dims)
 * or cursor (mixed dims) logic. No pre-consolidation, no multi-phase passes.
 */
/**
 * Find contiguous free rectangular regions in a layer's 2D footprint.
 * Uses a boolean occupancy grid at `gridStep` resolution.
 */

// ── INTRA-LAYER GAP-FILL HELPERS ─────────────────────────────────────────

interface VacantRect {
  x: number;
  y: number;
  l: number;
  w: number;
}

/**
 * Scan the layer's XY footprint and return maximal free rectangles
 * not occupied by any item in `placedThisLayer`.
 */
function findVacantRectangles(
  placedThisLayer: PlacedBox[],
  binL: number,
  binW: number,
  gridStep: number = 0.25
): VacantRect[] {
  const cols = Math.ceil(binL / gridStep);
  const rows = Math.ceil(binW / gridStep);
  // Build occupancy grid (true = occupied)
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (const item of placedThisLayer) {
    const c0 = Math.floor(item.x / gridStep);
    const c1 = Math.ceil((item.x + item.l) / gridStep);
    const r0 = Math.floor(item.y / gridStep);
    const r1 = Math.ceil((item.y + item.w) / gridStep);
    for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) {
      for (let c = Math.max(0, c0); c < Math.min(cols, c1); c++) {
        grid[r][c] = true;
      }
    }
  }

  // Greedy sweep: for each free cell, expand right then down to find maximal rectangles
  const rects: VacantRect[] = [];
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] || visited[r][c]) continue;
      // Expand right
      let maxC = c;
      while (maxC + 1 < cols && !grid[r][maxC + 1] && !visited[r][maxC + 1]) maxC++;
      // Expand down keeping the same column span
      let maxR = r;
      outer: while (maxR + 1 < rows) {
        for (let cc = c; cc <= maxC; cc++) {
          if (grid[maxR + 1][cc] || visited[maxR + 1][cc]) break outer;
        }
        maxR++;
      }
      // Mark visited
      for (let rr = r; rr <= maxR; rr++) {
        for (let cc = c; cc <= maxC; cc++) {
          visited[rr][cc] = true;
        }
      }
      const rx = c * gridStep;
      const ry = r * gridStep;
      const rl = (maxC - c + 1) * gridStep;
      const rw = (maxR - r + 1) * gridStep;
      // Clamp to bin bounds
      const clampedL = Math.min(rl, binL - rx);
      const clampedW = Math.min(rw, binW - ry);
      if (clampedL > 0.1 && clampedW > 0.1) {
        rects.push({ x: rx, y: ry, l: clampedL, w: clampedW });
      }
    }
  }

  // Sort by area descending
  rects.sort((a, b) => (b.l * b.w) - (a.l * a.w));
  return rects;
}

/**
 * Fill vacant rectangles with remaining items, including vertical stacking
 * within the layer's height budget.
 */
function fillLayerGaps(
  vacantRects: VacantRect[],
  remaining: ExpandedItem[],
  currentZ: number,
  layerH: number,
  _binH: number
): { placed: PlacedBox[]; stillRemaining: ExpandedItem[] } {
  const placed: PlacedBox[] = [];
  let rects = [...vacantRects];
  const usedIndices = new Set<number>();
  // Keep original array for index tracking
  const pool = [...remaining];

  // ── PASS 1: Exhaust XY footprint — place one base item per vacant rectangle ──
  // Score by footprint area only (no stacking bonus) to spread items across the layer first.
  interface BasePlacement { placedIdx: number; rectX: number; rectY: number; oriL: number; oriW: number; baseH: number; }
  const basePlacements: BasePlacement[] = [];

  for (let ri = 0; ri < rects.length; ri++) {
    const rect = rects[ri];

    let bestScore = -1;
    let bestBaseIdx = -1;
    let bestOriL = 0;
    let bestOriW = 0;

    for (let si = 0; si < pool.length; si++) {
      if (usedIndices.has(si)) continue;
      const item = pool[si];
      if (item.h > layerH + 0.001) continue;

      const orientations: [number, number][] = [
        [item.l, item.w],
        [item.w, item.l],
      ];
      for (const [oriL, oriW] of orientations) {
        if (oriL > rect.l + 0.001 || oriW > rect.w + 0.001) continue;

        // Score by footprint area only — spread before stack
        const area = oriL * oriW;
        if (area > bestScore) {
          bestScore = area;
          bestBaseIdx = si;
          bestOriL = oriL;
          bestOriW = oriW;
        }
      }
    }

    if (bestBaseIdx < 0) continue;

    const baseItem = pool[bestBaseIdx];
    const placedIndex = placed.length;
    placed.push({
      x: rect.x,
      y: rect.y,
      z: currentZ,
      l: bestOriL,
      w: bestOriW,
      h: baseItem.h,
      itemId: baseItem.id,
      origL: baseItem.origL,
      origW: baseItem.origW,
      origH: baseItem.origH,
      rotationIndex: 0,
      packedShape: baseItem.packedShape,
      actualVolume: baseItem.actualVolume,
      weightOz: baseItem.weightOz,
      isStackUnit: baseItem.isStackUnit,
      constituentItems: baseItem.constituentItems,
      isGapFill: true,
    });
    usedIndices.add(bestBaseIdx);
    basePlacements.push({ placedIdx: placedIndex, rectX: rect.x, rectY: rect.y, oriL: bestOriL, oriW: bestOriW, baseH: baseItem.h });

    // Guillotine split — residuals go back into the rect list for more base placements
    const residuals: VacantRect[] = [];
    const rightL = rect.l - bestOriL;
    if (rightL > 0.1) {
      residuals.push({ x: rect.x + bestOriL, y: rect.y, l: rightL, w: rect.w });
    }
    const bottomW = rect.w - bestOriW;
    if (bottomW > 0.1) {
      residuals.push({ x: rect.x, y: rect.y + bestOriW, l: bestOriL, w: bottomW });
    }
    rects.splice(ri, 1, ...residuals);
    ri--;
  }

  // ── PASS 2: Stack vertically into remaining headroom above each base ──
  for (const bp of basePlacements) {
    let stackZ = currentZ + bp.baseH;
    let headroom = layerH - bp.baseH;
    let stackedAbove = 0;

    for (let ssi = 0; ssi < pool.length && headroom > 0.01; ssi++) {
      if (usedIndices.has(ssi)) continue;
      const stackItem = pool[ssi];
      if (stackItem.h > headroom + 0.001) continue;
      const stackOris: [number, number][] = [
        [stackItem.l, stackItem.w],
        [stackItem.w, stackItem.l],
      ];
      for (const [sL, sW] of stackOris) {
        if (sL <= bp.oriL + 0.001 && sW <= bp.oriW + 0.001) {
          placed.push({
            x: bp.rectX,
            y: bp.rectY,
            z: stackZ,
            l: sL,
            w: sW,
            h: stackItem.h,
            itemId: stackItem.id,
            origL: stackItem.origL,
            origW: stackItem.origW,
            origH: stackItem.origH,
            rotationIndex: 0,
            packedShape: stackItem.packedShape,
            actualVolume: stackItem.actualVolume,
            weightOz: stackItem.weightOz,
            isStacked: true,
            isStackUnit: stackItem.isStackUnit,
            constituentItems: stackItem.constituentItems,
            isGapFill: true,
          });
          usedIndices.add(ssi);
          stackZ += stackItem.h;
          headroom -= stackItem.h;
          stackedAbove++;
          break;
        }
      }
    }

    // Mark base as stacked if items were placed above it
    if (stackedAbove > 0) {
      placed[bp.placedIdx].isStacked = true;
      console.log(`[BoxPack] Gap-fill stack: ${placed[bp.placedIdx].itemId} + ${stackedAbove} above, base marked isStacked`);
    }
  }

  const stillRemaining = pool.filter((_, i) => !usedIndices.has(i));
  return { placed, stillRemaining };
}

function packWithLayerStacking(
  items: ExpandedItem[],
  binL: number,
  binW: number,
  binH: number,
  sortStrategy: PlacementSortStrategy = 'footprint-desc'
): PlacedBox[] {
  const placed: PlacedBox[] = [];
  let allRemaining = [...items];
  let currentZ = 0;

  // ── PART A: Pre-consolidate alwaysStacked items into stack units ──
  {
    const stackedItems = allRemaining.filter(it => it.alwaysStacked);
    const nonStackedItems = allRemaining.filter(it => !it.alwaysStacked);

    if (stackedItems.length > 0) {
      // Group by originalId (SKU)
      const skuGroups = new Map<string, ExpandedItem[]>();
      for (const it of stackedItems) {
        if (!skuGroups.has(it.originalId)) skuGroups.set(it.originalId, []);
        skuGroups.get(it.originalId)!.push(it);
      }

      const stackUnits: ExpandedItem[] = [];
      for (const [skuId, group] of skuGroups) {
        const maxQty = group[0].maxStackQty;
        const chunkSize = (maxQty && maxQty > 0) ? maxQty : group.length;

        for (let ci = 0; ci < group.length; ci += chunkSize) {
          const chunk = group.slice(ci, ci + chunkSize);
          const totalH = chunk.reduce((s, it) => s + it.h, 0);
          const totalVol = chunk.reduce((s, it) => s + it.volume, 0);
          const totalActualVol = chunk.reduce((s, it) => s + it.actualVolume, 0);
          const totalWeight = chunk.reduce((s, it) => s + it.weightOz, 0);
          const chunkIndex = Math.floor(ci / chunkSize);

          stackUnits.push({
            l: chunk[0].l,
            w: chunk[0].w,
            h: totalH,
            origL: chunk[0].origL,
            origW: chunk[0].origW,
            origH: chunk[0].origH,
            id: `__stack__${skuId}__${chunkIndex}`,
            originalId: skuId,
            volume: totalVol,
            actualVolume: totalActualVol,
            packedShape: chunk[0].packedShape,
            weightOz: totalWeight,
            alwaysStacked: true,
            maxStackQty: chunk[0].maxStackQty,
            isStackUnit: true,
            constituentItems: chunk,
          });
        }

        console.log(`[BoxPack] Pre-consolidated ${group.length} alwaysStacked items of SKU into ${stackUnits.filter(u => u.originalId === skuId).length} stack unit(s): ${group[0].l.toFixed(2)} x ${group[0].w.toFixed(2)} x ${stackUnits.filter(u => u.originalId === skuId).reduce((s, u) => s + u.h, 0).toFixed(2)}"`);
      }

      allRemaining = [...nonStackedItems, ...stackUnits];
    }
  }

  while (allRemaining.length > 0 && currentZ < binH - 0.001) {
    // Re-sort ALL remaining by footprint area descending at each layer start
    allRemaining.sort((a, b) => {
      const footA = a.l * a.w;
      const footB = b.l * b.w;
      if (Math.abs(footB - footA) > 0.001) return footB - footA;
      return b.volume - a.volume;
    });

    const headroom = binH - currentZ;

    // Filter to items that fit under the ceiling
    const fittingItems = allRemaining.filter(it => it.h <= headroom + 0.001);
    if (fittingItems.length === 0) break;

    // ── STRICT FOOTPRINT GROUP: only consider items with the same footprint
    // as the largest remaining item (within 5% tolerance).
    const maxFootprint = fittingItems[0].l * fittingItems[0].w;
    const FOOTPRINT_TOLERANCE = 0.05; // 5%
    const footprintGroupCandidates = fittingItems.filter(it => {
      const fp = it.l * it.w;
      return Math.abs(fp - maxFootprint) / Math.max(maxFootprint, 0.001) <= FOOTPRINT_TOLERANCE;
    });

    // Everything NOT in the current footprint group goes back to remaining
    const currentGroupIds = new Set(footprintGroupCandidates.map(it => it.id));
    const deferredItems = allRemaining.filter(it => !currentGroupIds.has(it.id));

    // Layer height driven by the first (largest footprint) fitting item in the group
    const layerH = footprintGroupCandidates[0].h;

    // Only include group items that fit within this layer height
    const HEIGHT_TOLERANCE = 0.1;
    const layerCandidates = footprintGroupCandidates.filter(
      it => it.h <= layerH + HEIGHT_TOLERANCE
    );
    // Items in the footprint group but too tall for this layer height
    const groupTooTall = footprintGroupCandidates.filter(
      it => it.h > layerH + HEIGHT_TOLERANCE
    );

    if (layerCandidates.length === 0) {
      // All items in this footprint group are too tall — defer them and try next group
      allRemaining = [...groupTooTall, ...deferredItems];
      continue;
    }

    // Check if candidates are uniform (same L, W dimensions)
    const isUniform = layerCandidates.every(
      it => Math.abs(it.l - layerCandidates[0].l) < 0.01 &&
            Math.abs(it.w - layerCandidates[0].w) < 0.01
    );

    const placedThisLayer: PlacedBox[] = [];

    if (isUniform) {
      // Grid-optimal placement for identical items
      const itemL = layerCandidates[0].l;
      const itemW = layerCandidates[0].w;

      // Keep deterministic ordering but prioritize paired wedges over solo wedges
      // within the same SKU so lower layers maximize actual unit count.
      const orderedLayerCandidates = [...layerCandidates].sort((a, b) => {
        if (a.originalId === b.originalId) {
          const aPaired = a.isPairedWedge ? 1 : 0;
          const bPaired = b.isPairedWedge ? 1 : 0;
          if (aPaired !== bPaired) return bPaired - aPaired;
        }
        return 0;
      });

      const n = orderedLayerCandidates.length;

      const tryGrid = (iL: number, iW: number) => {
        const cols = Math.floor((binL + 0.001) / iL);
        const rows = Math.floor((binW + 0.001) / iW);
        return { cols, rows, perLayer: cols * rows, iL, iW };
      };

      const optA = tryGrid(itemL, itemW);
      const optB = (Math.abs(itemL - itemW) < 0.001) ? optA : tryGrid(itemW, itemL);

      // Determine max-capacity orientation (used when items span multiple layers)
      const maxCapOpt = optA.perLayer >= optB.perLayer ? optA : optB;

      const boxAspect = binL / binW;
      let bestOpt = optA.perLayer > 0 ? optA : optB;
      let useCols = bestOpt.cols;
      let useRows = bestOpt.rows;
      let bestAspectDiff = Infinity;
      let bestCells = Infinity;
      let bestEffective = 0;

      for (const opt of [optA, optB]) {
        if (opt.perLayer === 0) continue;
        const effective = Math.min(opt.perLayer, n);

        for (let c = 1; c <= opt.cols; c++) {
          const r = Math.ceil(effective / c);
          if (r > opt.rows) continue;
          if (c * r < effective) continue;

          const clusterAspect = (c * opt.iL) / (r * opt.iW);
          const aspectDiff = Math.abs(clusterAspect - boxAspect);
          const cells = c * r;
          const isExact = (cells === effective);
          const bestIsExact = (bestCells === bestEffective);

          if (effective > bestEffective ||
              (effective === bestEffective && isExact && !bestIsExact) ||
              (effective === bestEffective && isExact === bestIsExact && aspectDiff < bestAspectDiff - 0.001) ||
              (effective === bestEffective && isExact === bestIsExact && Math.abs(aspectDiff - bestAspectDiff) < 0.001 && cells < bestCells)) {
            bestOpt = opt;
            useCols = c;
            useRows = r;
            bestAspectDiff = aspectDiff;
            bestCells = cells;
            bestEffective = effective;
          }
        }
      }

      // MAXIMIZE FIRST LAYER RULE: When items span multiple layers,
      // always force the max-capacity orientation and a full grid.
      // Aspect-ratio optimization is only for single-layer (final/partial) placement.
      const spansMultipleLayers = maxCapOpt.perLayer > 0 && n > maxCapOpt.perLayer;
      if (spansMultipleLayers) {
        bestOpt = maxCapOpt;
        useCols = maxCapOpt.cols;
        useRows = maxCapOpt.rows;
      }

      const toPlace = Math.min(n, bestOpt.perLayer);
      if (toPlace > 0) {
        for (let i = 0; i < toPlace; i++) {
          const col = i % useCols;
          const row = Math.floor(i / useCols);
          const item = orderedLayerCandidates[i];
          const pb: PlacedBox = {
            x: col * bestOpt.iL,
            y: row * bestOpt.iW,
            z: currentZ,
            l: bestOpt.iL,
            w: bestOpt.iW,
            h: item.h,
            itemId: item.id,
            origL: item.origL,
            origW: item.origW,
            origH: item.origH,
            rotationIndex: 0,
            packedShape: item.packedShape,
            actualVolume: item.actualVolume,
            weightOz: item.weightOz,
            isStackUnit: item.isStackUnit,
            constituentItems: item.constituentItems,
          };
          placed.push(pb);
          placedThisLayer.push(pb);
        }
        const remainingCandidates = orderedLayerCandidates.slice(toPlace);
        allRemaining = [...remainingCandidates, ...groupTooTall, ...deferredItems];
      } else {
        allRemaining = [...groupTooTall, ...deferredItems];
      }
    } else {
      // Mixed-size within same footprint group: cursor placement
      let cursorX = 0;
      let cursorY = 0;
      let rowW = 0;
      const notPlaced: ExpandedItem[] = [];

      for (const item of layerCandidates) {
        const orientations: { l: number; w: number }[] = [
          { l: item.l, w: item.w },
          { l: item.w, w: item.l },
        ];
        const uniqueOrientations = Math.abs(item.l - item.w) < 0.001
          ? [orientations[0]]
          : orientations;

        let fitted = false;
        for (const ori of uniqueOrientations) {
          if (ori.l > binL + 0.001 || ori.w > binW + 0.001) continue;

          let testX = cursorX;
          let testY = cursorY;
          let testRowW = rowW;

          if (testX + ori.l > binL + 0.001) {
            testX = 0;
            testY += testRowW;
            testRowW = 0;
          }
          if (testY + ori.w > binW + 0.001) continue;

          const pb: PlacedBox = {
            x: testX,
            y: testY,
            z: currentZ,
            l: ori.l,
            w: ori.w,
            h: item.h,
            itemId: item.id,
            origL: item.origL,
            origW: item.origW,
            origH: item.origH,
            rotationIndex: 0,
            packedShape: item.packedShape,
            actualVolume: item.actualVolume,
            weightOz: item.weightOz,
            isStackUnit: item.isStackUnit,
            constituentItems: item.constituentItems,
          };
          placed.push(pb);
          placedThisLayer.push(pb);

          cursorX = testX + ori.l;
          cursorY = testY;
          rowW = Math.max(testRowW, ori.w);
          fitted = true;
          break;
        }
        if (!fitted) notPlaced.push(item);
      }
      allRemaining = [...notPlaced, ...groupTooTall, ...deferredItems];
    }

    // If nothing was placed this layer, break to avoid infinite loop
    if (placedThisLayer.length === 0) break;

    // ── INTRA-LAYER DENSIFICATION: fill vacant XY space with deferred + tall same-footprint items ──
    if (placedThisLayer.length > 0 && allRemaining.length > 0) {
      const vacantRects = findVacantRectangles(placedThisLayer, binL, binW);
      if (vacantRects.length > 0) {
        // Build densification pool from explicit buckets:
        // 1. tallSameFootprint (groupTooTall) — same footprint but taller than layer height (e.g. gears)
        // 2. otherFootprints (deferredItems) — different footprint SKUs
        // 3. overflowSameLayer — unplaced items from the current footprint group (fallback only)
        const tallSameFootprintIds = new Set(groupTooTall.map(it => it.id));
        const deferredItemIds = new Set(deferredItems.map(it => it.id));

        const tallSameFootprint = allRemaining.filter(it => tallSameFootprintIds.has(it.id));
        const otherFootprints = allRemaining.filter(it => deferredItemIds.has(it.id));
        const overflowSameLayer = allRemaining.filter(it =>
          !tallSameFootprintIds.has(it.id) && !deferredItemIds.has(it.id)
        );

        // Merged densify pool: overflow (same-footprint leftovers) first,
        // then tall same-footprint, then other footprints.
        // This ensures footprint saturation happens before switching SKUs.
        const densifyPool = [...overflowSameLayer, ...tallSameFootprint, ...otherFootprints];

        console.log(`[BoxPack] Densify pool: overflow=${overflowSameLayer.length}, tallSameFootprint=${tallSameFootprint.length}, otherFootprints=${otherFootprints.length}`);

        // CRITICAL: Constrain gap-fill to the current layer band only.
        // This prevents densification from pre-building into future layers,
        // ensuring each new layer starts with the full XY footprint available.
        const gapBandH = layerH;
        const { placed: gapFilled, stillRemaining } = fillLayerGaps(
          vacantRects, densifyPool, currentZ, gapBandH, binH
        );
        for (const gf of gapFilled) {
          placed.push(gf);
          placedThisLayer.push(gf);
        }

        // Reconcile: stillRemaining is whatever densify didn't use
        allRemaining = [...stillRemaining];

        if (gapFilled.length > 0) {
          console.log(`[BoxPack] Intra-layer densification: ${gapFilled.length} items filled into gaps`);
        }
      }
    }

    // Advance Z by the tallest item placed on this layer (primary or gap-fill)
    let effectiveLayerH = layerH;
    for (const gf of placedThisLayer) {
      const topZ = (gf.z - currentZ) + gf.h;
      if (topZ > effectiveLayerH) effectiveLayerH = topZ;
    }
    currentZ += effectiveLayerH;
  }

  console.log(`[BoxPack] Placement summary: ${placed.length} items placed, ${allRemaining.length} overflow remaining`);

  // ── PART A (cont.): Expand stack units back into individual PlacedBox entries ──
  const finalPlaced: PlacedBox[] = [];
  for (const pb of placed) {
    if (pb.isStackUnit && pb.constituentItems && pb.constituentItems.length > 0) {
      let zCursor = pb.z;
      for (const constituent of pb.constituentItems) {
        finalPlaced.push({
          x: pb.x,
          y: pb.y,
          z: zCursor,
          l: pb.l,
          w: pb.w,
          h: constituent.h,
          itemId: constituent.id,
          origL: constituent.origL,
          origW: constituent.origW,
          origH: constituent.origH,
          rotationIndex: pb.rotationIndex,
          packedShape: constituent.packedShape,
          actualVolume: constituent.actualVolume,
          weightOz: constituent.weightOz,
          isStacked: true,
        });
        zCursor += constituent.h;
      }
    } else {
      finalPlaced.push(pb);
    }
  }

  return finalPlaced;
}


/**
 * Try multiple sort strategies and return the placement that packs the most items.
 * On ties, picks the result with the highest total packed volume (proxy for fill %).
 */
function packWithBestStrategy(
  items: ExpandedItem[],
  binL: number,
  binW: number,
  binH: number
): PlacedBox[] {
  // SKU Layer Discipline: always use footprint-desc to pack largest-footprint
  // items first, filling layers bottom-to-top until box ceiling is reached.
  return packWithLayerStacking(items, binL, binW, binH, 'footprint-desc');
}


/**
 * Calculate minimum bounding box required for all items
 */
export function calculateMinimumBoundingBox(items: PackableItem[]): Orientation {
  // Expand items by quantity
  const expandedItems: { l: number; w: number; h: number }[] = [];
  
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({
        l: item.packed_dimension_l,
        w: item.packed_dimension_w,
        h: item.packed_dimension_h,
      });
    }
  }
  
  if (expandedItems.length === 0) {
    return { l: 0, w: 0, h: 0 };
  }
  
  // Find the largest single item dimension in each axis
  let maxL = 0;
  let maxW = 0;
  let totalVolume = 0;
  
  for (const item of expandedItems) {
    const dims = [item.l, item.w, item.h].sort((a, b) => b - a);
    maxL = Math.max(maxL, dims[0]);
    maxW = Math.max(maxW, dims[1]);
    totalVolume += item.l * item.w * item.h;
  }
  
  // Estimate height based on volume and footprint
  const estimatedH = Math.ceil(totalVolume / (maxL * maxW));
  
  return {
    l: Math.ceil(maxL),
    w: Math.ceil(maxW),
    h: Math.max(estimatedH, Math.ceil(expandedItems[0]?.h || 0)),
  };
}

export interface PackingOptions {
  /** Required: weight of paper per linear foot (oz) */
  paperWeightOzPerFoot: number;
  /** Required: cost of paper per linear foot ($) */
  paperCostPerFoot: number;
  /** Required: shipping cost multiplier for paper */
  paperShippingCostMultiplier: number;
  /** Required: cubic inches of void filled per linear inch of paper */
  paperCubicInchesPerInch: number;
}

// ─── Build ShapeItem helper ──────────────────────────────────────────────────

function toShapeItem(item: PackableItem): ShapeItem {
  return {
    packed_shape: item.packed_shape || 'box',
    packed_dimension_l: item.packed_dimension_l,
    packed_dimension_w: item.packed_dimension_w,
    packed_dimension_h: item.packed_dimension_h,
    packed_diameter: item.packed_diameter,
    actual_packed_volume_cubic_inches: item.actual_packed_volume,
    paper_thickness_top: item.paper_thickness_top,
    paper_thickness_bottom: item.paper_thickness_bottom,
    paper_thickness_left: item.paper_thickness_left,
    paper_thickness_right: item.paper_thickness_right,
    paper_thickness_front: item.paper_thickness_front,
    paper_thickness_back: item.paper_thickness_back,
    paper_thickness_side: item.paper_thickness_side,
    paper_thickness_uniform: item.paper_thickness_uniform,
  };
}

// ─── Overlap Detection & Resolution ─────────────────────────────────────────

interface OverlapViolation {
  indexA: number;
  indexB: number;
  overlapX: number;
  overlapY: number;
}

/**
 * Detect XY overlaps among items sharing the same Z level (within tolerance).
 * Returns array of violations with the pair indices.
 */
function detectLayerOverlaps(placed: PlacedBox[]): OverlapViolation[] {
  const violations: OverlapViolation[] = [];

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];

      // 3D AABB: check Z-range overlap first
      const zOverlap = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
      if (zOverlap <= 0.01) continue; // different height bands

      // XY overlap
      const oX = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
      const oY = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
      if (oX > 0.01 && oY > 0.01) {
        // Skip if both are in the same stack column (same x/y, both isStacked)
        if (a.isStacked && b.isStacked &&
            Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) {
          continue;
        }
        violations.push({ indexA: i, indexB: j, overlapX: oX, overlapY: oY });
      }
    }
  }
  return violations;
}

/**
 * Resolve detected overlaps by relocating conflicting items.
 * For each violation, tries to find a non-overlapping grid position in the same layer.
 * If none found, moves the item to a new Z level above all existing items.
 */
function resolveLayerOverlaps(placed: PlacedBox[], binL: number, binW: number, binH: number, wallBounds?: WallOffsetsDims): void {
  const GRID = 0.25;
  const searchMinL = wallBounds?.minL ?? 0;
  const searchMinW = wallBounds?.minW ?? 0;
  const searchMaxL = wallBounds?.maxL ?? binL;
  const searchMaxW = wallBounds?.maxW ?? binW;
  const searchMaxH = wallBounds?.maxH ?? binH;
  let violations = detectLayerOverlaps(placed);
  let iterations = 0;

  // Track which indices have already been relocated as part of a stack
  const relocatedAsStack = new Set<number>();

  while (violations.length > 0 && iterations < 40) {
    iterations++;

    // Sort violations so we attempt to move the smaller-footprint partner first
    const sortedViolations = [...violations].sort((a, b) => {
      const fpAmin = Math.min(placed[a.indexA].l * placed[a.indexA].w, placed[a.indexB].l * placed[a.indexB].w);
      const fpBmin = Math.min(placed[b.indexA].l * placed[b.indexA].w, placed[b.indexB].l * placed[b.indexB].w);
      return fpAmin - fpBmin; // handle smallest-footprint conflicts first
    });

    let madeProgress = false;

    for (const v of sortedViolations) {
      // Re-check if this specific pair still overlaps (prior moves may have resolved it)
      const a = placed[v.indexA], b = placed[v.indexB];
      const zOv = Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z);
      if (zOv <= 0.01) continue;
      const oX = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
      const oY = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
      if (oX <= 0.01 || oY <= 0.01) continue;
      if (a.isStacked && b.isStacked && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) continue;

      // Pick which item to move: smaller footprint, tie-break by higher index
      const fpA = placed[v.indexA].l * placed[v.indexA].w;
      const fpB = placed[v.indexB].l * placed[v.indexB].w;
      const moveIdx = fpA < fpB ? v.indexA : fpA > fpB ? v.indexB : Math.max(v.indexA, v.indexB);

      if (relocatedAsStack.has(moveIdx)) continue;

      const item = placed[moveIdx];

      // Find stack siblings
      const stackIndices: number[] = [moveIdx];
      if (item.isStacked) {
        for (let si = 0; si < placed.length; si++) {
          if (si === moveIdx) continue;
          const sib = placed[si];
          if (sib.isStacked && Math.abs(sib.x - item.x) < 0.01 && Math.abs(sib.y - item.y) < 0.01) {
            stackIndices.push(si);
          }
        }
      }

      const stackItems = stackIndices.map(si => placed[si]);
      const stackL = Math.max(...stackItems.map(s => s.l));
      const stackW = Math.max(...stackItems.map(s => s.w));
      const nonStackIdxSet = new Set(stackIndices);
      const others = placed.filter((_, i) => !nonStackIdxSet.has(i));

      let relocated = false;
      for (let tx = searchMinL; tx <= searchMaxL - stackL + 0.001 && !relocated; tx += GRID) {
        for (let ty = searchMinW; ty <= searchMaxW - stackW + 0.001 && !relocated; ty += GRID) {
          const anyOverlap = stackItems.some(si => {
            const sL = si.l, sW = si.w, sZ = si.z, sH = si.h;
            return others.some(ex => {
              const zOv2 = Math.min(sZ + sH, ex.z + ex.h) - Math.max(sZ, ex.z);
              if (zOv2 <= 0.01) return false;
              return (tx < ex.x + ex.l - 0.001 && tx + sL > ex.x + 0.001 &&
                      ty < ex.y + ex.w - 0.001 && ty + sW > ex.y + 0.001);
            });
          });
          if (!anyOverlap) {
            for (const si of stackItems) { si.x = tx; si.y = ty; }
            relocated = true;
          }
        }
      }

      if (!relocated) {
        const maxZ = Math.max(...placed.map(pb => pb.z + pb.h));
        const stackH = Math.max(...stackItems.map(s => s.z + s.h)) - Math.min(...stackItems.map(s => s.z));
        if (maxZ + stackH <= searchMaxH + 0.001) {
          const minStackZ = Math.min(...stackItems.map(s => s.z));
          for (const si of stackItems) { si.z = maxZ + (si.z - minStackZ); }
          relocated = true;
        }
      }

      if (relocated) {
        for (const si of stackIndices) relocatedAsStack.add(si);
        madeProgress = true;
      }
      // If not relocated, continue to next violation instead of breaking
    }

    if (!madeProgress) {
      console.warn(`[BoxPack] resolveLayerOverlaps: no progress at iteration ${iterations}, ${violations.length} violations remain`);
      break; // No candidate could be moved — exit to let stripping handle it
    }

    violations = detectLayerOverlaps(placed);
  }

  if (violations.length > 0) {
    console.warn(`[BoxPack] resolveLayerOverlaps: ${violations.length} violations remain after ${iterations} iterations`);
  }
}

// ─── Center-Cluster Pipeline (Rule 6) ────────────────────────────────────────

interface WallOffsetsDims {
  minL: number; maxL: number;
  minW: number; maxW: number;
  minH: number; maxH: number;
}

/**
 * Post-placement: center the entire cluster on L and W axes within the
 * wall-compensated usable range. Items sit on the bottom of the box (rule 6).
 * Mutates `placed` in-place.
 */
function centerClusterInBox(
  placed: PlacedBox[],
  wallBounds: WallOffsetsDims
): void {
  if (placed.length === 0) return;

  let clusterMinL = Infinity, clusterMaxL = -Infinity;
  let clusterMinW = Infinity, clusterMaxW = -Infinity;
  let clusterMinH = Infinity;

  for (const pb of placed) {
    clusterMinL = Math.min(clusterMinL, pb.x);
    clusterMaxL = Math.max(clusterMaxL, pb.x + pb.l);
    clusterMinW = Math.min(clusterMinW, pb.y);
    clusterMaxW = Math.max(clusterMaxW, pb.y + pb.w);
    clusterMinH = Math.min(clusterMinH, pb.z);
  }

  const clusterWidthL = clusterMaxL - clusterMinL;
  const clusterWidthW = clusterMaxW - clusterMinW;

  const usableL = wallBounds.maxL - wallBounds.minL;
  const usableW = wallBounds.maxW - wallBounds.minW;

  // Center on L and W axes; sit on bottom for H axis
  const offsetL = wallBounds.minL + (usableL - clusterWidthL) / 2 - clusterMinL;
  const offsetW = wallBounds.minW + (usableW - clusterWidthW) / 2 - clusterMinW;
  const offsetH = wallBounds.minH - clusterMinH;

  for (const pb of placed) {
    pb.x += offsetL;
    pb.y += offsetW;
    pb.z += offsetH;

    // Boundary clamp
    pb.x = Math.max(wallBounds.minL, Math.min(pb.x, wallBounds.maxL - pb.l));
    pb.y = Math.max(wallBounds.minW, Math.min(pb.y, wallBounds.maxW - pb.w));
    pb.z = Math.max(wallBounds.minH, Math.min(pb.z, wallBounds.maxH - pb.h));
  }
}

// ─── Layer Grouping, Weight-Sorting & Per-Layer Centering ────────────────────

interface PackingLayer {
  items: PlacedBox[];
  totalWeightOz: number;
  footprintArea: number;   // bounding L × W of all items in this layer
  layerHeight: number;     // max item height in this layer
  originalBaseZ: number;   // Z position from initial cursor placement
}

/**
 * Group placed items by their Z-level into PackingLayer objects.
 * Items sharing the same base Z value (within tolerance) belong to the same layer.
 */
function buildLayers(placed: PlacedBox[]): PackingLayer[] {
  if (placed.length === 0) return [];

  // ── Pre-pass: collapse isStacked items into their base-Z layer ──
  // Stacked items share the same x,y footprint but have incrementing Z values.
  // Group them by their footprint position and collapse into the lowest Z.
  const stackedItems = placed.filter(pb => pb.isStacked);
  const nonStackedItems = placed.filter(pb => !pb.isStacked);

  // Group stacked items by approximate x,y position
  const stackGroups = new Map<string, PlacedBox[]>();
  for (const pb of stackedItems) {
    const key = `${Math.round(pb.x * 100)}_${Math.round(pb.y * 100)}`;
    if (!stackGroups.has(key)) stackGroups.set(key, []);
    stackGroups.get(key)!.push(pb);
  }

  // For each stack group, determine the base Z and top Z
  // Keep as an array (not a Map keyed by baseZ) so multiple stack columns
  // with the same base Z are all preserved.
  const stackGroupsData: Array<{ baseZ: number; topZ: number; items: PlacedBox[] }> = [];
  for (const [, group] of stackGroups) {
    group.sort((a, b) => a.z - b.z);
    const baseZ = group[0].z;
    const topZ = Math.max(...group.map(it => it.z + it.h));
    stackGroupsData.push({ baseZ, topZ, items: group });
  }

  // Collect unique Z levels from NON-stacked items only
  const zLevels: number[] = [];
  for (const pb of nonStackedItems) {
    const existing = zLevels.find(z => Math.abs(z - pb.z) < 0.001);
    if (existing === undefined) {
      zLevels.push(pb.z);
    }
  }

  // Add base-Z of each stack group as a layer level
  for (const sg of stackGroupsData) {
    const existing = zLevels.find(z => Math.abs(z - sg.baseZ) < 0.001);
    if (existing === undefined) {
      zLevels.push(sg.baseZ);
    }
  }

  zLevels.sort((a, b) => a - b);

  // If no Z levels found (all items are stacked), ensure we have at least one
  if (zLevels.length === 0 && stackGroupsData.length > 0) {
    for (const sg of stackGroupsData) {
      zLevels.push(sg.baseZ);
    }
    zLevels.sort((a, b) => a - b);
  }

  return zLevels.map(baseZ => {
    // Get non-stacked items at this Z level
    const layerItems = nonStackedItems.filter(pb => Math.abs(pb.z - baseZ) < 0.001);

    // Add ALL stacked groups whose base matches this Z level (tolerance)
    const matchingStackGroups = stackGroupsData.filter(sg => Math.abs(sg.baseZ - baseZ) < 0.001);
    for (const sg of matchingStackGroups) {
      layerItems.push(...sg.items);
    }

    let totalWeight = 0;
    for (const pb of layerItems) {
      totalWeight += pb.weightOz;
    }

    // Layer height must be measured as vertical extent from this layer base Z,
    // not max individual item height, to preserve stacked columns correctly.
    const maxTopZ = layerItems.length > 0
      ? Math.max(...layerItems.map(pb => pb.z + pb.h))
      : baseZ;
    const layerHeight = Math.max(0, maxTopZ - baseZ);

    return {
      items: layerItems,
      totalWeightOz: totalWeight,
      footprintArea: (() => {
        // Stacked items at the same x,y position only contribute their footprint ONCE
        let fp = 0;
        const stackedPositions = new Set<string>();
        for (const pb of layerItems) {
          if (pb.isStacked) {
            const posKey = `${Math.round(pb.x * 100)}_${Math.round(pb.y * 100)}`;
            if (!stackedPositions.has(posKey)) {
              stackedPositions.add(posKey);
              fp += pb.l * pb.w;
            }
          } else {
            fp += pb.l * pb.w;
          }
        }
        return fp;
      })(),
      layerHeight,
      originalBaseZ: baseZ,
    };
  });
}

/**
 * Sort layers by total weight descending (heaviest at bottom), then restack
 * bottom-up reassigning Z positions. Returns the flat array of PlacedBox items
 * with updated Z coordinates.
 */
function sortAndRestackLayers(layers: PackingLayer[], binL: number, binW: number, binH: number): PlacedBox[] {
  if (layers.length <= 1) {
    return layers.flatMap(l => l.items);
  }

  // Sort for stability: largest footprint at bottom, smallest at top.
  // This creates a natural pyramid structure where dense, wide layers
  // support narrower ones above. Height is a secondary tiebreaker,
  // and weight is the final tiebreaker.
  layers.sort((a, b) => {
    if (b.footprintArea !== a.footprintArea) return b.footprintArea - a.footprintArea;
    if (Math.abs(b.layerHeight - a.layerHeight) > 0.01) return b.layerHeight - a.layerHeight;
    return b.totalWeightOz - a.totalWeightOz;
  });

  // Re-assign Z positions bottom-up
  let currentZ = 0;
  for (const layer of layers) {
    const oldBaseZ = layer.originalBaseZ;
    const deltaZ = currentZ - oldBaseZ;
    for (const pb of layer.items) {
      pb.z += deltaZ;
    }
    layer.originalBaseZ = currentZ;
    currentZ += layer.layerHeight;
  }

  return layers.flatMap(l => l.items);
}

/**
 * Same-SKU Vertical Consolidation
 *
 * For each layer with vertical headroom (gap between layer top and the ceiling
 * above — either the next layer's baseZ or binH), group non-stacked items by
 * base SKU.  When the headroom ≥ item height, stack identical items vertically
 * at fewer footprint positions, freeing floor space.  Iterates until no further
 * consolidation is possible.
 *
 * Mutates `placed` in-place and returns fresh layers.
 */
function consolidateSameSkuStacks(
  placed: PlacedBox[],
  binH: number,
): PlacedBox[] {
  // We may need multiple passes because consolidation changes layer structure
  for (let pass = 0; pass < 10; pass++) {
    const layers = buildLayers(placed);
    let changed = false;

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      // Ceiling for this layer = next layer's baseZ, or binH for topmost
      const ceilingZ =
        li < layers.length - 1 ? layers[li + 1].originalBaseZ : binH;
      const layerTopZ = layer.originalBaseZ + layer.layerHeight;
      const headroom = ceilingZ - layer.originalBaseZ; // total available height from base to ceiling

      // Find the tallest item/stack in this layer
      const maxItemTop = Math.max(...layer.items.map(pb => (pb.z + pb.h)));
      const tallestExtent = maxItemTop - layer.originalBaseZ;

      // Group non-stacked items by base SKU
      const skuGroups = new Map<string, PlacedBox[]>();
      for (const pb of layer.items) {
        if (pb.isStacked) continue; // leave always_ship_stacked items alone
        const baseSku = pb.itemId.replace(/-\d+$/, '');
        if (!skuGroups.has(baseSku)) skuGroups.set(baseSku, []);
        skuGroups.get(baseSku)!.push(pb);
      }

      for (const [sku, items] of skuGroups) {
        if (items.length <= 1) continue;

        const itemH = items[0].h;
        // Check: is there room above the shortest instance to stack another?
        // Use tallestExtent as the target height to fill up to
        const targetH = Math.min(tallestExtent, headroom);
        if (targetH - itemH < itemH) continue; // no room for even one more

        const stackCapacity = Math.floor(targetH / itemH);
        if (stackCapacity <= 1) continue;

        const columnsNeeded = Math.ceil(items.length / stackCapacity);
        if (columnsNeeded >= items.length) continue; // no savings

        console.log(`[BoxPack] SKU consolidation: ${sku} — ${items.length} items → ${columnsNeeded} columns of up to ${stackCapacity}`);

        // Sort items by position for deterministic column assignment
        items.sort((a, b) => a.x - b.x || a.y - b.y);

        // Keep the first `columnsNeeded` footprint positions, stack items there
        const keptPositions = items.slice(0, columnsNeeded);
        const removedItems = new Set<PlacedBox>();

        let assignIdx = 0;
        for (let col = 0; col < columnsNeeded; col++) {
          const anchor = keptPositions[col];
          // Items to stack at this column (anchor + extras)
          const columnItems: PlacedBox[] = [anchor];
          for (let i = columnsNeeded + assignIdx; i < items.length && columnItems.length < stackCapacity; i++) {
            columnItems.push(items[i]);
            assignIdx++;
          }

          // Assign Z positions stacking upward from layer base
          let zCursor = layer.originalBaseZ;
          for (const ci of columnItems) {
            ci.x = anchor.x;
            ci.y = anchor.y;
            ci.l = anchor.l;  // match anchor footprint orientation
            ci.w = anchor.w;  // match anchor footprint orientation
            ci.z = zCursor;
            ci.isStacked = true;
            zCursor += ci.h;
          }

          // Mark items beyond the anchor as removed from their original position
          for (let k = 1; k < columnItems.length; k++) {
            // They're already repositioned, just mark as changed
          }
        }

        // Remove any items that weren't assigned to any column
        // (shouldn't happen with correct math, but safety check)
        changed = true;
      }
    }

    if (!changed) break;

    // Rebuild placed array from layers (layers reference the same objects)
    // No need to rebuild — items are mutated in-place
  }

  return placed;
}

/**
 * Center each layer independently on L and W axes within wall-compensated bounds.
 * Z remains as assigned by sortAndRestackLayers (no vertical centering).
 * Mutates `placed` in-place.
 */
function centerLayersIndependently(
  placed: PlacedBox[],
  layers: PackingLayer[],
  wallBounds: WallOffsetsDims
): void {
  if (placed.length === 0) return;

  const usableL = wallBounds.maxL - wallBounds.minL;
  const usableW = wallBounds.maxW - wallBounds.minW;

  for (const layer of layers) {
    if (layer.items.length === 0) continue;

    // Compute centering offset based on PRIMARY (non-gap-fill) items only
    // so gap-fill items don't skew the bounding box and cause post-centering overlaps
    const primaryItems = layer.items.filter(pb => !pb.isGapFill);
    const referenceItems = primaryItems.length > 0 ? primaryItems : layer.items;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pb of referenceItems) {
      minX = Math.min(minX, pb.x);
      maxX = Math.max(maxX, pb.x + pb.l);
      minY = Math.min(minY, pb.y);
      maxY = Math.max(maxY, pb.y + pb.w);
    }

    const layerWidthL = maxX - minX;
    const layerWidthW = maxY - minY;

    const idealOffsetL = wallBounds.minL + (usableL - layerWidthL) / 2 - minX;
    const idealOffsetW = wallBounds.minW + (usableW - layerWidthW) / 2 - minY;

    // Compute legal offset interval for ALL items in the layer
    let legalMinOffsetL = -Infinity, legalMaxOffsetL = Infinity;
    let legalMinOffsetW = -Infinity, legalMaxOffsetW = Infinity;

    for (const pb of layer.items) {
      legalMinOffsetL = Math.max(legalMinOffsetL, wallBounds.minL - pb.x);
      legalMaxOffsetL = Math.min(legalMaxOffsetL, wallBounds.maxL - pb.x - pb.l);
      legalMinOffsetW = Math.max(legalMinOffsetW, wallBounds.minW - pb.y);
      legalMaxOffsetW = Math.min(legalMaxOffsetW, wallBounds.maxW - pb.y - pb.w);
    }

    // If legal interval is empty, skip centering for this layer
    if (legalMinOffsetL > legalMaxOffsetL || legalMinOffsetW > legalMaxOffsetW) {
      continue;
    }

    // Clamp ideal offset to legal interval once, then apply uniformly
    const clampedOffsetL = Math.max(legalMinOffsetL, Math.min(idealOffsetL, legalMaxOffsetL));
    const clampedOffsetW = Math.max(legalMinOffsetW, Math.min(idealOffsetW, legalMaxOffsetW));

    // Apply the SAME offset to ALL items to preserve relative geometry
    for (const pb of layer.items) {
      pb.x += clampedOffsetL;
      pb.y += clampedOffsetW;
    }
  }
}

// ─── Floating Item Support Constraint ────────────────────────────────────────

/**
 * Compute the support ratio for a single item: what fraction of its bottom
 * footprint is supported by items directly below it.
 */
function computeSupportRatio(
  item: PlacedBox,
  allPlaced: PlacedBox[],
  itemIndex: number
): number {
  const itemFootprint = item.l * item.w;
  if (itemFootprint < 0.001) return 1;

  // Floor items are fully supported
  if (item.z < 0.01) return 1;

  let totalSupport = 0;
  for (let j = 0; j < allPlaced.length; j++) {
    if (j === itemIndex) continue;
    const below = allPlaced[j];
    // Check if the top of `below` is within tolerance of the bottom of `item`
    const belowTop = below.z + below.h;
    if (Math.abs(belowTop - item.z) > 0.05) continue;

    // Compute 2D XY intersection area
    const overlapL = Math.min(item.x + item.l, below.x + below.l) - Math.max(item.x, below.x);
    const overlapW = Math.min(item.y + item.w, below.y + below.w) - Math.max(item.y, below.y);
    if (overlapL > 0 && overlapW > 0) {
      totalSupport += overlapL * overlapW;
    }
  }

  return totalSupport / itemFootprint;
}

/**
 * Validate that all items above the floor have at least `minSupportRatio` of
 * their bottom footprint supported by items directly below them.
 * Returns indices of "floating" items that fail the check.
 * Stacked items sharing the same X/Y column are exempt.
 */
function validateSupportConstraint(
  placed: PlacedBox[],
  wallBounds: WallOffsetsDims,
  minSupportRatio: number = 0.75
): number[] {
  const floatingIndices: number[] = [];

  for (let i = 0; i < placed.length; i++) {
    const item = placed[i];
    // Floor items are always supported
    if (item.z < 0.01) continue;

    // Stacked items sharing the same X/Y column are exempt
    if (item.isStacked) {
      const hasSameColumnBelow = placed.some((other, j) =>
        j !== i && other.isStacked &&
        Math.abs(other.x - item.x) < 0.01 &&
        Math.abs(other.y - item.y) < 0.01 &&
        other.z < item.z
      );
      if (hasSameColumnBelow) continue;
    }

    const ratio = computeSupportRatio(item, placed, i);
    if (ratio < minSupportRatio) {
      floatingIndices.push(i);
    }
  }

  return floatingIndices;
}

// ─── Main Packing Function (6-Step Pipeline) ────────────────────────────────

/**
 * Pack items into a specific box using the 6-step validation pipeline:
 * 
 * 1. VOLUME CHECK - total constraint volume must fit in box
 * 2. BOUNDARY CHECK - each item's flat-sorted dims must fit in box's sorted dims
 * 3. PLACEMENT - layer stacking with flat orientation and L/W rotation
 * 4. WEIGHT CHECK - items + box tare + paper fill must not exceed max_weight_oz
 * 5. CENTER CLUSTER - center items on L/W axes, sit on bottom
 * 6. ACCEPT - return result
 */
export function packItemsInBox(
  items: PackableItem[],
  box: BoxSize,
  options: PackingOptions,
  allowPartialBoundary: boolean = false
): PackingResult {
  const paperWeightOzPerFoot = options.paperWeightOzPerFoot;
  const paperCostPerFoot = options.paperCostPerFoot;
  const paperShippingMultiplier = options.paperShippingCostMultiplier;
  const paperCubicInchesPerInch = options.paperCubicInchesPerInch;
  
  const boxVolume = box.dimension_l * box.dimension_w * box.dimension_h;
  const boxWeightOz = box.weight_oz ?? 0;
  const boxMultiplier = box.shipping_cost_multiplier ?? 1.0;
  const boxCost = (box.cost_per_box ?? 0) * boxMultiplier;
  
  // ── Precompute: Build expanded items with flat-sorted constraint dims ──
  const shapeItems = items.map(toShapeItem);
  const wallOffsets = getWallPaddingOffsets(shapeItems);
  const effectiveBinL = box.dimension_l - wallOffsets.lengthLeft - wallOffsets.lengthRight;
  const effectiveBinW = box.dimension_w - wallOffsets.widthFront - wallOffsets.widthBack;
  const effectiveBinH = box.dimension_h;
  
  console.log(`[BoxPack] ${box.name}: Raw dims [${box.dimension_l}, ${box.dimension_w}, ${box.dimension_h}] → Effective [${effectiveBinL.toFixed(2)}, ${effectiveBinW.toFixed(2)}, ${effectiveBinH.toFixed(2)}] (wall offsets: L=${wallOffsets.lengthLeft.toFixed(2)}+${wallOffsets.lengthRight.toFixed(2)}, W=${wallOffsets.widthFront.toFixed(2)}+${wallOffsets.widthBack.toFixed(2)}, H=0.00+0.00)`);
  
  const totalItemWeightOz = items.reduce((sum, i) => sum + i.weight_oz * i.quantity, 0);
  
  // If wall offsets make bin too small, reject immediately
  if (effectiveBinL <= 0 || effectiveBinW <= 0 || effectiveBinH <= 0) {
    return createEmptyResult(box, totalItemWeightOz, boxWeightOz, boxCost);
  }
  
  let itemActualVolume = 0;
  let itemConstraintVolume = 0;
  
  let expandedItems: ExpandedItem[] = [];
  
  for (const item of items) {
    const shapeItem = toShapeItem(item);
    const constraintDims = getSharedPaddingConstraintDimensions(shapeItem);
    const constraintL = constraintDims.length || item.packed_dimension_l;
    const constraintW = constraintDims.width || item.packed_dimension_w;
    const constraintH = constraintDims.height || item.packed_dimension_h;
    
    const singleConstraintVolume = constraintL * constraintW * constraintH;
    const singleActualVolume = getEffectiveVolume(shapeItem);
    
    itemActualVolume += singleActualVolume * item.quantity;
    
    // Sort constraint dims descending: L >= W >= H (flat orientation, rule 4)
    const sortedConstraint = [constraintL, constraintW, constraintH].sort((a, b) => b - a);
    const flatL = sortedConstraint[0];
    const flatW = sortedConstraint[1];
    const flatH = sortedConstraint[2];
    
    itemConstraintVolume += singleConstraintVolume * item.quantity;
    
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({
        l: flatL,
        w: flatW,
        h: flatH,
        origL: item.packed_dimension_l,
        origW: item.packed_dimension_w,
        origH: item.packed_dimension_h,
        id: `${item.id}-${i}`,
        originalId: item.id,
        volume: singleConstraintVolume,
        actualVolume: singleActualVolume,
        packedShape: item.packed_shape || 'box',
        weightOz: item.weight_oz,
        alwaysStacked: item.always_ship_stacked ?? false,
        maxStackQty: item.max_stack_quantity ?? null,
      });
    }
  }

  // ── WEDGE PAIRING PRE-PROCESSING ──
  // Pair triangular_prism items with matching constraint dims into rectangular blocks
  {
    const wedgesByDims = new Map<string, number[]>();
    expandedItems.forEach((ei, idx) => {
      if (ei.packedShape === 'triangular_prism') {
        const key = `${ei.l},${ei.w},${ei.h}`;
        if (!wedgesByDims.has(key)) wedgesByDims.set(key, []);
        wedgesByDims.get(key)!.push(idx);
      }
    });

    const indicesToRemove = new Set<number>();
    const pairedToInsert: ExpandedItem[] = [];

    for (const [, indices] of wedgesByDims) {
      for (let p = 0; p + 1 < indices.length; p += 2) {
        const a = expandedItems[indices[p]];
        const b = expandedItems[indices[p + 1]];
        pairedToInsert.push({
          l: a.l,
          w: a.w,
          h: a.h,
          origL: a.origL,
          origW: a.origW,
          origH: a.origH,
          id: `${a.id}__paired__${b.id}`,
          originalId: a.originalId,
          volume: a.l * a.w * a.h,
          actualVolume: a.actualVolume + b.actualVolume,
          packedShape: 'box',
          weightOz: a.weightOz + b.weightOz,
          alwaysStacked: a.alwaysStacked || b.alwaysStacked,
          maxStackQty: a.maxStackQty != null && b.maxStackQty != null
            ? Math.min(a.maxStackQty, b.maxStackQty)
            : a.maxStackQty ?? b.maxStackQty,
          isPairedWedge: true,
          pairedItemIds: [a.id, b.id],
          pairedOriginalIds: [a.originalId, b.originalId],
        });
        indicesToRemove.add(indices[p]);
        indicesToRemove.add(indices[p + 1]);
      }
    }

    if (indicesToRemove.size > 0) {
      // Rebuild expandedItems: keep unpaired, add paired
      const kept = expandedItems.filter((_, i) => !indicesToRemove.has(i));
      expandedItems = [...kept, ...pairedToInsert];

      // Recalculate volume totals
      itemActualVolume = expandedItems.reduce((s, e) => s + e.actualVolume, 0);
      itemConstraintVolume = expandedItems.reduce((s, e) => s + e.volume, 0);
    }
    console.log(`[WedgePair] Paired ${indicesToRemove.size / 2} wedge pairs, ${expandedItems.filter(e => e.isPairedWedge).length} paired items, ${expandedItems.filter(e => e.packedShape === 'triangular_prism').length} solo wedges remaining`);
  }
  
  // ── STEP 1: VOLUME CHECK ──
  // Total constraint volume must fit within box volume (skip in partial mode)
  if (!allowPartialBoundary && itemConstraintVolume > boxVolume + 0.001) {
    console.log(`[BoxPack] ${box.name}: REJECTED (volume check) — items ${itemConstraintVolume.toFixed(1)} > box ${boxVolume.toFixed(1)}`);
    return createEmptyResult(box, totalItemWeightOz, boxWeightOz, boxCost);
  }
  
  // ── STEP 2: BOUNDARY CHECK ──
  // Each item's flat-sorted constraint dims must fit within the effective bin's sorted dims
  const boxDimsSorted: [number, number, number] = [effectiveBinL, effectiveBinW, effectiveBinH].sort((a, b) => b - a) as [number, number, number];
  
  // Capture pre-filter count so allItemsFit reflects items dropped by partial boundary
  const totalExpandedCount = expandedItems.length;
  
  if (allowPartialBoundary) {
    // Filter out items that violate boundary, keep only those that fit
    const filteredItems: typeof expandedItems = [];
    for (const ei of expandedItems) {
      const eiDims: [number, number, number] = [ei.l, ei.w, ei.h].sort((a, b) => b - a) as [number, number, number];
      if (canItemFitInBox(eiDims, boxDimsSorted)) {
        filteredItems.push(ei);
      } else {
        console.log(`[BoxPack] ${box.name}: Filtering out item ${ei.id} (boundary violation: [${eiDims.join(',')}] > [${boxDimsSorted.join(',')}])`);
      }
    }
    if (filteredItems.length === 0) {
      console.log(`[BoxPack] ${box.name}: REJECTED (no items fit boundary in partial mode)`);
      return createEmptyResult(box, totalItemWeightOz, boxWeightOz, boxCost);
    }
    // Replace expandedItems with only the fitting ones for placement
    expandedItems = filteredItems;
  } else {
    if (!allItemsFitBoundary(expandedItems, effectiveBinL, effectiveBinW, effectiveBinH)) {
      console.log(`[BoxPack] ${box.name}: REJECTED (boundary check) — effective bin [${effectiveBinL.toFixed(2)}, ${effectiveBinW.toFixed(2)}, ${effectiveBinH.toFixed(2)}]`);
      return createEmptyResult(box, totalItemWeightOz, boxWeightOz, boxCost);
    }
  }
  
  // ── STEP 3: PLACEMENT (multi-strategy layer stacking) ──
  let placedBoxes = packWithBestStrategy(
    expandedItems,
    effectiveBinL,
    effectiveBinW,
    effectiveBinH
  );
  
  // ── STEP 3b: BUILD LAYERS (no reordering — preserve placement sequence) ──
  const layers = buildLayers(placedBoxes);

  // ── STEP 5: CENTER EACH LAYER INDEPENDENTLY ──
  const wallBounds = {
    minL: wallOffsets.lengthLeft,
    maxL: box.dimension_l - wallOffsets.lengthRight,
    minW: wallOffsets.widthFront,
    maxW: box.dimension_w - wallOffsets.widthBack,
    minH: 0,
    maxH: box.dimension_h,
  };
  centerLayersIndependently(placedBoxes, layers, wallBounds);
  
  // ── SAFETY PASS: Detect and resolve any remaining overlaps ──
  const postCenterViolations = detectLayerOverlaps(placedBoxes);
  if (postCenterViolations.length > 0) {
    console.warn(`[BoxPack] ${box.name}: ${postCenterViolations.length} overlap violation(s) detected after centering — resolving`);
    resolveLayerOverlaps(placedBoxes, effectiveBinL, effectiveBinW, effectiveBinH, wallBounds);
  }

  // Z-floor alignment removed: items stay at Z=0 as placed by the layer algorithm.
  // Bottom padding is already modeled by reducing effectiveBinH.

  // ── FLOATING ITEM VALIDATION: strip items without 75% footprint support ──
  if (allowPartialBoundary && placedBoxes.length > 0) {
    let floatingStripIter = 0;
    const maxFloatingIters = 20;
    while (floatingStripIter < maxFloatingIters) {
      const floatingIndices = validateSupportConstraint(placedBoxes, wallBounds);
      if (floatingIndices.length === 0) break;
      floatingStripIter++;

      // Sort floating items by strip priority: smallest footprint, non-stacked, lighter
      floatingIndices.sort((a, b) => {
        const fpA = placedBoxes[a].l * placedBoxes[a].w;
        const fpB = placedBoxes[b].l * placedBoxes[b].w;
        if (Math.abs(fpA - fpB) > 0.01) return fpA - fpB;
        const stackA = placedBoxes[a].isStacked ? 1 : 0;
        const stackB = placedBoxes[b].isStacked ? 1 : 0;
        if (stackA !== stackB) return stackA - stackB;
        return (placedBoxes[a].weightOz || 0) - (placedBoxes[b].weightOz || 0);
      });

      const removeIdx = floatingIndices[0];
      const item = placedBoxes[removeIdx];
      const supportRatio = computeSupportRatio(item, placedBoxes, removeIdx);
      console.warn(
        `[BoxPack] ${box.name}: Floating strip iter ${floatingStripIter} — removing: ` +
        `${item.itemId} (support: ${(supportRatio * 100).toFixed(1)}%, ` +
        `footprint: ${(item.l * item.w).toFixed(2)} sq in)`
      );
      placedBoxes = placedBoxes.filter((_, i) => i !== removeIdx);
    }
  }

  // ── HARD PHYSICS VALIDATION: reject if ANY overlaps or boundary violations remain ──
  const finalViolations = detectLayerOverlaps(placedBoxes);
  const boundaryViolations = placedBoxes.filter(pb =>
    pb.x < wallBounds.minL - 0.01 || pb.x + pb.l > wallBounds.maxL + 0.01 ||
    pb.y < wallBounds.minW - 0.01 || pb.y + pb.w > wallBounds.maxW + 0.01 ||
    pb.z < wallBounds.minH - 0.01 || pb.z + pb.h > wallBounds.maxH + 0.01
  );

  if (finalViolations.length > 0 || boundaryViolations.length > 0) {
    console.error(`[BoxPack] ${box.name}: HARD PHYSICS FAIL — ${finalViolations.length} overlaps, ${boundaryViolations.length} boundary violations.`);
    if (!allowPartialBoundary) {
      return createEmptyResult(box, totalItemWeightOz, boxWeightOz, boxCost);
    }
    // Partial mode: iteratively strip smallest-footprint violator until clean
    let stripIter = 0;
    const maxStripIters = 20;
    while (stripIter < maxStripIters) {
      stripIter++;
      const currentOverlaps = detectLayerOverlaps(placedBoxes);
      const violatingIndices = new Set<number>();

      // Collect overlap violators
      for (const v of currentOverlaps) {
        violatingIndices.add(v.indexA);
        violatingIndices.add(v.indexB);
      }

      // Collect boundary violators
      for (let i = 0; i < placedBoxes.length; i++) {
        const pb = placedBoxes[i];
        if (pb.x < wallBounds.minL - 0.01 || pb.x + pb.l > wallBounds.maxL + 0.01 ||
            pb.y < wallBounds.minW - 0.01 || pb.y + pb.w > wallBounds.maxW + 0.01 ||
            pb.z < wallBounds.minH - 0.01 || pb.z + pb.h > wallBounds.maxH + 0.01) {
          violatingIndices.add(i);
        }
      }

      if (violatingIndices.size === 0) break; // Clean

      // Sort violators: smallest footprint first, non-stacked before stacked, lighter first
      const sortedViolators = Array.from(violatingIndices).sort((a, b) => {
        // 1. Smallest footprint first
        const fpA = placedBoxes[a].l * placedBoxes[a].w;
        const fpB = placedBoxes[b].l * placedBoxes[b].w;
        if (Math.abs(fpA - fpB) > 0.01) return fpA - fpB;
        // 2. Non-stacked before stacked (protect stacks)
        const stackA = placedBoxes[a].isStacked ? 1 : 0;
        const stackB = placedBoxes[b].isStacked ? 1 : 0;
        if (stackA !== stackB) return stackA - stackB;
        // 3. Lighter items first
        return (placedBoxes[a].weightOz || 0) - (placedBoxes[b].weightOz || 0);
      });

      // Strip only the single highest-priority violator
      const removeIdx = sortedViolators[0];
      const removedItem = placedBoxes[removeIdx];
      console.warn(
        `[BoxPack] ${box.name}: Strip iter ${stripIter} — removing: ` +
        `${removedItem.itemId} (footprint: ${(removedItem.l * removedItem.w).toFixed(2)} sq in, ` +
        `stacked: ${!!removedItem.isStacked}, weight: ${(removedItem.weightOz || 0).toFixed(1)} oz)`
      );
      placedBoxes = placedBoxes.filter((_, i) => i !== removeIdx);
    }

    if (stripIter >= maxStripIters) {
      const residualOverlaps = detectLayerOverlaps(placedBoxes);
      if (residualOverlaps.length > 0) {
        console.error(`[BoxPack] ${box.name}: Could not sanitize after ${maxStripIters} iterations — returning empty`);
        placedBoxes = [];
      }
    }
  }

  // Single summary diagnostic — fires after all processing
  console.warn(`[BoxPack] FINAL RESULT for ${box.name}:`,
    placedBoxes.map(pb => ({
      id: pb.itemId,
      pos: `(${pb.x.toFixed(1)},${pb.y.toFixed(1)},${pb.z.toFixed(2)})`,
      dims: `${pb.l.toFixed(1)}x${pb.w.toFixed(1)}x${pb.h.toFixed(2)}`
    }))
  );

  const allItemsFit = placedBoxes.length === totalExpandedCount;
  
  console.log(`[BoxPack] ${box.name}: Placement result — ${placedBoxes.length}/${totalExpandedCount} items placed (expandedItems after filter: ${expandedItems.length}), allItemsFit=${allItemsFit}`);
  
  // If not all items fit spatially, this box fails
  if (!allItemsFit) {
    // Return partial result for multi-box scenarios
    const partialResult = buildPackingResult(
      box, placedBoxes, expandedItems, items,
      itemActualVolume, itemConstraintVolume, totalItemWeightOz,
      boxVolume, boxWeightOz, boxCost,
      paperWeightOzPerFoot, paperCostPerFoot, paperShippingMultiplier,
      paperCubicInchesPerInch, wallOffsets, false
    );
    return partialResult;
  }
  
  // ── STEP 4: WEIGHT CHECK ──
  const voidVolume = Math.max(0, boxVolume - itemActualVolume);
  const paperFillInches = Math.max(0, voidVolume / paperCubicInchesPerInch);
  const paperFillFeet = paperFillInches / 12;
  const paperWeightOz = paperFillFeet * paperWeightOzPerFoot;
  const totalPackageWeightOz = totalItemWeightOz + boxWeightOz + paperWeightOz;
  const weightOk = box.max_weight_oz === null || totalPackageWeightOz <= box.max_weight_oz;
  
  if (!weightOk) {
    // Weight exceeds limit - return result with weightOk: false
    return buildPackingResult(
      box, placedBoxes, expandedItems, items,
      itemActualVolume, itemConstraintVolume, totalItemWeightOz,
      boxVolume, boxWeightOz, boxCost,
      paperWeightOzPerFoot, paperCostPerFoot, paperShippingMultiplier,
      paperCubicInchesPerInch, wallOffsets, true
    );
  }
  
  // ── STEP 6: ACCEPT ──
  return buildPackingResult(
    box, placedBoxes, expandedItems, items,
    itemActualVolume, itemConstraintVolume, totalItemWeightOz,
    boxVolume, boxWeightOz, boxCost,
    paperWeightOzPerFoot, paperCostPerFoot, paperShippingMultiplier,
    paperCubicInchesPerInch, wallOffsets, true
  );
}

/**
 * Build a PackingResult from placed items and calculated values.
 */
function buildPackingResult(
  box: BoxSize,
  placedBoxes: PlacedBox[],
  expandedItems: ExpandedItem[],
  originalItems: PackableItem[],
  itemActualVolume: number,
  itemConstraintVolume: number,
  totalItemWeightOz: number,
  boxVolume: number,
  boxWeightOz: number,
  boxCost: number,
  paperWeightOzPerFoot: number,
  paperCostPerFoot: number,
  paperShippingMultiplier: number,
  paperCubicInchesPerInch: number,
  wallOffsets: ReturnType<typeof getWallPaddingOffsets>,
  allPlaced: boolean
): PackingResult {
  // Unpack paired wedge items back into two PackedItemPosition entries
  const packedItems: PackedItemPosition[] = [];
  for (const pb of placedBoxes) {
    if (pb.itemId.includes('__paired__')) {
      const expanded = expandedItems.find(e => e.id === pb.itemId);
      const ids = expanded?.pairedItemIds ?? pb.itemId.split('__paired__');
      const origIds = expanded?.pairedOriginalIds ?? ids.map(id => id.replace(/-\d+$/, ''));
      // First wedge — normal orientation
      packedItems.push({
        itemId: ids[0],
        x: pb.x, y: pb.y, z: pb.z,
        finalL: pb.l, finalW: pb.w, finalH: pb.h,
        originalL: pb.origL, originalW: pb.origW, originalH: pb.origH,
        rotationIndex: pb.rotationIndex,
        packedShape: 'triangular_prism',
        isStacked: pb.isStacked,
        pairedMirror: false,
      });
      // Second wedge — mirrored orientation
      packedItems.push({
        itemId: ids[1],
        x: pb.x, y: pb.y, z: pb.z,
        finalL: pb.l, finalW: pb.w, finalH: pb.h,
        originalL: pb.origL, originalW: pb.origW, originalH: pb.origH,
        rotationIndex: pb.rotationIndex,
        packedShape: 'triangular_prism',
        isStacked: pb.isStacked,
        pairedMirror: true,
      });
    } else {
      packedItems.push({
        itemId: pb.itemId,
        x: pb.x, y: pb.y, z: pb.z,
        finalL: pb.l, finalW: pb.w, finalH: pb.h,
        originalL: pb.origL, originalW: pb.origW, originalH: pb.origH,
        rotationIndex: pb.rotationIndex,
        packedShape: pb.packedShape,
        isStacked: pb.isStacked,
      });
    }
  }

  const pairedCount = packedItems.filter(p => p.pairedMirror !== undefined).length;
  if (pairedCount > 0) console.log(`[WedgePair] Unpacked ${pairedCount / 2} pairs into ${pairedCount} wedge positions`);
  
  const packedItemIds = [...new Set(packedItems.map(pi => {
    const expanded = expandedItems.find(e => e.id === pi.itemId);
    if (expanded) return expanded.originalId;
    // Check if it was part of a paired item
    const pairedExp = expandedItems.find(e => e.pairedItemIds?.includes(pi.itemId));
    if (pairedExp) {
      const idx = pairedExp.pairedItemIds!.indexOf(pi.itemId);
      return pairedExp.pairedOriginalIds?.[idx] ?? pi.itemId.replace(/-\d+$/, '');
    }
    return pi.itemId.replace(/-\d+$/, '');
  }))];
  
  const allItemsFit = allPlaced && placedBoxes.length === expandedItems.length;
  
  const packedActualVolume = allItemsFit
    ? itemActualVolume
    : placedBoxes.reduce((sum, pb) => sum + pb.actualVolume, 0);
  const packedConstraintVolume = allItemsFit
    ? itemConstraintVolume
    : placedBoxes.reduce((sum, pb) => sum + (pb.l * pb.w * pb.h), 0);
  const packedItemWeightOz = allItemsFit
    ? totalItemWeightOz
    : placedBoxes.reduce((sum, pb) => {
        const expanded = expandedItems.find(e => e.id === pb.itemId);
        const origItem = expanded ? originalItems.find(it => it.id === expanded.originalId) : null;
        return sum + (origItem?.weight_oz ?? 0);
      }, 0);
  
  const voidVolume = Math.max(0, boxVolume - packedActualVolume);
  const paperFillInches = Math.max(0, voidVolume / paperCubicInchesPerInch);
  const paperFillFeet = paperFillInches / 12;
  const paperWeightOz = paperFillFeet * paperWeightOzPerFoot;
  const paperCost = paperFillFeet * paperCostPerFoot * paperShippingMultiplier;
  const totalPackageWeightOz = packedItemWeightOz + boxWeightOz + paperWeightOz;
  const fillPercentage = boxVolume > 0 ? (packedActualVolume / boxVolume) * 100 : 0;
  const totalMaterialCost = boxCost + paperCost;
  const weightOk = box.max_weight_oz === null || totalPackageWeightOz <= box.max_weight_oz;
  


  return {
    box,
    packedItems,
    itemVolume: packedActualVolume,
    boxVolume,
    voidVolume,
    fillPercentage,
    paperFillInches,
    paperFillFeet,
    paperWeightOz,
    totalItemWeightOz,
    boxWeightOz,
    totalPackageWeightOz,
    boxCost,
    paperCost,
    totalMaterialCost,
    allItemsFit,
    weightOk,
    noBoxAvailable: false,
    minimumRequiredDimensions: null,
    packedItemIds,
  };
}

/**
 * Helper to create an empty/failed packing result
 */
function createEmptyResult(box: BoxSize, totalItemWeightOz: number, boxWeightOz: number, boxCost: number): PackingResult {
  return {
    box,
    packedItems: [],
    itemVolume: 0,
    boxVolume: box.dimension_l * box.dimension_w * box.dimension_h,
    voidVolume: 0,
    fillPercentage: 0,
    paperFillInches: 0,
    paperFillFeet: 0,
    paperWeightOz: 0,
    totalItemWeightOz,
    boxWeightOz,
    totalPackageWeightOz: totalItemWeightOz + boxWeightOz,
    boxCost,
    paperCost: 0,
    totalMaterialCost: boxCost,
    allItemsFit: false,
    weightOk: false,
    noBoxAvailable: false,
    minimumRequiredDimensions: null,
  };
}


/**
 * Get the largest face area (L × W) from an item's constraint dims.
 * Constraint dims are sorted descending, so dims[0]*dims[1] is the largest face.
 */
function getItemLargestFace(item: PackableItem): { baseL: number; baseW: number; area: number } {
  const shapeItem = toShapeItem(item);
  const cd = getSharedPaddingConstraintDimensions(shapeItem);
  const cL = cd.length || item.packed_dimension_l;
  const cW = cd.width || item.packed_dimension_w;
  const cH = cd.height || item.packed_dimension_h;
  const sorted = [cL, cW, cH].sort((a, b) => b - a);
  return { baseL: sorted[0], baseW: sorted[1], area: sorted[0] * sorted[1] };
}

/**
 * Scan all items (expanded by quantity) and return the largest required base dims.
 */
function getOrderLargestBase(items: PackableItem[]): { baseL: number; baseW: number } {
  let maxBaseL = 0;
  let maxBaseW = 0;
  for (const item of items) {
    const face = getItemLargestFace(item);
    // We need a box whose base can accommodate EACH item individually,
    // so track the max of each dimension independently
    if (face.baseL > maxBaseL) maxBaseL = face.baseL;
    if (face.baseW > maxBaseW) maxBaseW = face.baseW;
  }
  return { baseL: maxBaseL, baseW: maxBaseW };
}

/**
 * Check if a box's base (its two largest dims) can accommodate the required base dims.
 */
function boxBaseAccommodates(box: BoxSize, requiredBaseL: number, requiredBaseW: number): boolean {
  const boxDims = [box.dimension_l, box.dimension_w, box.dimension_h].sort((a, b) => b - a);
  // Box base is the two largest dims
  return boxDims[0] >= requiredBaseL && boxDims[1] >= requiredBaseW;
}

/**
 * Sort boxes: base-area-first (smallest qualifying base first), volume as tiebreaker.
 * Boxes that don't accommodate the required base are filtered out.
 */
function sortBoxesByBaseArea(boxes: BoxSize[], requiredBaseL: number, requiredBaseW: number): BoxSize[] {
  const qualifying = boxes.filter(b => boxBaseAccommodates(b, requiredBaseL, requiredBaseW));
  return qualifying.sort((a, b) => {
    const aDims = [a.dimension_l, a.dimension_w, a.dimension_h].sort((x, y) => y - x);
    const bDims = [b.dimension_l, b.dimension_w, b.dimension_h].sort((x, y) => y - x);
    const aBaseArea = aDims[0] * aDims[1];
    const bBaseArea = bDims[0] * bDims[1];
    if (aBaseArea !== bBaseArea) return aBaseArea - bBaseArea;
    // Tiebreaker: volume
    return (a.dimension_l * a.dimension_w * a.dimension_h) - (b.dimension_l * b.dimension_w * b.dimension_h);
  });
}

/**
 * Find the optimal box for the given items.
 * 
 * Base-area-first algorithm:
 * 1. Find the largest item face area (constraint dims L×W)
 * 2. Filter boxes whose base accommodates that face
 * 3. Sort qualifying boxes by base area (smallest first), volume tiebreaker
 * 4. First box passing the 6-step pipeline wins
 * 5. If no qualifying box works, fall back to all boxes sorted by volume
 */
export function findOptimalBox(
  items: PackableItem[],
  boxes: BoxSize[],
  options: PackingOptions
): PackingResult {
  const activeBoxes = boxes.filter(b => b.is_active);
  
  if (activeBoxes.length === 0) {
    const totalItemWeightOz = items.reduce((sum, i) => sum + i.weight_oz * i.quantity, 0);
    return {
      box: null,
      packedItems: [],
      itemVolume: 0,
      boxVolume: 0,
      voidVolume: 0,
      fillPercentage: 0,
      paperFillInches: 0,
      paperFillFeet: 0,
      paperWeightOz: 0,
      totalItemWeightOz,
      boxWeightOz: 0,
      totalPackageWeightOz: totalItemWeightOz,
      boxCost: 0,
      paperCost: 0,
      totalMaterialCost: 0,
      allItemsFit: false,
      weightOk: false,
      noBoxAvailable: true,
      minimumRequiredDimensions: calculateMinimumBoundingBox(items),
    };
  }
  
  // Sort ALL boxes by volume ascending (smallest first)
  const boxesByVolume = [...activeBoxes].sort((a, b) => {
    const volA = a.dimension_l * a.dimension_w * a.dimension_h;
    const volB = b.dimension_l * b.dimension_w * b.dimension_h;
    return volA - volB;
  });
  
  console.log(`[BoxPack] Trying ${boxesByVolume.length} boxes in volume-ascending order`);
  
  // Pass 1: Find smallest box where ALL items fit
  let bestResult: PackingResult | null = null;
  
  for (const box of boxesByVolume) {
    console.log(`[BoxPack] Trying ${box.name} (${box.dimension_l}×${box.dimension_w}×${box.dimension_h})`);
    const result = packItemsInBox(items, box, options);
    
    if (result.allItemsFit && result.weightOk) {
      return result; // Smallest volume box that fits everything wins
    }
    
    // Track best partial result
    if (!bestResult || result.packedItems.length > bestResult.packedItems.length) {
      bestResult = result;
    }
  }
  
  if (bestResult) {
    return {
      ...bestResult,
      minimumRequiredDimensions: calculateMinimumBoundingBox(items),
    };
  }
  
  const totalItemWeightOz = items.reduce((sum, i) => sum + i.weight_oz * i.quantity, 0);
  return {
    box: null,
    packedItems: [],
    itemVolume: 0,
    boxVolume: 0,
    voidVolume: 0,
    fillPercentage: 0,
    paperFillInches: 0,
    paperFillFeet: 0,
    paperWeightOz: 0,
    totalItemWeightOz,
    boxWeightOz: 0,
    totalPackageWeightOz: totalItemWeightOz,
    boxCost: 0,
    paperCost: 0,
    totalMaterialCost: 0,
    allItemsFit: false,
    weightOk: false,
    noBoxAvailable: true,
    minimumRequiredDimensions: calculateMinimumBoundingBox(items),
  };
}

/**
 * Get all valid box options for items (sorted by efficiency)
 */
export function getAllBoxOptions(
  items: PackableItem[],
  boxes: BoxSize[],
  options: PackingOptions
): PackingResult[] {
  const activeBoxes = boxes.filter(b => b.is_active);
  const results: PackingResult[] = [];
  
  for (const box of activeBoxes) {
    const result = packItemsInBox(items, box, options);
    if (result.allItemsFit && result.weightOk) {
      results.push(result);
    }
  }
  
  // Sort by fill percentage (highest first = most efficient)
  return results.sort((a, b) => b.fillPercentage - a.fillPercentage);
}

/**
 * Main entry point for box recommendation
 */
export function getBoxRecommendation(
  items: PackableItem[],
  boxes: BoxSize[],
  options: PackingOptions
): BoxRecommendation {
  // Check for items missing dimensions
  const itemsMissingDimensions = items
    .filter(item => 
      !item.packed_dimension_l || 
      !item.packed_dimension_w || 
      !item.packed_dimension_h
    )
    .map(item => item.name);
  
  // Filter to items with valid dimensions
  const validItems = items.filter(item => 
    item.packed_dimension_l > 0 && 
    item.packed_dimension_w > 0 && 
    item.packed_dimension_h > 0
  );
  
  if (validItems.length === 0) {
    return {
      primary: {
        box: null,
        packedItems: [],
        itemVolume: 0,
        boxVolume: 0,
        voidVolume: 0,
        fillPercentage: 0,
        paperFillInches: 0,
        paperFillFeet: 0,
        paperWeightOz: 0,
        totalItemWeightOz: 0,
        boxWeightOz: 0,
        totalPackageWeightOz: 0,
        boxCost: 0,
        paperCost: 0,
        totalMaterialCost: 0,
        allItemsFit: false,
        weightOk: false,
        noBoxAvailable: true,
        minimumRequiredDimensions: null,
      },
      alternatives: [],
      itemsMissingDimensions,
    };
  }
  
  // Find optimal box
  const primary = findOptimalBox(validItems, boxes, options);
  
  // Get alternatives (other valid boxes, sorted by efficiency)
  const allOptions = getAllBoxOptions(validItems, boxes, options);
  const alternatives = allOptions.filter(opt => opt.box?.id !== primary.box?.id).slice(0, 3);
  
  return {
    primary,
    alternatives,
    itemsMissingDimensions,
  };
}

/**
 * Calculate remaining items after a packing result, without mutating state.
 * Handles unit-index suffixes (-N) and paired item IDs (__paired__).
 */
function getRemainingItems(
  currentItems: PackableItem[],
  packedPositions: PackedItemPosition[]
): PackableItem[] {
  const packedQuantities = new Map<string, number>();
  for (const pos of packedPositions) {
    // Strip unit index (-N suffix) to get back to original item ID
    const originalId = pos.itemId.replace(/-\d+$/, '');
    packedQuantities.set(originalId, (packedQuantities.get(originalId) || 0) + 1);
  }
  return currentItems.reduce<PackableItem[]>((acc, item) => {
    const packed = packedQuantities.get(item.id) || 0;
    const remaining = item.quantity - packed;
    if (remaining > 0) acc.push({ ...item, quantity: remaining });
    return acc;
  }, []);
}

/**
 * Pack items across multiple boxes when they don't fit in a single box
 */
export function packItemsMultiBox(
  items: PackableItem[],
  boxes: BoxSize[],
  options: PackingOptions
): MultiBoxPackingResult {
  // Check for items missing dimensions
  const itemsMissingDimensions = items
    .filter(item => 
      !item.packed_dimension_l || 
      !item.packed_dimension_w || 
      !item.packed_dimension_h
    )
    .map(item => item.name);
  
  // Filter to items with valid dimensions
  const validItems = items.filter(item => 
    item.packed_dimension_l > 0 && 
    item.packed_dimension_w > 0 && 
    item.packed_dimension_h > 0
  );
  
  if (validItems.length === 0) {
    return {
      packages: [],
      requiresMultipleBoxes: false,
      allItemsFit: false,
      totalWeightOz: 0,
      totalMaterialCost: 0,
      totalPaperFeet: 0,
      totalBoxCost: 0,
      totalPaperCost: 0,
      unpackedItems: [],
      itemsMissingDimensions,
    };
  }
  
  // First, try to fit everything in a single box
  const singleBoxResult = findOptimalBox(validItems, boxes, options);
  
  if (singleBoxResult.allItemsFit && singleBoxResult.weightOk) {
    return {
      packages: [singleBoxResult],
      requiresMultipleBoxes: false,
      allItemsFit: true,
      totalWeightOz: singleBoxResult.totalPackageWeightOz,
      totalMaterialCost: singleBoxResult.totalMaterialCost,
      totalPaperFeet: singleBoxResult.paperFillFeet,
      totalBoxCost: singleBoxResult.boxCost,
      totalPaperCost: singleBoxResult.paperCost,
      unpackedItems: [],
      itemsMissingDimensions,
    };
  }
  
  // Need multiple boxes - use greedy approach with base-area-first sorting
  const packages: PackingResult[] = [];
  let remainingItems = [...validItems];
  const activeBoxes = boxes.filter(b => b.is_active);
  
  // Sort items by footprint area descending so largest-footprint items
  // get packed first (into the largest box).
  remainingItems.sort((a, b) => {
    const aFootprint = a.packed_dimension_l * a.packed_dimension_w;
    const bFootprint = b.packed_dimension_l * b.packed_dimension_w;
    if (bFootprint !== aFootprint) return bFootprint - aFootprint;
    return b.weight_oz - a.weight_oz;
  });
  
  let iteration = 0;
  while (remainingItems.length > 0) {
    iteration++;
    const remTotalVol = remainingItems.reduce((s, i) => s + i.packed_dimension_l * i.packed_dimension_w * i.packed_dimension_h * i.quantity, 0);
    console.log(`[MultiBox] Iteration ${iteration}: ${remainingItems.length} item types remaining, total volume=${remTotalVol.toFixed(1)}`);
    
    // Sort ALL boxes by volume ascending (smallest first)
    const boxesByVolume = [...activeBoxes].sort((a, b) =>
      (a.dimension_l * a.dimension_w * a.dimension_h) -
      (b.dimension_l * b.dimension_w * b.dimension_h)
    );
    
    // Pass 1: Find smallest box where ALL remaining items fit
    let bestResult: PackingResult | null = null;
    for (const box of boxesByVolume) {
      const result = packItemsInBox(remainingItems, box, options, false);
      console.log(`[MultiBox] Pass 1: ${box.name} → packed=${result.packedItems.length}, allFit=${result.allItemsFit}, weightOk=${result.weightOk}`);
      if (result.allItemsFit && result.weightOk) {
        bestResult = result;
        break;
      }
    }
    
    // Pass 1 success: all remaining items fit in one box
    if (bestResult && bestResult.allItemsFit && bestResult.weightOk) {
      packages.push(bestResult);
      console.log(`[MultiBox] All remaining items fit in ${bestResult.box?.name}`);
      remainingItems = [];
      break; // All items packed
    }
    
    // Pass 2: Evaluate every box by total shipment volume impact
    bestResult = null;
    let bestTotalShipVol = Infinity;
    let bestUtilization = 0;
    let bestPackedVol = 0;

    for (const box of boxesByVolume) {
      const result = packItemsInBox(remainingItems, box, options, true);
      if (!result.weightOk || result.packedItems.length === 0) continue;

      const boxVol = box.dimension_l * box.dimension_w * box.dimension_h;
      const packedVol = result.packedItems.reduce((s, p) => s + p.finalL * p.finalW * p.finalH, 0);
      const utilization = boxVol > 0 ? packedVol / boxVol : 0;

      let totalShipVol: number;
      const remaining = getRemainingItems(remainingItems, result.packedItems);
      const remainingQty = remaining.reduce((s, i) => s + i.quantity, 0);

      if (remainingQty === 0) {
        // Everything fits in this one box
        totalShipVol = boxVol;
      } else {
        // Look ahead: find smallest box for remainder
        const lookAhead = findOptimalBox(remaining, activeBoxes, options);
        if (lookAhead.allItemsFit && lookAhead.weightOk && lookAhead.box) {
          totalShipVol = boxVol +
            lookAhead.box.dimension_l * lookAhead.box.dimension_w * lookAhead.box.dimension_h;
        } else {
          // Remainder needs multi-box — can't optimize further, use Infinity
          totalShipVol = Infinity;
        }
      }

      console.log(
        `[MultiBox] Pass 2: ${box.name} → packed=${result.packedItems.length}, ` +
        `util=${(utilization * 100).toFixed(1)}%, totalShipVol=${totalShipVol === Infinity ? 'Inf' : totalShipVol.toFixed(0)}`
      );

      // Priority 1: lowest total shipment volume
      // Priority 2: highest utilization % (tiebreaker)
      // Priority 3: if both Infinity, fall back to highest packed volume (greedy progress)
      if (
        totalShipVol < bestTotalShipVol ||
        (totalShipVol === bestTotalShipVol && utilization > bestUtilization) ||
        (totalShipVol === Infinity && bestTotalShipVol === Infinity && packedVol > bestPackedVol)
      ) {
        bestTotalShipVol = totalShipVol;
        bestUtilization = utilization;
        bestPackedVol = packedVol;
        bestResult = result;
      }
    }

    if (!bestResult || bestResult.packedItems.length === 0) {
      console.log(`[MultiBox] No box could pack any remaining items — breaking`);
      break;
    }
    
    console.log(`[MultiBox] Selected: ${bestResult.box?.name} with ${bestResult.packedItems.length} packed items`);
    packages.push(bestResult);
    
    // Remove packed items from remaining using helper
    const prevCount = remainingItems.length;
    remainingItems = getRemainingItems(remainingItems, bestResult.packedItems);
    
    // Re-sort ALL remaining items by footprint descending for next iteration
    // (no overflow-SKU front-loading — each box starts with clean footprint-priority)
    remainingItems.sort((a, b) => {
      const aFootprint = a.packed_dimension_l * a.packed_dimension_w;
      const bFootprint = b.packed_dimension_l * b.packed_dimension_w;
      if (Math.abs(bFootprint - aFootprint) > 0.01) return bFootprint - aFootprint;
      return b.weight_oz - a.weight_oz;
    });
    
    console.log(`[MultiBox] Removed ${prevCount - remainingItems.length} item types, ${remainingItems.length} remain (footprint-desc order: ${remainingItems.map(i => `${i.name}×${i.quantity}(fp:${(i.packed_dimension_l * i.packed_dimension_w).toFixed(1)})`).join(', ') || 'none'})`);
    
    // Diagnostic: verify no hidden queue bias from placement source
    console.log(`[MultiBox] Remaining queue footprint order verified: [${remainingItems.map(i => (i.packed_dimension_l * i.packed_dimension_w).toFixed(1)).join(', ')}]`);
  }
  
  // Rescue pass: try to pack remaining items TOGETHER first, then fall back to individual
  if (remainingItems.length > 0) {
    console.log(`[MultiBox] Rescue pass: ${remainingItems.length} item types still remaining, trying group packing first`);
    
    // Step 1: Try packing all remaining items together in one box
    const groupResult = findOptimalBox(remainingItems, activeBoxes, options);
    if (groupResult.allItemsFit && groupResult.weightOk) {
      packages.push(groupResult);
      console.log(`[MultiBox] Rescue: all remaining items fit together in ${groupResult.box?.name}`);
      remainingItems = [];
    } else {
      console.log(`[MultiBox] Rescue: group packing failed (allItemsFit=${groupResult.allItemsFit}, weightOk=${groupResult.weightOk}), falling back to individual`);
      // Step 2: Fall back to individual packing
      for (const item of [...remainingItems]) {
        const singleItem = { ...item, quantity: 1 };
        for (let q = 0; q < item.quantity; q++) {
          const singleResult = findOptimalBox([singleItem], activeBoxes, options);
          if (singleResult.allItemsFit && singleResult.weightOk) {
            packages.push(singleResult);
          }
        }
        remainingItems = remainingItems.filter(r => r.id !== item.id);
      }
    }
    console.log(`[MultiBox] After rescue: ${remainingItems.length} items still unpacked`);
  }
  
  // Sort packages: largest box first, smallest last
  packages.sort((a, b) => {
    const aVol = a.box ? a.box.dimension_l * a.box.dimension_w * a.box.dimension_h : 0;
    const bVol = b.box ? b.box.dimension_l * b.box.dimension_w * b.box.dimension_h : 0;
    return bVol - aVol;
  });

  // Calculate totals
  const totalWeightOz = packages.reduce((sum, p) => sum + p.totalPackageWeightOz, 0);
  const totalMaterialCost = packages.reduce((sum, p) => sum + p.totalMaterialCost, 0);
  const totalPaperFeet = packages.reduce((sum, p) => sum + p.paperFillFeet, 0);
  const totalBoxCost = packages.reduce((sum, p) => sum + p.boxCost, 0);
  const totalPaperCost = packages.reduce((sum, p) => sum + p.paperCost, 0);
  
  return {
    packages,
    requiresMultipleBoxes: packages.length > 1,
    allItemsFit: remainingItems.length === 0,
    totalWeightOz,
    totalMaterialCost,
    totalPaperFeet,
    totalBoxCost,
    totalPaperCost,
    unpackedItems: remainingItems,
    itemsMissingDimensions,
  };
}

/**
 * Main entry point for multi-box recommendation
 */
export function getMultiBoxRecommendation(
  items: PackableItem[],
  boxes: BoxSize[],
  options: PackingOptions
): MultiBoxPackingResult {
  return packItemsMultiBox(items, boxes, options);
}

/**
 * Calculate paper fill for a given void volume
 */
export function calculatePaperFill(voidVolumeCubicInches: number, paperCubicInchesPerInch: number): {
  inches: number;
  feet: number;
  feetAndInches: string;
} {
  const inches = Math.max(0, voidVolumeCubicInches / paperCubicInchesPerInch);
  const feet = inches / 12;
  
  let wholeFeet = Math.floor(feet);
  let remainingInches = Math.round((feet - wholeFeet) * 12);
  if (remainingInches >= 12) {
    wholeFeet += 1;
    remainingInches = 0;
  }
  
  const feetAndInches = wholeFeet > 0 
    ? `${wholeFeet}'${remainingInches > 0 ? ` ${remainingInches}"` : ''}`
    : `${Math.round(inches)}"`;
  
  return {
    inches: Math.round(inches * 10) / 10,
    feet: Math.round(feet * 10) / 10,
    feetAndInches,
  };
}

/**
 * Format weight for display
 */
export function formatWeight(weightOz: number): string {
  if (weightOz >= 16) {
    const lbs = weightOz / 16;
    return `${lbs.toFixed(1)} lbs`;
  }
  return `${weightOz.toFixed(1)} oz`;
}

/**
 * Format dimensions for display
 */
export function formatDimensions(l: number, w: number, h: number): string {
  return `${l}" × ${w}" × ${h}"`;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Create a "self-packaged" result for items that ship in their own packaging.
 * This represents an item shipping as-is without an outer box.
 */
// ─── SKU-Agnostic Feedback Utilities ─────────────────────────────────────────

/**
 * Represents a collapsed stack or single item for feedback logging.
 * Stacks sharing the same (x,y) with isStacked are merged into one logical item.
 */
export interface CollapsedItem {
  /** Constraint dimensions of the logical item */
  l: number;
  w: number;
  h: number;
  /** Total weight in oz */
  weightOz: number;
  /** Whether this is a collapsed stack */
  isStack: boolean;
  /** Number of items in the stack (1 for non-stacked) */
  stackCount: number;
  /** Packed positions from the original items */
  positions: PackedItemPosition[];
}

/**
 * Physical profile of an item for dimension-based feedback logging.
 * No SKU or ID references — purely physical properties.
 */
export interface ItemProfile {
  index: number;
  l: number;
  w: number;
  h: number;
  weight_oz: number;
  surface_area: number;
  aspect_lw: number;
  aspect_lh: number;
  is_stack: boolean;
  stack_count: number;
}

/**
 * Physical profile of a packing layer for feedback logging.
 */
export interface LayerProfile {
  layer_index: number;
  base_z: number;
  height: number;
  total_weight_oz: number;
  footprint_area: number;
  fill_density: number;
  item_count: number;
  item_profile_indices: number[];
  height_variance: number;
  weight_ratio_of_total: number;
}

/**
 * Position record for feedback logging — references item by profile_index, not SKU.
 */
export interface FeedbackPosition {
  profile_index: number;
  layer_index: number;
  x: number;
  y: number;
  z: number;
  placed_l: number;
  placed_w: number;
  placed_h: number;
  rotation_index: number;
}

/**
 * Collapse stacked items (sharing same x,y with isStacked) into single logical items.
 * Non-stacked items pass through as single-item "stacks".
 */
export function collapseStacks(
  packedItems: PackedItemPosition[],
  itemWeights: Record<string, number>
): CollapsedItem[] {
  const result: CollapsedItem[] = [];

  // Group by approximate (x, y) position — stacked items share same footprint
  const stackGroups = new Map<string, PackedItemPosition[]>();
  const standalone: PackedItemPosition[] = [];

  for (const item of packedItems) {
    // Check if this item ID pattern indicates stacking (e.g., same base ID with -0, -1 suffixes at same x,y)
    const baseId = item.itemId.replace(/-\d+$/, '');
    const key = `${baseId}_${Math.round(item.x * 100)}_${Math.round(item.y * 100)}`;

    // Find if there are other items at this exact position
    const othersAtPos = packedItems.filter(
      other => other !== item &&
      Math.abs(other.x - item.x) < 0.01 &&
      Math.abs(other.y - item.y) < 0.01 &&
      other.itemId.replace(/-\d+$/, '') === baseId
    );

    if (othersAtPos.length > 0) {
      if (!stackGroups.has(key)) stackGroups.set(key, []);
      const group = stackGroups.get(key)!;
      if (!group.includes(item)) group.push(item);
    } else {
      standalone.push(item);
    }
  }

  // Collapse each stack group
  for (const [, group] of stackGroups) {
    group.sort((a, b) => a.z - b.z);
    const anchor = group[0];
    const totalH = group.reduce((sum, g) => sum + g.finalH, 0);
    const baseId = anchor.itemId.replace(/-\d+$/, '');
    const totalWeight = group.reduce((sum, g) => sum + (itemWeights[baseId] || itemWeights[g.itemId] || 0), 0);

    result.push({
      l: anchor.finalL,
      w: anchor.finalW,
      h: totalH,
      weightOz: totalWeight,
      isStack: true,
      stackCount: group.length,
      positions: group,
    });
  }

  // Add standalone items
  for (const item of standalone) {
    const baseId = item.itemId.replace(/-\d+$/, '');
    result.push({
      l: item.finalL,
      w: item.finalW,
      h: item.finalH,
      weightOz: itemWeights[baseId] || itemWeights[item.itemId] || 0,
      isStack: false,
      stackCount: 1,
      positions: [item],
    });
  }

  return result;
}

/**
 * Build a physical profile for a collapsed item (no SKU references).
 */
export function buildItemProfile(item: CollapsedItem, index: number): ItemProfile {
  const { l, w, h } = item;
  const surface_area = 2 * (l * w + l * h + w * h);
  return {
    index,
    l,
    w,
    h,
    weight_oz: item.weightOz,
    surface_area: Math.round(surface_area * 100) / 100,
    aspect_lw: w > 0 ? Math.round((l / w) * 100) / 100 : 0,
    aspect_lh: h > 0 ? Math.round((l / h) * 100) / 100 : 0,
    is_stack: item.isStack,
    stack_count: item.stackCount,
  };
}

/**
 * Build layer profiles from a set of feedback positions and item profiles.
 * Groups items by base Z (within tolerance) and computes per-layer metrics.
 */
export function buildLayerProfiles(
  positions: FeedbackPosition[],
  itemProfiles: ItemProfile[],
  boxL: number,
  boxW: number,
  totalWeightOz: number
): LayerProfile[] {
  if (positions.length === 0) return [];

  const Z_TOLERANCE = 0.1;
  // Group by base Z
  const zLevels: number[] = [];
  for (const pos of positions) {
    const existing = zLevels.find(z => Math.abs(z - pos.z) < Z_TOLERANCE);
    if (existing === undefined) zLevels.push(pos.z);
  }
  zLevels.sort((a, b) => a - b);

  const boxFloorArea = boxL * boxW;

  return zLevels.map((baseZ, layerIdx) => {
    const layerPositions = positions.filter(p => Math.abs(p.z - baseZ) < Z_TOLERANCE);
    const profileIndices = layerPositions.map(p => p.profile_index);
    const layerProfiles = profileIndices.map(i => itemProfiles[i]).filter(Boolean);

    const heights = layerPositions.map(p => p.placed_h);
    const maxH = Math.max(...heights, 0);
    const totalWeight = layerProfiles.reduce((sum, p) => sum + p.weight_oz, 0);
    const footprintArea = layerPositions.reduce((sum, p) => sum + p.placed_l * p.placed_w, 0);

    // Height variance
    const meanH = heights.length > 0 ? heights.reduce((s, h) => s + h, 0) / heights.length : 0;
    const heightVariance = heights.length > 1
      ? heights.reduce((s, h) => s + (h - meanH) ** 2, 0) / heights.length
      : 0;

    return {
      layer_index: layerIdx,
      base_z: baseZ,
      height: maxH,
      total_weight_oz: Math.round(totalWeight * 100) / 100,
      footprint_area: Math.round(footprintArea * 100) / 100,
      fill_density: boxFloorArea > 0 ? Math.round((footprintArea / boxFloorArea) * 100) / 100 : 0,
      item_count: layerPositions.length,
      item_profile_indices: profileIndices,
      height_variance: Math.round(heightVariance * 100) / 100,
      weight_ratio_of_total: totalWeightOz > 0
        ? Math.round((totalWeight / totalWeightOz) * 100) / 100
        : 0,
    };
  });
}

/**
 * Convert packed items into feedback positions using collapsed item profiles.
 */
export function buildFeedbackPositions(
  collapsedItems: CollapsedItem[],
  itemProfiles: ItemProfile[],
  boxL: number,
  boxW: number
): FeedbackPosition[] {
  const Z_TOLERANCE = 0.1;
  const positions: FeedbackPosition[] = [];

  for (let i = 0; i < collapsedItems.length; i++) {
    const collapsed = collapsedItems[i];
    const anchor = collapsed.positions[0];
    positions.push({
      profile_index: i,
      layer_index: 0, // Will be recalculated by buildLayerProfiles
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      placed_l: collapsed.l,
      placed_w: collapsed.w,
      placed_h: collapsed.h,
      rotation_index: anchor.rotationIndex,
    });
  }

  // Assign layer indices based on Z grouping
  const zLevels: number[] = [];
  for (const pos of positions) {
    const existing = zLevels.find(z => Math.abs(z - pos.z) < Z_TOLERANCE);
    if (existing === undefined) zLevels.push(pos.z);
  }
  zLevels.sort((a, b) => a - b);

  for (const pos of positions) {
    pos.layer_index = zLevels.findIndex(z => Math.abs(z - pos.z) < Z_TOLERANCE);
  }

  return positions;
}

/**
 * Get multiple packing options for the same set of items across different boxes.
 * Returns up to 4 valid options sorted by fill percentage (best fit first).
 */
export function getMultiOptionRecommendation(
  items: PackableItem[],
  boxes: BoxSize[],
  options: PackingOptions
): PackingResult[] {
  return getAllBoxOptions(items, boxes, options).slice(0, 4);
}

export function createSelfPackagedResult(item: PackableItem): PackingResult {
  const itemVolume = item.packed_dimension_l * item.packed_dimension_w * item.packed_dimension_h * item.quantity;
  const totalItemWeightOz = item.weight_oz * item.quantity;
  
  return {
    box: null, // No outer box
    packedItems: [{
      itemId: item.id,
      x: 0,
      y: 0,
      z: 0,
      finalL: item.packed_dimension_l,
      finalW: item.packed_dimension_w,
      finalH: item.packed_dimension_h,
      originalL: item.packed_dimension_l,
      originalW: item.packed_dimension_w,
      originalH: item.packed_dimension_h,
      packedShape: item.packed_shape,
      rotationIndex: 0,
    }],
    itemVolume,
    boxVolume: itemVolume, // The item IS the package
    voidVolume: 0,
    fillPercentage: 100,
    paperFillInches: 0,
    paperFillFeet: 0,
    paperWeightOz: 0,
    totalItemWeightOz,
    boxWeightOz: 0, // No outer box
    totalPackageWeightOz: totalItemWeightOz,
    boxCost: 0, // No outer box cost
    paperCost: 0, // No paper filler
    totalMaterialCost: 0,
    allItemsFit: true,
    weightOk: true,
    noBoxAvailable: false,
    minimumRequiredDimensions: null,
    packedItemIds: [item.id],
    // Additional metadata for self-packaged items
    isSelfPackaged: true,
    selfPackagedDimensions: {
      l: item.packed_dimension_l,
      w: item.packed_dimension_w,
      h: item.packed_dimension_h,
    },
  };
}

/**
 * Enhanced multi-box packing that considers self-packaged items.
 * - Single self-packaged items ship as-is (no outer box)
 * - Multiple self-packaged items of the same type get consolidated
 * - Mixed orders pack non-self-packaged items normally
 */
export function getSmartMultiBoxRecommendation(
  items: PackableItem[],
  boxes: BoxSize[],
  options: PackingOptions
): MultiBoxPackingResult {
  // Separate self-packaged items (qty=1) from items needing boxes
  const selfPackagedSingles: PackableItem[] = [];
  const itemsNeedingBoxes: PackableItem[] = [];
  
  for (const item of items) {
    if (item.ships_in_own_packaging && item.quantity === 1) {
      // Single self-packaged item ships as-is
      selfPackagedSingles.push(item);
    } else {
      // Either not self-packaged, or qty > 1 (needs consolidation)
      itemsNeedingBoxes.push(item);
    }
  }
  
  // Create results for self-packaged singles (each ships in its own package)
  const selfPackagedResults = selfPackagedSingles.map(item => createSelfPackagedResult(item));
  
  // Pack remaining items using standard multi-box logic
  let boxedResult: MultiBoxPackingResult = {
    packages: [],
    requiresMultipleBoxes: false,
    allItemsFit: true,
    totalWeightOz: 0,
    totalMaterialCost: 0,
    totalPaperFeet: 0,
    totalBoxCost: 0,
    totalPaperCost: 0,
    unpackedItems: [],
    itemsMissingDimensions: [],
  };
  
  if (itemsNeedingBoxes.length > 0) {
    boxedResult = packItemsMultiBox(itemsNeedingBoxes, boxes, options);
  }
  
  // Combine results
  const allPackages = [...selfPackagedResults, ...boxedResult.packages];
  
  const totalWeightOz = allPackages.reduce((sum, p) => sum + p.totalPackageWeightOz, 0);
  const totalMaterialCost = allPackages.reduce((sum, p) => sum + p.totalMaterialCost, 0);
  const totalPaperFeet = allPackages.reduce((sum, p) => sum + p.paperFillFeet, 0);
  const totalBoxCost = allPackages.reduce((sum, p) => sum + p.boxCost, 0);
  const totalPaperCost = allPackages.reduce((sum, p) => sum + p.paperCost, 0);
  
  // Check for items missing dimensions
  const itemsMissingDimensions = items
    .filter(item => 
      !item.packed_dimension_l || 
      !item.packed_dimension_w || 
      !item.packed_dimension_h
    )
    .map(item => item.name);
  
  return {
    packages: allPackages,
    requiresMultipleBoxes: allPackages.length > 1,
    allItemsFit: boxedResult.allItemsFit && boxedResult.unpackedItems.length === 0,
    totalWeightOz,
    totalMaterialCost,
    totalPaperFeet,
    totalBoxCost,
    totalPaperCost,
    unpackedItems: boxedResult.unpackedItems,
    itemsMissingDimensions: [...new Set([...itemsMissingDimensions, ...boxedResult.itemsMissingDimensions])],
  };
}

// ─── Geometry Validator for Restored Packages ────────────────────────────────

/**
 * Validate that a restored PackingResult has no AABB overlaps or boundary violations.
 * Returns true if geometry is physically valid, false otherwise.
 * Self-packaged items always pass (no box to validate against).
 */
export function validatePackedGeometry(pkg: PackingResult): boolean {
  if (pkg.isSelfPackaged || !pkg.box) return true;
  if (!pkg.packedItems || pkg.packedItems.length === 0) return true;

  const box = pkg.box;
  const TOL = 0.05; // tolerance in inches

  // Boundary check: all items must be within box dimensions
  for (const item of pkg.packedItems) {
    if (item.x < -TOL || item.y < -TOL || item.z < -TOL ||
        item.x + item.finalL > box.dimension_l + TOL ||
        item.y + item.finalW > box.dimension_w + TOL ||
        item.z + item.finalH > box.dimension_h + TOL) {
      console.warn(`[validatePackedGeometry] Boundary violation: item ${item.itemId} at (${item.x},${item.y},${item.z}) dims ${item.finalL}x${item.finalW}x${item.finalH} in box ${box.dimension_l}x${box.dimension_w}x${box.dimension_h}`);
      return false;
    }
  }

  // AABB overlap check
  for (let i = 0; i < pkg.packedItems.length; i++) {
    for (let j = i + 1; j < pkg.packedItems.length; j++) {
      const a = pkg.packedItems[i];
      const b = pkg.packedItems[j];

      // Skip stacked items in the same column
      if (a.isStacked && b.isStacked &&
          Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) {
        continue;
      }

      const oX = Math.min(a.x + a.finalL, b.x + b.finalL) - Math.max(a.x, b.x);
      const oY = Math.min(a.y + a.finalW, b.y + b.finalW) - Math.max(a.y, b.y);
      const oZ = Math.min(a.z + a.finalH, b.z + b.finalH) - Math.max(a.z, b.z);

      if (oX > 0.01 && oY > 0.01 && oZ > 0.01) {
        console.warn(`[validatePackedGeometry] Overlap between items ${a.itemId} and ${b.itemId}: ${oX.toFixed(2)}x${oY.toFixed(2)}x${oZ.toFixed(2)}`);
        return false;
      }
    }
  }

  return true;
}
