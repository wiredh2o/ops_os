import { useState, useMemo, useCallback, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Edges } from "@react-three/drei";
import type { BoxSize, PackedItemPosition } from "@/lib/box-packing-utils";
import { WedgeGeometry } from "./WedgeGeometry";

/** Editable position used in edit mode — mutable copy of PackedItemPosition */
export interface EditablePosition {
  itemId: string;
  x: number;
  y: number;
  z: number;
  finalL: number;
  finalW: number;
  finalH: number;
  originalL: number;
  originalW: number;
  originalH: number;
  rotationIndex: number;
  packedShape?: any;
  isStacked?: boolean;
  pairedMirror?: boolean;
}

interface BoxPackingVisualizationProps {
  box: BoxSize;
  packedItems: PackedItemPosition[];
  itemNames: Record<string, string>;
  globalMaxDim?: number;
  className?: string;
  editable?: boolean;
  editablePositions?: EditablePosition[];
  selectedItemIndex?: number | null;
  onSelectItem?: (index: number | null) => void;
  selectedStackIndices?: Set<number>;
  skuColorMap?: Record<string, string>;
}

export const ITEM_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, max));
}

export function getBaseId(itemId: string) {
  return itemId.replace(/-\d+$/, "").replace(/__nested$/, "");
}

// ─── Read-only item (no drag) ───────────────────────────────────────────────

// ─── Read-only item (no drag) ───────────────────────────────────────────────

function PackedItem({
  position,
  color,
  box,
  onHover,
}: {
  position: PackedItemPosition;
  color: string;
  box: BoxSize;
  onHover: (baseId: string | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const geoL = position.finalL;
  const geoW = position.finalW;
  const geoH = position.finalH;
  const baseId = getBaseId(position.itemId);

  const posX = clamp(position.x + geoL / 2, geoL / 2, box.dimension_l - geoL / 2);
  const posY = clamp(position.z + geoH / 2, geoH / 2, box.dimension_h - geoH / 2);
  const posZ = clamp(position.y + geoW / 2, geoW / 2, box.dimension_w - geoW / 2);

  const isWedge = position.packedShape === 'triangular_prism';

  return (
    <mesh
      position={[posX, posY, posZ]}
      rotation={isWedge && position.pairedMirror ? [Math.PI, 0, 0] : undefined}
      renderOrder={1}
      onPointerOver={(e) => { e.stopPropagation(); if (e.intersections[0]?.object !== e.eventObject) return; setHovered(true); onHover(baseId); }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); onHover(null); }}
    >
      {isWedge ? (
        <WedgeGeometry l={geoL} w={geoW} h={geoH} mirrored={position.pairedMirror} />
      ) : (
        <boxGeometry args={[geoL, geoH, geoW]} />
      )}
      <meshStandardMaterial
        color={color}
        transparent
        opacity={hovered ? 0.9 : 0.7}
        depthWrite
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
      <Edges color={hovered ? "#ffffff" : "#000000"} lineWidth={hovered ? 2 : 1} />
    </mesh>
  );
}

// ─── Orbit controls wrapper ─────────────────────────────────────────────────

function ControlledOrbit({ enabled, box, maxDim }: { enabled: boolean; box: BoxSize; maxDim: number }) {
  return (
    <OrbitControls
      enabled={enabled}
      target={[box.dimension_l / 2, box.dimension_h / 2, box.dimension_w / 2]}
      enablePan
      minDistance={maxDim * 0.5}
      maxDistance={maxDim * 5}
    />
  );
}

// ─── Box wireframe ──────────────────────────────────────────────────────────

function BoxWireframe({ box, editable }: { box: BoxSize; editable?: boolean }) {
  const { dimension_l: l, dimension_w: w, dimension_h: h } = box;
  return (
    <mesh position={[l / 2, h / 2, w / 2]} renderOrder={0}>
      <boxGeometry args={[l, h, w]} />
      <meshBasicMaterial transparent opacity={0.03} color="#888888" depthWrite={false} />
      <Edges color={editable ? "#ef4444" : "#666666"} lineWidth={editable ? 3 : 1.5} />
    </mesh>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function BoxPackingVisualization({
  box,
  packedItems,
  itemNames,
  globalMaxDim,
  className,
  editable = false,
  editablePositions,
  selectedItemIndex,
  onSelectItem,
  selectedStackIndices,
  skuColorMap,
}: BoxPackingVisualizationProps) {
  const [hoveredBaseId, setHoveredBaseId] = useState<string | null>(null);

  const colorMap = useMemo(() => {
    if (skuColorMap && Object.keys(skuColorMap).length > 0) return skuColorMap;
    const map: Record<string, string> = {};
    const seen: string[] = [];
    const items = editablePositions || packedItems;
    items.forEach((p) => {
      const baseId = getBaseId(p.itemId);
      if (!map[baseId]) {
        map[baseId] = ITEM_COLORS[seen.length % ITEM_COLORS.length];
        seen.push(baseId);
      }
    });
    return map;
  }, [packedItems, editablePositions, skuColorMap]);

  const skuCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const items = editablePositions || packedItems;
    items.forEach((p) => {
      const baseId = getBaseId(p.itemId);
      counts[baseId] = (counts[baseId] || 0) + 1;
    });
    return counts;
  }, [packedItems, editablePositions]);

  const maxDim = globalMaxDim ?? Math.max(box.dimension_l, box.dimension_w, box.dimension_h);

  const handleCanvasClick = useCallback(() => {
    if (editable) onSelectItem?.(null);
  }, [editable, onSelectItem]);

  // Tooltip info
  const hoveredName = hoveredBaseId ? (itemNames[hoveredBaseId] || hoveredBaseId) : null;
  const hoveredCount = hoveredBaseId ? (skuCounts[hoveredBaseId] || 0) : 0;

  // Selected item dims for edit mode
  const selectedItem = editable && selectedItemIndex != null && editablePositions
    ? editablePositions[selectedItemIndex]
    : null;
  const selectedBaseId = selectedItem ? getBaseId(selectedItem.itemId) : null;
  const isStackSelection = selectedStackIndices && selectedStackIndices.size > 1;
  const stackTotalHeight = isStackSelection && editablePositions
    ? Array.from(selectedStackIndices).reduce((sum, i) => sum + editablePositions[i].finalH, 0)
    : null;

  return (
    <div
      className={cn(
        "w-full rounded-lg overflow-hidden relative",
        editable
          ? "bg-primary/5 border-2 border-primary/50 h-[320px] ring-2 ring-primary/20"
          : "bg-muted/20 border h-[280px]",
        className
      )}
    >
      {/* Edit mode banner */}
      {editable && (
        <div className="absolute top-2 left-2 z-20 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-md shadow-md pointer-events-none flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
          {isStackSelection
            ? `Stack selected (${selectedStackIndices!.size} items)`
            : "Edit Mode — Click to select"}
        </div>
      )}

      {/* Hover tooltip — right side */}
      {hoveredBaseId && hoveredName && (
        <div className="absolute top-2 right-2 z-20 bg-popover/95 text-popover-foreground text-xs px-3 py-2 rounded border shadow-md pointer-events-none space-y-0.5">
          <div className="font-medium">{hoveredName}</div>
          <div className="text-muted-foreground">Qty in box: {hoveredCount}</div>
        </div>
      )}

      {/* Selected item info — right side, below tooltip */}
      {editable && selectedItem && !hoveredBaseId && (
        <div className="absolute top-2 right-2 z-20 bg-popover/95 text-popover-foreground text-xs px-3 py-2 rounded border shadow-md pointer-events-none space-y-0.5">
          <div className="font-medium">{itemNames[selectedBaseId!] || selectedItem.itemId}</div>
          {isStackSelection ? (
            <div className="text-muted-foreground">
              Stack: {selectedStackIndices!.size} items • Total H: {stackTotalHeight!.toFixed(2)}"
            </div>
          ) : (
            <div className="text-muted-foreground">
              {selectedItem.finalL}×{selectedItem.finalW}×{selectedItem.finalH}"
            </div>
          )}
        </div>
      )}

      <div className="absolute inset-0 z-0">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading 3D viewer...
          </div>
        }
      >
        <Canvas
          style={{ width: "100%", height: "100%", position: "relative", zIndex: 0 }}
          resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
          frameloop="demand"
          camera={{
            position: [maxDim * 1.5, maxDim * 1.2, maxDim * 1.5],
            fov: 45,
          }}
          onPointerMissed={handleCanvasClick}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <BoxWireframe box={box} editable={editable} />

          {editable && editablePositions
            ? editablePositions.map((item, i) => {
                const baseId = getBaseId(item.itemId);
                const geoL = item.finalL;
                const geoW = item.finalW;
                const geoH = item.finalH;
                const posX = clamp(item.x + geoL / 2, geoL / 2, box.dimension_l - geoL / 2);
                const posY = clamp(item.z + geoH / 2, geoH / 2, box.dimension_h - geoH / 2);
                const posZ = clamp(item.y + geoW / 2, geoW / 2, box.dimension_w - geoW / 2);
                const isWedge = item.packedShape === 'triangular_prism';
                return (
                  <mesh
                    key={`${item.itemId}-edit-${i}`}
                    position={[posX, posY, posZ]}
                    rotation={isWedge && item.pairedMirror ? [Math.PI, 0, 0] : undefined}
                    renderOrder={1}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.intersections[0]?.object !== e.eventObject) return;
                      onSelectItem?.(i);
                    }}
                    onPointerOver={(e) => { e.stopPropagation(); if (e.intersections[0]?.object !== e.eventObject) return; setHoveredBaseId(baseId); }}
                    onPointerOut={(e) => { e.stopPropagation(); setHoveredBaseId(null); }}
                  >
                    {isWedge ? (
                      <WedgeGeometry l={geoL} w={geoW} h={geoH} mirrored={item.pairedMirror} />
                    ) : (
                      <boxGeometry args={[geoL, geoH, geoW]} />
                    )}
                    <meshStandardMaterial
                      color={colorMap[baseId] || ITEM_COLORS[0]}
                      transparent
                      opacity={selectedStackIndices?.has(i) ? 0.95 : 0.65}
                      depthWrite
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-1}
                    />
                    <Edges
                      color={selectedStackIndices?.has(i) ? "#facc15" : "#555555"}
                      lineWidth={selectedStackIndices?.has(i) ? 3 : 1}
                    />
                  </mesh>
                );
              })
            : packedItems.map((item, i) => {
                const baseId = getBaseId(item.itemId);
                return (
                  <PackedItem
                    key={`${item.itemId}-${i}`}
                    position={item}
                    color={colorMap[baseId] || ITEM_COLORS[0]}
                    box={box}
                    onHover={setHoveredBaseId}
                  />
                );
              })}

          <ControlledOrbit enabled box={box} maxDim={maxDim} />
        </Canvas>
      </Suspense>
      </div>
    </div>
  );
}
