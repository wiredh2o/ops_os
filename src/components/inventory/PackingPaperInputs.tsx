import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SHAPE_SURFACES, SURFACE_LABELS, type PackedShape, type PaperThicknesses } from "@/lib/shape-volume-utils";
import { cn } from "@/lib/utils";

interface PackingPaperInputsProps {
  shape: PackedShape;
  values: PaperThicknesses;
  onChange: (field: keyof PaperThicknesses, value: number) => void;
  highlightedFace?: string | null;
  onSurfaceHover?: (surface: string | null) => void;
}

export function PackingPaperInputs({ shape, values, onChange, highlightedFace, onSurfaceHover }: PackingPaperInputsProps) {
  const surfaces = SHAPE_SURFACES[shape] || SHAPE_SURFACES.box;

  const fieldKey = (surface: string): keyof PaperThicknesses =>
    `paper_thickness_${surface}` as keyof PaperThicknesses;

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Packing Paper Cushioning (inches)</Label>
      <div className="grid grid-cols-2 gap-2">
        {surfaces.map((surface) => {
          const key = fieldKey(surface);
          const isHighlighted = highlightedFace === surface;
          return (
            <div
              key={surface}
              className={cn(
                "flex items-center gap-2 p-1.5 rounded-md transition-colors duration-200",
                isHighlighted && "bg-cyan-500/10 ring-1 ring-cyan-500/30"
              )}
              onMouseEnter={() => onSurfaceHover?.(surface)}
              onMouseLeave={() => onSurfaceHover?.(null)}
            >
              <div className={cn(
                "w-2 h-2 rounded-full shrink-0 transition-colors",
                isHighlighted ? "bg-cyan-500" : "bg-muted-foreground/30"
              )} />
              <Label className="text-xs w-20 shrink-0">{SURFACE_LABELS[surface]}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="h-8 text-xs"
                value={values[key] ?? 0}
                onChange={(e) => onChange(key, parseFloat(e.target.value) || 0)}
                onFocus={() => onSurfaceHover?.(surface)}
                onBlur={() => onSurfaceHover?.(null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
