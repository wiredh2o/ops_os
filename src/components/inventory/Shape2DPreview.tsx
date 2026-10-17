import type { PackedShape } from "@/lib/shape-volume-utils";

interface Shape2DPreviewProps {
  shape: PackedShape;
  dimA?: number | null; // First dimension entered
  dimB?: number | null; // Second dimension entered
  highlightedFace?: string | null;
}

// Dimension arrow helper
function DimArrow({ x1, y1, x2, y2, label, color = "hsl(var(--primary))" }: {
  x1: number; y1: number; x2: number; y2: number; label: string; color?: string;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perpX = Math.cos(angle + Math.PI / 2) * 10;
  const perpY = Math.sin(angle + Math.PI / 2) * 10;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.5" markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
      <rect x={mx + perpX / 2 - 16} y={my + perpY / 2 - 7} width="32" height="14" rx="3" fill="hsl(var(--background))" stroke={color} strokeWidth="0.5" />
      <text x={mx + perpX / 2} y={my + perpY / 2 + 3.5} textAnchor="middle" fill={color} fontSize="9" fontFamily="monospace" fontWeight="600">
        {label}
      </text>
    </g>
  );
}

export function Shape2DPreview({ shape, dimA, dimB, highlightedFace }: Shape2DPreviewProps) {
  const a = dimA || 0;
  const b = dimB || 0;

  // Face highlight colors
  const faceColor = (face: string) => {
    if (highlightedFace === face) return "hsl(195 95% 50% / 0.4)";
    return "none";
  };
  const faceStroke = (face: string) => {
    if (highlightedFace === face) return "hsl(195 95% 50%)";
    return "hsl(var(--muted-foreground) / 0.4)";
  };

  return (
    <div className="flex items-center justify-center p-4 border rounded-lg bg-muted/20" style={{ minHeight: 180 }}>
      <svg viewBox="0 0 200 160" className="w-full max-w-[280px] h-auto">
        <defs>
          <marker id="arrowEnd" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <path d="M0,0 L6,2 L0,4" fill="hsl(var(--primary))" />
          </marker>
          <marker id="arrowStart" markerWidth="6" markerHeight="4" refX="1" refY="2" orient="auto">
            <path d="M6,0 L0,2 L6,4" fill="hsl(var(--primary))" />
          </marker>
        </defs>

        {shape === 'box' && (
          <>
            {/* Front face */}
            <rect x="40" y="40" width="80" height="70" rx="2"
              fill={faceColor('front')} stroke={faceStroke('front')} strokeWidth="2" />
            {/* Top edge hint */}
            <line x1="40" y1="40" x2="70" y2="25" stroke={faceStroke('top')} strokeWidth="1.5" />
            <line x1="120" y1="40" x2="150" y2="25" stroke={faceStroke('top')} strokeWidth="1.5" />
            <line x1="70" y1="25" x2="150" y2="25" stroke={faceStroke('top')} strokeWidth="1.5" />
            {/* Side edge */}
            <line x1="120" y1="110" x2="150" y2="95" stroke={faceStroke('right')} strokeWidth="1.5" />
            <line x1="150" y1="25" x2="150" y2="95" stroke={faceStroke('right')} strokeWidth="1.5" />
            {/* Labels */}
            {a > 0 && <DimArrow x1={40} y1={125} x2={120} y2={125} label={`${a}"`} />}
            {b > 0 && <DimArrow x1={130} y1={110} x2={130} y2={40} label={`${b}"`} />}
          </>
        )}

        {shape === 'cylinder' && (
          <>
            <ellipse cx="100" cy="40" rx="45" ry="15"
              fill={faceColor('top')} stroke={faceStroke('top')} strokeWidth="2" />
            <line x1="55" y1="40" x2="55" y2="110" stroke={faceStroke('side')} strokeWidth="2" />
            <line x1="145" y1="40" x2="145" y2="110" stroke={faceStroke('side')} strokeWidth="2" />
            <ellipse cx="100" cy="110" rx="45" ry="15"
              fill={faceColor('bottom')} stroke={faceStroke('bottom')} strokeWidth="2" />
            {a > 0 && <DimArrow x1={55} y1={135} x2={145} y2={135} label={`⌀${a}"`} />}
            {b > 0 && <DimArrow x1={160} y1={110} x2={160} y2={40} label={`${b}"`} />}
          </>
        )}

        {shape === 'cone' && (
          <>
            <line x1="100" y1="25" x2="55" y2="110" stroke={faceStroke('side')} strokeWidth="2" />
            <line x1="100" y1="25" x2="145" y2="110" stroke={faceStroke('side')} strokeWidth="2" />
            <ellipse cx="100" cy="110" rx="45" ry="15"
              fill={faceColor('bottom')} stroke={faceStroke('bottom')} strokeWidth="2" />
            {a > 0 && <DimArrow x1={55} y1={135} x2={145} y2={135} label={`⌀${a}"`} />}
            {b > 0 && <DimArrow x1={160} y1={110} x2={160} y2={25} label={`${b}"`} />}
          </>
        )}

        {shape === 'sphere' && (
          <>
            <circle cx="100" cy="80" r="50"
              fill={faceColor('uniform')} stroke={faceStroke('uniform')} strokeWidth="2" />
            <ellipse cx="100" cy="80" rx="50" ry="15" fill="none" stroke="hsl(var(--muted-foreground) / 0.2)" strokeWidth="1" strokeDasharray="4 3" />
            {a > 0 && <DimArrow x1={50} y1={140} x2={150} y2={140} label={`⌀${a}"`} />}
          </>
        )}

        {shape === 'triangular_prism' && (
          <>
            <polygon points="100,25 55,110 145,110"
              fill={faceColor('front')} stroke={faceStroke('front')} strokeWidth="2" strokeLinejoin="round" />
            {a > 0 && <DimArrow x1={55} y1={125} x2={145} y2={125} label={`${a}"`} />}
            {b > 0 && <DimArrow x1={160} y1={110} x2={160} y2={25} label={`${b}"`} />}
          </>
        )}

        {/* Instruction text when no dims */}
        {a === 0 && b === 0 && (
          <text x="100" y="150" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">
            Enter dimensions to see preview
          </text>
        )}
      </svg>
    </div>
  );
}
