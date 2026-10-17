import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Package, Boxes, Scale, RotateCw, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, AlignCenterHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  getSmartMultiBoxRecommendation,
  getMultiOptionRecommendation,
  packItemsInBox,
  collapseStacks,
  buildItemProfile,
  buildFeedbackPositions,
  buildLayerProfiles,
  formatWeight,
  validatePackedGeometry,
  type PackableItem,
  type BoxSize,
  type MultiBoxPackingResult,
  type PackingResult,
  type ItemProfile,
  type FeedbackPosition,
  type LayerProfile,
} from "@/lib/box-packing-utils";
import { BoxPackingVisualization, type EditablePosition, ITEM_COLORS, getBaseId } from "./BoxPackingVisualization";
import { PackingOptionCard } from "./PackingOptionCard";
import { PackingEditToolbar } from "./PackingEditToolbar";
import { PackageCard } from "./PackageCard";

interface OrderItem {
  id: string;
  item_type: "inventory_item" | "assembly" | "labor";
  inventory_item_id?: string;
  assembly_id?: string;
  labor_item_id?: string;
  item_name: string;
  item_sku: string;
  quantity_ordered: number;
  unit_price: number;
}

export interface PackingConfig {
  mode: "auto" | "manual";
  packages: PackingResult[];
  manualBoxId?: string;
  manualWeightOz?: number;
  manualBox?: BoxSize;
}

interface PackingStepContentProps {
  orderItems: OrderItem[];
  onPackingComplete: (config: PackingConfig) => void;
  initialPackingConfig?: PackingConfig | null;
}

export function PackingStepContent({ orderItems, onPackingComplete, initialPackingConfig }: PackingStepContentProps) {
  const [loading, setLoading] = useState(true);
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const [packableItems, setPackableItems] = useState<PackableItem[]>([]);
  const [missingDimensionItems, setMissingDimensionItems] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<MultiBoxPackingResult | null>(null);
  const [itemNameMap, setItemNameMap] = useState<Record<string, string>>({});
  const [itemWeightMap, setItemWeightMap] = useState<Record<string, number>>({});
  const [paperConfig, setPaperConfig] = useState<{
    cubicInchesPerInch: number;
    weightOzPerFoot: number;
    costPerFoot: number;
    shippingCostMultiplier: number;
  } | null>(null);
  const [paperError, setPaperError] = useState(false);

  // Multi-option state
  const [options, setOptions] = useState<PackingResult[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editingPackageIndex, setEditingPackageIndex] = useState<number | null>(null);
  const [editablePositions, setEditablePositions] = useState<EditablePosition[] | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const selectedItemIndexRef = useRef<number | null>(null);
  const editBoxRef = useRef<BoxSize | null>(null);
  const originalPositionsRef = useRef<EditablePosition[] | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Keep refs in sync with state
  useEffect(() => { selectedItemIndexRef.current = selectedItemIndex; }, [selectedItemIndex]);

  // Manual mode state
  const [manualBoxId, setManualBoxId] = useState<string>("");
  const [manualWeightOz, setManualWeightOz] = useState<number>(0);

  // Build fingerprint of order items to re-fetch when items change
  const orderItemsFingerprint = useMemo(() =>
    JSON.stringify(orderItems.map(i => ({
      id: i.inventory_item_id || i.assembly_id,
      qty: i.quantity_ordered,
    }))),
    [orderItems]
  );

  useEffect(() => {
    fetchPackingData();
  }, [orderItemsFingerprint]);

  // Track whether we've consumed the initial config (so it only applies once)
  const initialConsumedRef = useRef(false);
  const skipAlgorithmRef = useRef(false);

  // Capture initial config once -- ignore subsequent prop changes from onPackingComplete feedback loop
  const stableInitialConfig = useRef<PackingConfig | null | undefined>(undefined);
  if (stableInitialConfig.current === undefined) {
    stableInitialConfig.current = initialPackingConfig ?? null;
  }

  // Reset refs when packing is invalidated (e.g. order items changed)
  useEffect(() => {
    if (!initialPackingConfig && initialConsumedRef.current) {
      initialConsumedRef.current = false;
      skipAlgorithmRef.current = false;
      stableInitialConfig.current = null; // Allow algorithm to re-run
    }
  }, [initialPackingConfig]);

  // Run algorithm when data is ready — but skip if we have a valid initial config
  useEffect(() => {
    const initConfig = stableInitialConfig.current;

    // If a valid saved config exists and hasn't been consumed yet, restore it.
    // GATE: all prerequisites must be loaded before consuming.
    const hasPaperConfig = paperConfig !== null;
    const hasBoxes = boxes.length > 0;
    const hasItems = packableItems.length > 0;

    if (
      !initialConsumedRef.current &&
      initConfig &&
      initConfig.packages &&
      initConfig.packages.length > 0 &&
      hasItems &&
      hasBoxes &&
      hasPaperConfig
    ) {
      // Check if packages actually have position data worth restoring
      const hasPackedPositions = initConfig.packages.some(
        p => p.packedItems && p.packedItems.length > 0
      );

      if (hasPackedPositions) {
        // Validate restored geometry before trusting it
        const geometryValid = initConfig.packages.every(pkg => validatePackedGeometry(pkg));
        if (!geometryValid) {
          console.warn('[Packing] Restored geometry failed validation — forcing fresh recalculation');
          initialConsumedRef.current = true;
          skipAlgorithmRef.current = false;
          // Fall through to algorithm run below
          if (boxes.length > 0 && packableItems.length > 0 && missingDimensionItems.length === 0 && paperConfig !== null) {
            const opts = { paperCubicInchesPerInch: paperConfig.cubicInchesPerInch, paperWeightOzPerFoot: paperConfig.weightOzPerFoot, paperCostPerFoot: paperConfig.costPerFoot, paperShippingCostMultiplier: paperConfig.shippingCostMultiplier };
            const rec = getSmartMultiBoxRecommendation(packableItems, boxes, opts);
            setRecommendation(rec);
            const multiOptions = getMultiOptionRecommendation(packableItems, boxes, opts);
            setOptions(multiOptions);
            setSelectedOptionIndex(0);
            skipAlgorithmRef.current = true;
            onPackingComplete({ mode: "auto", packages: rec.packages });
          }
          return;
        }

        // Restore recommendation from saved config, but recompute paper metrics
        // from current active paper settings to avoid stale weight drift.
        initialConsumedRef.current = true;
        skipAlgorithmRef.current = true;

        const refreshedPackages = initConfig.packages.map(pkg => {
          // Don't touch self-packaged entries
          if (pkg.isSelfPackaged || !pkg.box) return pkg;

          const boxVol = pkg.boxVolume || (pkg.box.dimension_l * pkg.box.dimension_w * pkg.box.dimension_h);
          const itemVol = pkg.itemVolume || 0;
          const voidVol = Math.max(0, boxVol - itemVol);
          const paperFillInches = voidVol / paperConfig.cubicInchesPerInch;
          const paperFillFeet = paperFillInches / 12;
          const paperWeightOz = paperFillFeet * paperConfig.weightOzPerFoot;
          const paperCost = paperFillFeet * paperConfig.costPerFoot * paperConfig.shippingCostMultiplier;
          const totalItemWeightOz = pkg.totalItemWeightOz || 0;
          const boxWeightOz = pkg.boxWeightOz || (pkg.box.weight_oz ?? 0);
          const totalPackageWeightOz = totalItemWeightOz + boxWeightOz + paperWeightOz;
          const boxCost = pkg.boxCost || pkg.box.cost_per_box || 0;
          const weightOk = pkg.box.max_weight_oz ? totalPackageWeightOz <= pkg.box.max_weight_oz : true;

          return {
            ...pkg,
            voidVolume: voidVol,
            paperFillInches,
            paperFillFeet,
            paperWeightOz,
            paperCost,
            totalPackageWeightOz,
            totalMaterialCost: boxCost + paperCost,
            weightOk,
          };
        });

        const totalWeightOz = refreshedPackages.reduce(
          (sum, p) => sum + (p.totalPackageWeightOz || 0), 0
        );
        const totalMaterialCost = refreshedPackages.reduce(
          (sum, p) => sum + (p.totalMaterialCost || 0), 0
        );
        const totalPaperFeet = refreshedPackages.reduce(
          (sum, p) => sum + (p.paperFillFeet || 0), 0
        );
        setRecommendation({
          packages: refreshedPackages,
          totalWeightOz,
          totalMaterialCost,
          totalPaperFeet,
          itemsMissingDimensions: [],
          unpackedItems: [],
          allItemsFit: true,
          requiresMultipleBoxes: refreshedPackages.length > 1,
          totalBoxCost: refreshedPackages.reduce((sum, p) => sum + (p.boxCost || 0), 0),
          totalPaperCost: refreshedPackages.reduce((sum, p) => sum + (p.paperCost || 0), 0),
        });
        const primaryPkg = refreshedPackages.find(p => !p.isSelfPackaged);
        setOptions(primaryPkg ? [primaryPkg] : []);
        setSelectedOptionIndex(0);
        const refreshedConfig = { ...initConfig, packages: refreshedPackages };
        onPackingComplete(refreshedConfig);
        return; // Skip algorithm
      }
      // No packed positions — run algorithm immediately instead of falling through
      initialConsumedRef.current = true;
      if (boxes.length > 0 && packableItems.length > 0 && missingDimensionItems.length === 0 && paperConfig !== null) {
        const opts = { paperCubicInchesPerInch: paperConfig.cubicInchesPerInch, paperWeightOzPerFoot: paperConfig.weightOzPerFoot, paperCostPerFoot: paperConfig.costPerFoot, paperShippingCostMultiplier: paperConfig.shippingCostMultiplier };
        const rec = getSmartMultiBoxRecommendation(packableItems, boxes, opts);
        console.log(`[Packing] Algorithm produced ${rec.packages.length} package(s):`,
          rec.packages.map((p, i) => `Box ${i+1}: ${p.box?.name} with ${p.packedItems.length} items`)
        );
        setRecommendation(rec);
        const multiOptions = getMultiOptionRecommendation(packableItems, boxes, opts);
        setOptions(multiOptions);
        setSelectedOptionIndex(0);
        skipAlgorithmRef.current = true;
        onPackingComplete({ mode: "auto", packages: rec.packages });
      }
      return;
    }

    if (boxes.length > 0 && packableItems.length > 0 && missingDimensionItems.length === 0 && paperConfig !== null && !skipAlgorithmRef.current && !(initConfig?.packages?.some(p => p.packedItems?.length > 0))) {
      const opts = { paperCubicInchesPerInch: paperConfig.cubicInchesPerInch, paperWeightOzPerFoot: paperConfig.weightOzPerFoot, paperCostPerFoot: paperConfig.costPerFoot, paperShippingCostMultiplier: paperConfig.shippingCostMultiplier };
      const rec = getSmartMultiBoxRecommendation(packableItems, boxes, opts);
      console.log(`[Packing] Algorithm produced ${rec.packages.length} package(s):`,
        rec.packages.map((p, i) => `Box ${i+1}: ${p.box?.name} with ${p.packedItems.length} items`)
      );
      setRecommendation(rec);
      const multiOptions = getMultiOptionRecommendation(packableItems, boxes, opts);
      setOptions(multiOptions);
      setSelectedOptionIndex(0);
      onPackingComplete({ mode: "auto", packages: rec.packages });
    }
  }, [boxes, packableItems, missingDimensionItems, paperConfig]);

  // Update parent when manual selection changes
  useEffect(() => {
    if (missingDimensionItems.length > 0 && manualBoxId) {
      const selectedBox = boxes.find((b) => b.id === manualBoxId);
      if (selectedBox) {
        const manualResult: PackingResult = {
          box: selectedBox,
          packedItems: [],
          itemVolume: 0,
          boxVolume: selectedBox.dimension_l * selectedBox.dimension_w * selectedBox.dimension_h,
          voidVolume: 0,
          fillPercentage: 0,
          paperFillInches: 0,
          paperFillFeet: 0,
          paperWeightOz: 0,
          totalItemWeightOz: manualWeightOz,
          boxWeightOz: selectedBox.weight_oz ?? 0,
          totalPackageWeightOz: manualWeightOz + (selectedBox.weight_oz ?? 0),
          boxCost: selectedBox.cost_per_box,
          paperCost: 0,
          totalMaterialCost: selectedBox.cost_per_box,
          allItemsFit: true,
          weightOk: true,
          noBoxAvailable: false,
          minimumRequiredDimensions: null,
        };
        onPackingComplete({
          mode: "manual",
          packages: [manualResult],
          manualBoxId,
          manualWeightOz,
          manualBox: selectedBox,
        });
      }
    }
  }, [manualBoxId, manualWeightOz, missingDimensionItems, boxes]);

  // ─── Edit mode helpers ──────────────────────────────────────────────────

  const enterEditMode = useCallback((pkg: PackingResult, packageIdx: number) => {
    if (!pkg || !pkg.box) return;
    editBoxRef.current = pkg.box;
    setEditingPackageIndex(packageIdx);
    const positions: EditablePosition[] = pkg.packedItems.map((p) => ({
      itemId: p.itemId,
      x: p.x,
      y: p.y,
      z: p.z,
      finalL: p.finalL,
      finalW: p.finalW,
      finalH: p.finalH,
      originalL: p.originalL,
      originalW: p.originalW,
      originalH: p.originalH,
      rotationIndex: p.rotationIndex,
      packedShape: p.packedShape,
      isStacked: p.isStacked,
    }));
    originalPositionsRef.current = positions.map((p) => ({ ...p }));
    setEditablePositions(positions);
    setIsEditing(true);
    setHasChanges(false);
    setSelectedItemIndex(null);
  }, []);

  const resetEditMode = useCallback(() => {
    if (originalPositionsRef.current) {
      setEditablePositions(originalPositionsRef.current.map((p) => ({ ...p })));
      setHasChanges(false);
      setSelectedItemIndex(null);
    }
  }, []);

  const exitEditMode = useCallback(() => {
    setIsEditing(false);
    setEditablePositions(null);
    setSelectedItemIndex(null);
    setHasChanges(false);
    editBoxRef.current = null;
    setEditingPackageIndex(null);
  }, []);

  // ─── Collision helpers for rotation/shift ─────────────────────────────
  
  const getStackSiblings = useCallback((items: EditablePosition[], idx: number): number[] => {
    const item = items[idx];
    const siblings = [idx];
    for (let i = 0; i < items.length; i++) {
      if (i === idx) continue;
      if (Math.abs(items[i].x - item.x) < 0.01 && Math.abs(items[i].y - item.y) < 0.01) {
        siblings.push(i);
      }
    }
    return siblings.length > 1 ? siblings : [idx];
  }, []);

  const hasCollision = useCallback((items: EditablePosition[], checkIndices: number[], skipIndices: Set<number>): boolean => {
    for (const ci of checkIndices) {
      const a = items[ci];
      for (let j = 0; j < items.length; j++) {
        if (skipIndices.has(j)) continue;
        const b = items[j];
        const zOvlp = Math.min(a.z + a.finalH, b.z + b.finalH) - Math.max(a.z, b.z);
        if (zOvlp <= 0.01) continue;
        const xOvlp = Math.min(a.x + a.finalL, b.x + b.finalL) - Math.max(a.x, b.x);
        const yOvlp = Math.min(a.y + a.finalW, b.y + b.finalW) - Math.max(a.y, b.y);
        if (xOvlp > 0.01 && yOvlp > 0.01) return true;
      }
    }
    return false;
  }, []);

  // ─── Rotation ─────────────────────────────────────────────────────────

  const rotateSelectedItem = (axis: "y" | "x" | "z") => {
    const currentIndex = selectedItemIndexRef.current;
    if (currentIndex == null) return;
    const box = editBoxRef.current;
    if (!box) return;

    setEditablePositions((prev) => {
      if (!prev) return prev;
      const next = prev.map(p => ({ ...p }));
      const stackIndices = getStackSiblings(next, currentIndex);
      const skipSet = new Set(stackIndices);

      // Apply dimension swap to all stack siblings
      for (const si of stackIndices) {
        const item = next[si];
        if (axis === "y") {
          [item.finalL, item.finalW] = [item.finalW, item.finalL];
        } else if (axis === "x") {
          [item.finalW, item.finalH] = [item.finalH, item.finalW];
        } else {
          [item.finalL, item.finalH] = [item.finalH, item.finalL];
        }
        item.rotationIndex = (item.rotationIndex + 1) % 6;
      }

      // Re-stack: if stacked, rebuild Z positions from lowest
      if (stackIndices.length > 1) {
        const sorted = [...stackIndices].sort((a, b) => next[a].z - next[b].z);
        let zCursor = next[sorted[0]].z;
        for (const si of sorted) {
          next[si].z = zCursor;
          zCursor += next[si].finalH;
        }
      }

      // Clamp all stack items to box bounds
      for (const si of stackIndices) {
        const item = next[si];
        item.x = Math.max(0, Math.min(item.x, box.dimension_l - item.finalL));
        item.y = Math.max(0, Math.min(item.y, box.dimension_w - item.finalW));
        item.z = Math.max(0, Math.min(item.z, box.dimension_h - item.finalH));
      }

      // Check if entire stack fits in box
      const stackTop = Math.max(...stackIndices.map(si => next[si].z + next[si].finalH));
      if (stackTop > box.dimension_h + 0.01) {
        toast.error("Cannot rotate — doesn't fit in box");
        return prev;
      }

      // Check collisions
      if (hasCollision(next, stackIndices, skipSet)) {
        toast.error("Cannot rotate — collision with other items");
        return prev;
      }

      return next;
    });
    setHasChanges(true);
  };

  // ─── Shift / Nudge ───────────────────────────────────────────────────

  const shiftSelectedItem = (direction: "x+" | "x-" | "y+" | "y-" | "z-up" | "z-down") => {
    const currentIndex = selectedItemIndexRef.current;
    if (currentIndex == null) return;
    const box = editBoxRef.current;
    if (!box) return;
    const STEP = 0.25;

    setEditablePositions((prev) => {
      if (!prev) return prev;
      const next = prev.map(p => ({ ...p }));
      const stackIndices = getStackSiblings(next, currentIndex);
      const skipSet = new Set(stackIndices);

      if (direction === "z-up" || direction === "z-down") {
        const levels = new Set<number>();
        levels.add(0);
        for (let i = 0; i < next.length; i++) {
          if (skipSet.has(i)) continue;
          levels.add(next[i].z);
          levels.add(next[i].z + next[i].finalH);
        }
        const sorted = [...levels].sort((a, b) => a - b);
        
        const stackBottom = Math.min(...stackIndices.map(si => next[si].z));
        const stackTop = Math.max(...stackIndices.map(si => next[si].z + next[si].finalH));
        const stackHeight = stackTop - stackBottom;

        let targetZ: number | null = null;
        if (direction === "z-up") {
          for (const lvl of sorted) {
            if (lvl > stackBottom + 0.01 && lvl + stackHeight <= box.dimension_h + 0.01) {
              targetZ = lvl;
              break;
            }
          }
        } else {
          for (let i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i] < stackBottom - 0.01 && sorted[i] >= 0) {
              targetZ = sorted[i];
              break;
            }
          }
        }

        if (targetZ == null) {
          toast.error(`Cannot shift — no valid Z level ${direction === "z-up" ? "above" : "below"}`);
          return prev;
        }

        const dz = targetZ - stackBottom;
        for (const si of stackIndices) {
          next[si].z += dz;
        }

        if (hasCollision(next, stackIndices, skipSet)) {
          toast.error("Cannot shift — collision at that Z level");
          return prev;
        }
    } else {
        // Snap-to-boundary logic for X/Y (mirrors Z snap approach)
        const isX = direction === "x+" || direction === "x-";
        const axis: "x" | "y" = isX ? "x" : "y";
        const dimProp: "finalL" | "finalW" = isX ? "finalL" : "finalW";
        const boxMax = isX ? box.dimension_l : box.dimension_w;
        const sign = (direction === "x+" || direction === "y+") ? 1 : -1;

        // Collect boundary edges from box walls and other items
        const edges = new Set<number>();
        edges.add(0);
        edges.add(boxMax);
        for (let i = 0; i < next.length; i++) {
          if (skipSet.has(i)) continue;
          edges.add(next[i][axis]);                    // left/front edge
          edges.add(next[i][axis] + next[i][dimProp]); // right/back edge
        }

        // Current stack extent on this axis
        const stackMin = Math.min(...stackIndices.map(si => next[si][axis]));
        const stackMax = Math.max(...stackIndices.map(si => next[si][axis] + next[si][dimProp]));
        const stackSpan = stackMax - stackMin;

        // Sort boundaries and find the next valid snap target
        const sorted = [...edges].sort((a, b) => a - b);
        let placed = false;

        if (sign > 0) {
          // Moving forward: find smallest boundary > current leading edge
          for (const edge of sorted) {
            if (edge <= stackMax + 0.001) continue;
            // Place stack's trailing edge so its leading edge lands at `edge - stackSpan` … `edge`
            // Actually: snap the stack's leading edge to start at "edge - stackSpan" puts trailing at old, not useful.
            // We want: stack's leading edge flush against this boundary
            // So new stackMin = edge - stackSpan? No — we want to move TOWARD the boundary.
            // The stack's RIGHT edge should land at `edge`, so newMin = edge - stackSpan
            // But if edge is another item's left edge, we want our right edge there.
            // If edge is box wall, same idea.
            const newMin = edge - stackSpan;
            const clampedMin = Math.max(0, Math.min(newMin, boxMax - stackSpan));
            const delta = clampedMin - stackMin;
            if (Math.abs(delta) < 0.001) continue;

            // Apply tentatively
            for (const si of stackIndices) {
              next[si][axis] += delta;
            }
            if (!hasCollision(next, stackIndices, skipSet)) {
              placed = true;
              break;
            }
            // Revert and try next boundary
            for (const si of stackIndices) {
              next[si][axis] -= delta;
            }
          }
        } else {
          // Moving backward: find largest boundary < current trailing edge
          for (let i = sorted.length - 1; i >= 0; i--) {
            const edge = sorted[i];
            if (edge >= stackMin - 0.001) continue;
            // Stack's left/front edge should land at `edge`
            const newMin = edge;
            const clampedMin = Math.max(0, Math.min(newMin, boxMax - stackSpan));
            const delta = clampedMin - stackMin;
            if (Math.abs(delta) < 0.001) continue;

            for (const si of stackIndices) {
              next[si][axis] += delta;
            }
            if (!hasCollision(next, stackIndices, skipSet)) {
              placed = true;
              break;
            }
            for (const si of stackIndices) {
              next[si][axis] -= delta;
            }
          }
        }

        if (!placed) {
          toast.error(`Cannot snap — no valid position ${direction}`);
          return prev;
        }
      }

      return next;
    });
    setHasChanges(true);
  };

  // ─── Center all layers ────────────────────────────────────────────────

  const centerAllLayers = () => {
    if (!editablePositions) return;
    const selected = options[selectedOptionIndex];
    if (!selected?.box) return;
    const box = selected.box;

    setEditablePositions((prev) => {
      if (!prev) return prev;
      const next = prev.map((p) => ({ ...p }));

      // 1. Build stack groups — items sharing same X/Y footprint
      const visited = new Set<number>();
      const stacks: number[][] = []; // each entry is array of indices in one stack
      for (let i = 0; i < next.length; i++) {
        if (visited.has(i)) continue;
        const siblings = getStackSiblings(next, i);
        for (const s of siblings) visited.add(s);
        stacks.push(siblings);
      }

      // 2. Assign each stack to a layer using only its base (lowest Z) item
      const layerMap = new Map<number, number[][]>(); // layerZ -> array of stacks
      for (const stack of stacks) {
        const baseZ = Math.min(...stack.map((i) => next[i].z));
        const roundedZ = Math.round(baseZ * 100) / 100;
        let found = false;
        for (const [key, stackList] of layerMap) {
          if (Math.abs(key - roundedZ) < 0.01) {
            stackList.push(stack);
            found = true;
            break;
          }
        }
        if (!found) layerMap.set(roundedZ, [stack]);
      }

      // 3. Center each layer — collect all item indices belonging to its stacks
      for (const [, stackList] of layerMap) {
        const allIndices = stackList.flat();
        const minX = Math.min(...allIndices.map((i) => next[i].x));
        const maxX = Math.max(...allIndices.map((i) => next[i].x + next[i].finalL));
        const minY = Math.min(...allIndices.map((i) => next[i].y));
        const maxY = Math.max(...allIndices.map((i) => next[i].y + next[i].finalW));

        const offsetX = (box.dimension_l - (maxX - minX)) / 2 - minX;
        const offsetY = (box.dimension_w - (maxY - minY)) / 2 - minY;

        for (const i of allIndices) {
          next[i].x += offsetX;
          next[i].y += offsetY;
        }
      }

      return next;
    });
    setHasChanges(true);
  };

  // ─── Save with correction logging ─────────────────────────────────────

  const saveCorrections = useCallback(async () => {
    if (!editablePositions || !originalPositionsRef.current) {
      toast.error("Nothing to save");
      return;
    }
    const box = editBoxRef.current;
    if (!box) {
      toast.error("No box selected");
      return;
    }

    setIsSaving(true);
    try {
      // Non-critical: log feedback to DB
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .single();

          const origCollapsed = collapseStacks(
            originalPositionsRef.current as any,
            itemWeightMap
          );
          const origProfiles = origCollapsed.map((c, i) => buildItemProfile(c, i));
          const origFeedbackPos = buildFeedbackPositions(
            origCollapsed, origProfiles, box.dimension_l, box.dimension_w
          );
          const origTotalWeight = origProfiles.reduce((s, p) => s + p.weight_oz, 0);
          const origLayerProfiles = buildLayerProfiles(
            origFeedbackPos, origProfiles,
            box.dimension_l, box.dimension_w, origTotalWeight
          );

          const corrCollapsed = collapseStacks(editablePositions as any, itemWeightMap);
          const corrProfiles = corrCollapsed.map((c, i) => buildItemProfile(c, i));
          const corrFeedbackPos = buildFeedbackPositions(
            corrCollapsed, corrProfiles, box.dimension_l, box.dimension_w
          );
          const corrTotalWeight = corrProfiles.reduce((s, p) => s + p.weight_oz, 0);
          const corrLayerProfiles = buildLayerProfiles(
            corrFeedbackPos, corrProfiles,
            box.dimension_l, box.dimension_w, corrTotalWeight
          );

          await supabase.from("packing_feedback").insert({
            company_id: profile?.company_id || null,
            feedback_type: "correction",
            box_dims: {
              l: box.dimension_l,
              w: box.dimension_w,
              h: box.dimension_h,
            },
            algorithm_option_index: 0,
            selected_option_index: selectedOptionIndex,
            item_profiles: origProfiles,
            layer_profiles: origLayerProfiles,
            original_positions: origFeedbackPos,
            corrected_positions: corrFeedbackPos,
            original_layers: origLayerProfiles,
            corrected_layers: corrLayerProfiles,
            created_by: user.id,
          } as any);
        }
      } catch (feedbackErr) {
        console.error("Feedback logging failed:", feedbackErr);
        // Continue -- don't block the save
      }

      // Critical: propagate edited positions to local state and parent
      const updatedPackedItems = editablePositions.map((ep) => ({
        itemId: ep.itemId,
        x: ep.x,
        y: ep.y,
        z: ep.z,
        finalL: ep.finalL,
        finalW: ep.finalW,
        finalH: ep.finalH,
        originalL: ep.originalL,
        originalW: ep.originalW,
        originalH: ep.originalH,
        rotationIndex: ep.rotationIndex,
        packedShape: ep.packedShape,
        isStacked: ep.isStacked,
      }));

      const basePackage = recommendation?.packages[editingPackageIndex ?? 0] ?? options[selectedOptionIndex];
      const updatedResult: PackingResult = {
        ...basePackage,
        packedItems: updatedPackedItems,
      };

      if (options[selectedOptionIndex]) {
        setOptions((prev) => {
          const next = [...prev];
          next[selectedOptionIndex] = updatedResult;
          return next;
        });
      }

      if (recommendation) {
        const updatedPackages = [...recommendation.packages];
        const pkgIdx = editingPackageIndex ?? updatedPackages.findIndex(p => !p.isSelfPackaged);
        if (pkgIdx >= 0) {
          updatedPackages[pkgIdx] = updatedResult;
        }
        setRecommendation({ ...recommendation, packages: updatedPackages });
        onPackingComplete({ mode: "auto", packages: updatedPackages });
      }

      // Exit edit mode on success
      setIsEditing(false);
      setHasChanges(false);
      setSelectedItemIndex(null);
      toast.success("Packing corrections saved");
    } catch (err) {
      console.error("Failed to save corrections:", err);
      toast.error("Failed to save corrections");
      // Edit mode stays open so user can retry
    } finally {
      setIsSaving(false);
    }
  }, [editablePositions, options, selectedOptionIndex, itemWeightMap, recommendation, editingPackageIndex, onPackingComplete]);

  // ─── Option selection ─────────────────────────────────────────────────

  const handleOptionSelect = useCallback((index: number) => {
    setSelectedOptionIndex(index);
    exitEditMode();
    const selected = options[index];
    if (selected) {
      logSelectionFeedback(index);
      if (recommendation) {
        const updatedPackages = [...recommendation.packages];
        const primaryIdx = updatedPackages.findIndex(p => !p.isSelfPackaged);
        if (primaryIdx >= 0) updatedPackages[primaryIdx] = selected;
        onPackingComplete({ mode: "auto", packages: updatedPackages });
      }
    }
  }, [options, recommendation, onPackingComplete]);

  const logSelectionFeedback = async (selectedIndex: number) => {
    try {
      const selected = options[selectedIndex];
      if (!selected?.box || selected.packedItems.length === 0) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      const collapsed = collapseStacks(selected.packedItems, itemWeightMap);
      const profiles = collapsed.map((c, i) => buildItemProfile(c, i));
      const feedbackPositions = buildFeedbackPositions(
        collapsed, profiles, selected.box.dimension_l, selected.box.dimension_w
      );
      const totalWeight = profiles.reduce((s, p) => s + p.weight_oz, 0);
      const layerProfiles = buildLayerProfiles(
        feedbackPositions, profiles,
        selected.box.dimension_l, selected.box.dimension_w, totalWeight
      );

      await supabase.from("packing_feedback").insert({
        company_id: profile?.company_id || null,
        feedback_type: "selection",
        box_dims: {
          l: selected.box.dimension_l,
          w: selected.box.dimension_w,
          h: selected.box.dimension_h,
        },
        algorithm_option_index: 0,
        selected_option_index: selectedIndex,
        item_profiles: profiles,
        layer_profiles: layerProfiles,
        original_positions: feedbackPositions,
        original_layers: layerProfiles,
        created_by: user.id,
      } as any);
    } catch (err) {
      console.error("Failed to log selection feedback:", err);
    }
  };

  // ─── Data fetching ────────────────────────────────────────────────────

  const fetchPackingData = async () => {
    try {
      const physicalItems = orderItems.filter((i) => i.item_type !== "labor");
      const inventoryIds = physicalItems.filter((i) => i.inventory_item_id).map((i) => i.inventory_item_id!);
      const assemblyIds = physicalItems.filter((i) => i.assembly_id).map((i) => i.assembly_id!);

      const [invRes, asmRes, boxRes, paperRes] = await Promise.all([
        inventoryIds.length > 0
          ? supabase
              .from("inventory_items")
              .select("id, sku, packed_dimension_l, packed_dimension_w, packed_dimension_h, weight_oz, ships_in_own_packaging, packed_shape, packed_diameter, actual_packed_volume_cubic_inches, paper_thickness_top, paper_thickness_bottom, paper_thickness_left, paper_thickness_right, paper_thickness_front, paper_thickness_back, paper_thickness_side, paper_thickness_uniform, always_ship_stacked, max_stack_quantity")
              .in("id", inventoryIds)
          : { data: [], error: null },
        assemblyIds.length > 0
          ? supabase
              .from("assemblies")
              .select("id, sku, packed_dimension_l, packed_dimension_w, packed_dimension_h, weight_oz, ships_in_own_packaging, packed_shape, packed_diameter, actual_packed_volume_cubic_inches, paper_thickness_top, paper_thickness_bottom, paper_thickness_left, paper_thickness_right, paper_thickness_front, paper_thickness_back, paper_thickness_side, paper_thickness_uniform, always_ship_stacked, max_stack_quantity")
              .in("id", assemblyIds)
          : { data: [], error: null },
        supabase.from("box_sizes").select("*").eq("is_active", true),
        supabase.from("packing_papers").select("cubic_inches_per_linear_inch, weight_oz_per_foot, cost_per_foot, shipping_cost_multiplier").eq("is_active", true).limit(1).single(),
      ]);

      if (boxRes.error) throw boxRes.error;
      setBoxes(boxRes.data || []);

      if (paperRes.error || !paperRes.data) {
        setPaperError(true);
      } else {
        setPaperConfig({
          cubicInchesPerInch: paperRes.data.cubic_inches_per_linear_inch,
          weightOzPerFoot: paperRes.data.weight_oz_per_foot,
          costPerFoot: paperRes.data.cost_per_foot,
          shippingCostMultiplier: paperRes.data.shipping_cost_multiplier,
        });
      }

      const dimLookup: Record<string, any> = {};
      (invRes.data || []).forEach((r) => (dimLookup[r.id] = r));
      (asmRes.data || []).forEach((r) => (dimLookup[r.id] = r));

      const missing: string[] = [];
      const names: Record<string, string> = {};
      const weights: Record<string, number> = {};
      const packable: PackableItem[] = [];

      for (const oi of physicalItems) {
        const itemId = oi.inventory_item_id || oi.assembly_id;
        if (!itemId) continue;
        const dims = dimLookup[itemId];
        if (!dims) {
          missing.push(oi.item_sku || oi.item_name);
          continue;
        }

        names[itemId] = oi.item_sku || oi.item_name;
        weights[itemId] = dims.weight_oz || 0;

        if (!dims.packed_dimension_l || !dims.packed_dimension_w || !dims.packed_dimension_h) {
          missing.push(oi.item_sku || oi.item_name);
          continue;
        }

        packable.push({
          id: itemId,
          name: oi.item_sku || oi.item_name,
          packed_dimension_l: dims.packed_dimension_l,
          packed_dimension_w: dims.packed_dimension_w,
          packed_dimension_h: dims.packed_dimension_h,
          weight_oz: dims.weight_oz || 0,
          quantity: oi.quantity_ordered,
          ships_in_own_packaging: dims.ships_in_own_packaging,
          always_ship_stacked: dims.always_ship_stacked,
          max_stack_quantity: dims.max_stack_quantity,
          packed_shape: dims.packed_shape,
          packed_diameter: dims.packed_diameter,
          actual_packed_volume: dims.actual_packed_volume_cubic_inches,
          paper_thickness_top: dims.paper_thickness_top,
          paper_thickness_bottom: dims.paper_thickness_bottom,
          paper_thickness_left: dims.paper_thickness_left,
          paper_thickness_right: dims.paper_thickness_right,
          paper_thickness_front: dims.paper_thickness_front,
          paper_thickness_back: dims.paper_thickness_back,
          paper_thickness_side: dims.paper_thickness_side,
          paper_thickness_uniform: dims.paper_thickness_uniform,
        });
      }

      setMissingDimensionItems(missing);
      setPackableItems(packable);
      setItemNameMap(names);
      setItemWeightMap(weights);
    } catch (err) {
      console.error("Error fetching packing data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Global SKU color map (consistent colors across all boxes) ─────
  const globalSkuColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const seen: string[] = [];
    const nameToColor: Record<string, string> = {};
    const pkgs = recommendation?.packages || [];
    pkgs.forEach(pkg =>
      pkg.packedItems.forEach(item => {
        const baseId = getBaseId(item.itemId);
        if (!map[baseId]) {
          const skuName = itemNameMap[baseId] || baseId;
          if (nameToColor[skuName]) {
            map[baseId] = nameToColor[skuName];
          } else {
            const color = ITEM_COLORS[seen.length % ITEM_COLORS.length];
            map[baseId] = color;
            nameToColor[skuName] = color;
            seen.push(baseId);
          }
        }
      })
    );
    return map;
  }, [recommendation?.packages, itemNameMap]);

  // Force-recalculate handler: clears saved config and re-runs the algorithm
  const forceRecalculate = useCallback(() => {
    stableInitialConfig.current = null;
    initialConsumedRef.current = false;
    skipAlgorithmRef.current = false;
    if (boxes.length > 0 && packableItems.length > 0 && missingDimensionItems.length === 0 && paperConfig !== null) {
      const opts = { paperCubicInchesPerInch: paperConfig.cubicInchesPerInch, paperWeightOzPerFoot: paperConfig.weightOzPerFoot, paperCostPerFoot: paperConfig.costPerFoot, paperShippingCostMultiplier: paperConfig.shippingCostMultiplier };
      const rec = getSmartMultiBoxRecommendation(packableItems, boxes, opts);
      console.log(`[Packing] RECALCULATE: Algorithm produced ${rec.packages.length} package(s):`,
        rec.packages.map((p, i) => `Box ${i+1}: ${p.box?.name} with ${p.packedItems.length} items`)
      );
      setRecommendation(rec);
      const multiOptions = getMultiOptionRecommendation(packableItems, boxes, opts);
      setOptions(multiOptions);
      setSelectedOptionIndex(0);
      skipAlgorithmRef.current = true;
      onPackingComplete({ mode: "auto", packages: rec.packages });
      toast.success("Packing recalculated from scratch");
    }
  }, [boxes, packableItems, missingDimensionItems, onPackingComplete, paperConfig]);

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Analyzing items for packing...</span>
      </div>
    );
  }

  if (paperError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No active packing paper configured.{" "}
            <a href="/settings" className="underline">
              Add one in Settings &gt; Shipping Materials
            </a>{" "}
            before packing.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (missingDimensionItems.length > 0) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Missing Packed Dimensions</AlertTitle>
          <AlertDescription>
            The following items are missing packed dimensions, so automatic box selection cannot be used:
            <ul className="mt-2 list-disc list-inside text-sm">
              {missingDimensionItems.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Manual Box Selection
          </h3>
          <div className="space-y-2">
            <Label>Select Box Size</Label>
            <Select value={manualBoxId} onValueChange={setManualBoxId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a box..." />
              </SelectTrigger>
              <SelectContent>
                {boxes.map((box) => (
                  <SelectItem key={box.id} value={box.id}>
                    {box.name} — {box.dimension_l}×{box.dimension_w}×{box.dimension_h}"
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Package Weight (oz)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={manualWeightOz || ""}
              onChange={(e) => setManualWeightOz(parseFloat(e.target.value) || 0)}
              placeholder="Total package weight in ounces"
            />
          </div>
          {manualBoxId && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border text-sm">
              <Scale className="h-4 w-4 text-muted-foreground" />
              <span>
                Total weight:{" "}
                <strong>
                  {formatWeight(manualWeightOz + (boxes.find((b) => b.id === manualBoxId)?.weight_oz ?? 0))}
                </strong>
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }


  if (!recommendation) {
    return (
      <Alert>
        <Package className="h-4 w-4" />
        <AlertDescription>No packable items found.</AlertDescription>
      </Alert>
    );
  }

  const { packages } = recommendation;
  const unpackedItems = (recommendation as any).unpackedItems || [];

  const globalMaxDim = packages.length > 1
    ? Math.max(...packages.filter(p => p.box).map(p => Math.max(p.box!.dimension_l, p.box!.dimension_w, p.box!.dimension_h)))
    : undefined;



  if (packages.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Suitable Boxes Found</AlertTitle>
        <AlertDescription>
          No combination of available boxes can fit these items. Check your{" "}
          <a href="/settings" className="underline font-medium">box sizes in Settings</a>.
        </AlertDescription>
      </Alert>
    );
  }

  const selectedOption = options[selectedOptionIndex];


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {packages.length > 1 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
            <Boxes className="h-5 w-5 text-primary" />
            <span className="font-medium">
              {packages.length} package{packages.length !== 1 ? "s" : ""} recommended
            </span>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={forceRecalculate}
          className="gap-1 ml-auto"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Recalculate
        </Button>
      </div>

      {packages.map((pkg, idx) => {
        const displayPkg = pkg;

        return (
          <div key={idx} className="space-y-2">
            {/* Package stats card — always shown */}
            <PackageCard
              result={displayPkg}
              packageNumber={packages.length > 1 ? idx + 1 : undefined}
              compact={packages.length > 2}
              paperCubicInchesPerInch={paperConfig!.cubicInchesPerInch}
            />

            {displayPkg.box && displayPkg.packedItems.length > 0 && !displayPkg.isSelfPackaged && (
              <div className="space-y-2">
                {(() => {
                  const isThisEditing = isEditing && editingPackageIndex === idx;
                  return (
                    <>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <PackingEditToolbar
                          isEditing={isThisEditing}
                          onToggleEdit={() => {
                            if (isThisEditing) {
                              exitEditMode();
                            } else {
                              if (isEditing) exitEditMode();
                              enterEditMode(displayPkg, idx);
                            }
                          }}
                          onReset={resetEditMode}
                          onSave={saveCorrections}
                          hasChanges={hasChanges}
                          isSaving={isSaving}
                        />

                        {isThisEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={centerAllLayers}
                            title="Center all layers within the box"
                          >
                            <AlignCenterHorizontal className="h-3 w-3" />
                            Center Layers
                          </Button>
                        )}

                        {/* Rotation & Shift buttons when item selected in edit mode */}
                        {isThisEditing && selectedItemIndex != null && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground mr-1">Rotate:</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => rotateSelectedItem("y")}
                                title="Spin (swap L↔W)"
                              >
                                <RotateCw className="h-3 w-3" /> L↔W
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => rotateSelectedItem("x")}
                                title="Tip (swap W↔H)"
                              >
                                <RotateCw className="h-3 w-3" /> W↔H
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => rotateSelectedItem("z")}
                                title="Roll (swap L↔H)"
                              >
                                <RotateCw className="h-3 w-3" /> L↔H
                              </Button>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground mr-1">Shift:</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => shiftSelectedItem("x-")}
                                title="Nudge left (X−)"
                              >
                                <ArrowLeft className="h-3 w-3" /> X
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => shiftSelectedItem("x+")}
                                title="Nudge right (X+)"
                              >
                                <ArrowRight className="h-3 w-3" /> X
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => shiftSelectedItem("y-")}
                                title="Nudge back (Y−)"
                              >
                                <ArrowUp className="h-3 w-3" /> Y
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => shiftSelectedItem("y+")}
                                title="Nudge forward (Y+)"
                              >
                                <ArrowDown className="h-3 w-3" /> Y
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => shiftSelectedItem("z-up")}
                                title="Snap Z up"
                              >
                                <ArrowUp className="h-3 w-3" /> Z↑
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => shiftSelectedItem("z-down")}
                                title="Snap Z down"
                              >
                                <ArrowDown className="h-3 w-3" /> Z↓
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      <BoxPackingVisualization
                        box={displayPkg.box}
                        packedItems={displayPkg.packedItems}
                        itemNames={itemNameMap}
                        globalMaxDim={globalMaxDim}
                        skuColorMap={globalSkuColorMap}
                        editable={isThisEditing}
                        editablePositions={isThisEditing ? (editablePositions || undefined) : undefined}
                        selectedItemIndex={isThisEditing ? selectedItemIndex : null}
                        onSelectItem={isThisEditing ? setSelectedItemIndex : undefined}
                        selectedStackIndices={isThisEditing && selectedItemIndex != null && editablePositions
                          ? new Set(getStackSiblings(editablePositions, selectedItemIndex))
                          : undefined}
                      />
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}

      {unpackedItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Packing Incomplete</AlertTitle>
          <AlertDescription>
            <p>{unpackedItems.length} item(s) could not be automatically packed and may need manual handling:</p>
            <ul className="mt-2 list-disc list-inside text-sm">
              {unpackedItems.map((item: any, i: number) => (
                <li key={i}>{item.name || item.id} ×{item.quantity}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
