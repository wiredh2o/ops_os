import { cn } from "@/lib/utils";
import type { PackedShape } from "@/lib/shape-volume-utils";
import { SHAPE_LABELS } from "@/lib/shape-volume-utils";

interface ShapeSelectorProps {
  value: PackedShape;
  onChange: (shape: PackedShape) => void;
}

function ShapeIcon({ shape, selected }: { shape: PackedShape; selected: boolean }) {
  const stroke = selected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
  const fill = selected ? "hsl(var(--primary) / 0.1)" : "none";

  switch (shape) {
    case 'box':
      return (
        <svg viewBox="0 0 64 64" className="w-10 h-10">
          {/* Isometric box */}
          <polygon points="32,8 56,20 56,44 32,56 8,44 8,20" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <line x1="32" y1="32" x2="32" y2="56" stroke={stroke} strokeWidth="1.5" />
          <line x1="32" y1="32" x2="56" y2="20" stroke={stroke} strokeWidth="1.5" />
          <line x1="32" y1="32" x2="8" y2="20" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
    case 'cylinder':
      return (
        <svg viewBox="0 0 64 64" className="w-10 h-10">
          <ellipse cx="32" cy="16" rx="20" ry="8" fill={fill} stroke={stroke} strokeWidth="2" />
          <line x1="12" y1="16" x2="12" y2="48" stroke={stroke} strokeWidth="2" />
          <line x1="52" y1="16" x2="52" y2="48" stroke={stroke} strokeWidth="2" />
          <ellipse cx="32" cy="48" rx="20" ry="8" fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'cone':
      return (
        <svg viewBox="0 0 64 64" className="w-10 h-10">
          <line x1="32" y1="8" x2="12" y2="48" stroke={stroke} strokeWidth="2" />
          <line x1="32" y1="8" x2="52" y2="48" stroke={stroke} strokeWidth="2" />
          <ellipse cx="32" cy="48" rx="20" ry="8" fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'sphere':
      return (
        <svg viewBox="0 0 64 64" className="w-10 h-10">
          <circle cx="32" cy="32" r="22" fill={fill} stroke={stroke} strokeWidth="2" />
          <ellipse cx="32" cy="32" rx="22" ry="8" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="3 2" />
          <ellipse cx="32" cy="32" rx="8" ry="22" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="3 2" />
        </svg>
      );
    case 'triangular_prism':
      return (
        <svg viewBox="0 0 64 64" className="w-10 h-10">
          {/* Front triangle */}
          <polygon points="20,52 44,52 32,16" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          {/* Back triangle (offset) */}
          <line x1="32" y1="16" x2="40" y2="10" stroke={stroke} strokeWidth="1.5" />
          <line x1="44" y1="52" x2="52" y2="46" stroke={stroke} strokeWidth="1.5" />
          <line x1="40" y1="10" x2="52" y2="46" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );
  }
}

const SHAPES: PackedShape[] = ['box', 'cylinder', 'cone', 'sphere', 'triangular_prism'];

export function ShapeSelector({ value, onChange }: ShapeSelectorProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {SHAPES.map((shape) => {
        const selected = value === shape;
        return (
          <button
            key={shape}
            type="button"
            onClick={() => onChange(shape)}
            className={cn(
              "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all duration-200",
              "hover:border-primary/50 hover:bg-primary/5",
              selected
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-border bg-card"
            )}
          >
            <ShapeIcon shape={shape} selected={selected} />
            <span className={cn(
              "text-[10px] font-medium leading-tight text-center",
              selected ? "text-primary" : "text-muted-foreground"
            )}>
              {SHAPE_LABELS[shape]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
