import { useState, lazy, Suspense, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShapeSelector } from "./ShapeSelector";
import { ShapeDimensionInputs } from "./ShapeDimensionInputs";
import { PackingPaperInputs } from "./PackingPaperInputs";
import { Shape2DPreview } from "./Shape2DPreview";
import { type PackedShape, type PaperThicknesses, getShapeVolume, getConstraintDimensions, type ShapeItem } from "@/lib/shape-volume-utils";

const PackedDimensionModeler = lazy(() => import("./PackedDimensionModeler").then(m => ({ default: m.PackedDimensionModeler })));

interface PackedShapeEditorProps {
  shape: PackedShape;
  packedL: string;
  packedW: string;
  packedH: string;
  packedDiameter: string;
  actualPackedVolume: string;
  paperValues: PaperThicknesses;
  onShapeChange: (shape: PackedShape) => void;
  onDimensionChange: (field: string, value: string) => void;
  onVolumeOverrideChange: (value: string) => void;
  onPaperChange: (field: keyof PaperThicknesses, value: number) => void;
}

/**
 * Determines whether all required dimensions are set for a shape to render in 3D.
 */
function hasAllDimensions(shape: PackedShape, L: number, W: number, H: number, D: number): boolean {
  switch (shape) {
    case 'box': return L > 0 && W > 0 && H > 0;
    case 'cylinder': return D > 0 && H > 0;
    case 'cone': return D > 0 && H > 0;
    case 'sphere': return D > 0;
    case 'triangular_prism': return L > 0 && W > 0 && H > 0;
    default: return false;
  }
}

/**
 * Returns the first 1-2 entered dimensions for 2D preview.
 */
function getPartialDims(shape: PackedShape, L: number, W: number, H: number, D: number): [number | null, number | null] {
  switch (shape) {
    case 'box':
    case 'triangular_prism':
      return [L || null, H || null];
    case 'cylinder':
    case 'cone':
      return [D || null, H || null];
    case 'sphere':
      return [D || null, null];
    default:
      return [null, null];
  }
}

export function PackedShapeEditor({
  shape, packedL, packedW, packedH, packedDiameter,
  actualPackedVolume, paperValues,
  onShapeChange, onDimensionChange, onVolumeOverrideChange, onPaperChange,
}: PackedShapeEditorProps) {
  const [highlightedFace, setHighlightedFace] = useState<string | null>(null);

  const L = parseFloat(packedL) || 0;
  const W = parseFloat(packedW) || 0;
  const H = parseFloat(packedH) || 0;
  const D = parseFloat(packedDiameter) || 0;

  const allDimsSet = hasAllDimensions(shape, L, W, H, D);
  const [dimA, dimB] = getPartialDims(shape, L, W, H, D);
  const hasSomeDims = (dimA !== null && dimA > 0) || (dimB !== null && dimB > 0);

  const shapeItem: ShapeItem = useMemo(() => ({
    packed_shape: shape,
    packed_dimension_l: L,
    packed_dimension_w: W,
    packed_dimension_h: H,
    packed_diameter: D,
    actual_packed_volume_cubic_inches: actualPackedVolume ? parseFloat(actualPackedVolume) : null,
    ...paperValues,
  }), [shape, L, W, H, D, actualPackedVolume, paperValues]);

  const calcVol = getShapeVolume(shapeItem);
  const constraintDims = getConstraintDimensions(shapeItem);
  const hasConstraint = constraintDims.length > 0 || constraintDims.width > 0 || constraintDims.height > 0;

  const handleDimFieldChange = (field: string, value: number | null) => {
    if (field === 'packed_diameter') {
      onDimensionChange('packed_diameter', value?.toString() || '');
    } else if (field === 'packed_dimension_l') {
      onDimensionChange('packed_length', value?.toString() || '');
    } else if (field === 'packed_dimension_w') {
      onDimensionChange('packed_width', value?.toString() || '');
    } else if (field === 'packed_dimension_h') {
      onDimensionChange('packed_depth', value?.toString() || '');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Shape Selector Cards */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Packed Shape</Label>
        <ShapeSelector value={shape} onChange={onShapeChange} />
      </div>

      {/* 2. Shape-specific dimension inputs */}
      <ShapeDimensionInputs
        shape={shape}
        packedL={L || null}
        packedW={W || null}
        packedH={H || null}
        packedDiameter={D || null}
        onChange={handleDimFieldChange}
      />

      {/* 3. Progressive viewer: 2D when partial, 3D when complete */}
      {!allDimsSet && hasSomeDims && (
        <Shape2DPreview
          shape={shape}
          dimA={dimA}
          dimB={dimB}
          highlightedFace={highlightedFace}
        />
      )}

      {allDimsSet && (
        <Suspense fallback={
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm border rounded-lg bg-muted/20">
            Loading 3D viewer...
          </div>
        }>
          <PackedDimensionModeler item={shapeItem} highlightedFace={highlightedFace} />
        </Suspense>
      )}

      {/* 4. Calculated volume */}
      {calcVol > 0 && (
        <div className="p-2.5 bg-muted rounded-lg text-xs flex items-center justify-between">
          <span className="text-muted-foreground">Shape volume:</span>
          <span className="font-mono font-medium">{calcVol.toFixed(2)} in³</span>
        </div>
      )}

      {/* Volume override */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Volume Override (in³)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          className="h-8 text-xs"
          placeholder="Leave blank to auto-calculate"
          value={actualPackedVolume}
          onChange={(e) => onVolumeOverrideChange(e.target.value)}
        />
      </div>

      {/* 5. Packing paper with hover highlighting */}
      <PackingPaperInputs
        shape={shape}
        values={paperValues}
        onChange={onPaperChange}
        highlightedFace={highlightedFace}
        onSurfaceHover={setHighlightedFace}
      />

      {/* 6. Constraint dimensions summary */}
      {hasConstraint && (
        <div className="p-2.5 bg-muted rounded-lg text-xs flex items-center justify-between">
          <span className="text-muted-foreground">Constraint (for boxing):</span>
          <span className="font-mono font-medium text-orange-600">
            {constraintDims.length.toFixed(2)}" × {constraintDims.width.toFixed(2)}" × {constraintDims.height.toFixed(2)}"
          </span>
        </div>
      )}
    </div>
  );
}
