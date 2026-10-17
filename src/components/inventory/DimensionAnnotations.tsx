import React, { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { ShapeItem } from '@/lib/shape-volume-utils';

type Vec3 = [number, number, number];

const innerStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'ui-monospace, monospace',
  background: '#78716c',
  color: '#fff',
  padding: '1px 5px',
  borderRadius: 8,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none',
  lineHeight: 1.4,
};

const offsetStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'ui-monospace, monospace',
  background: '#06b6d4',
  color: '#fff',
  padding: '1px 4px',
  borderRadius: 8,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  userSelect: 'none',
  lineHeight: 1.4,
};

function DimensionLine({ start, end, label, color, small }: {
  start: Vec3; end: Vec3; label: string; color: string; small?: boolean;
}) {
  const mid: Vec3 = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
  return (
    <group>
      <Line points={[start, end]} color={color} lineWidth={1.5} />
      <Html center position={mid} distanceFactor={8} zIndexRange={[10, 0]}>
        <span style={small ? offsetStyle : innerStyle}>{label}</span>
      </Html>
    </group>
  );
}

function BoxAnnotations({ L, W, H, pt }: { L: number; W: number; H: number; pt: (k: string) => number }) {
  const off = 0.15;
  const oL = L / 2 + L * off;
  const oW = W / 2 + W * off;
  const oH = H / 2 + H * off;

  const top = pt('top'), bottom = pt('bottom');
  const left = pt('left'), right = pt('right');
  const front = pt('front'), back = pt('back');

  return (
    <group>
      {/* Inner L along x, at front-bottom edge */}
      <DimensionLine start={[-L / 2, -H / 2, oW]} end={[L / 2, -H / 2, oW]} label={`L: ${L.toFixed(2)}"`} color="#78716c" />
      {/* Inner W along z, at right-bottom edge */}
      <DimensionLine start={[oL, -H / 2, -W / 2]} end={[oL, -H / 2, W / 2]} label={`W: ${W.toFixed(2)}"`} color="#78716c" />
      {/* Inner H along y, at front-right edge */}
      <DimensionLine start={[oL, -H / 2, W / 2]} end={[oL, H / 2, W / 2]} label={`H: ${H.toFixed(2)}"`} color="#78716c" />

      {/* Paper offsets */}
      {top > 0 && <DimensionLine start={[-L / 2, H / 2, -oW]} end={[-L / 2, H / 2 + top, -oW]} label={`+${top.toFixed(2)}"`} color="#06b6d4" small />}
      {bottom > 0 && <DimensionLine start={[-L / 2, -H / 2, -oW]} end={[-L / 2, -H / 2 - bottom, -oW]} label={`+${bottom.toFixed(2)}"`} color="#06b6d4" small />}
      {left > 0 && <DimensionLine start={[-L / 2, oH, 0]} end={[-L / 2 - left, oH, 0]} label={`+${left.toFixed(2)}"`} color="#06b6d4" small />}
      {right > 0 && <DimensionLine start={[L / 2, oH, 0]} end={[L / 2 + right, oH, 0]} label={`+${right.toFixed(2)}"`} color="#06b6d4" small />}
      {front > 0 && <DimensionLine start={[0, oH, W / 2]} end={[0, oH, W / 2 + front]} label={`+${front.toFixed(2)}"`} color="#06b6d4" small />}
      {back > 0 && <DimensionLine start={[0, oH, -W / 2]} end={[0, oH, -W / 2 - back]} label={`+${back.toFixed(2)}"`} color="#06b6d4" small />}
    </group>
  );
}

function CylinderAnnotations({ D, H, pt }: { D: number; H: number; pt: (k: string) => number }) {
  const r = D / 2;
  const off = 0.2;

  const side = pt('side'), top = pt('top'), bottom = pt('bottom');

  return (
    <group>
      {/* Diameter line across the top */}
      <DimensionLine start={[-r, H / 2 + H * off, 0]} end={[r, H / 2 + H * off, 0]} label={`D: ${D.toFixed(2)}"`} color="#78716c" />
      {/* Height along the side */}
      <DimensionLine start={[r + r * off, -H / 2, 0]} end={[r + r * off, H / 2, 0]} label={`H: ${H.toFixed(2)}"`} color="#78716c" />

      {side > 0 && <DimensionLine start={[r, 0, r * off]} end={[r + side, 0, r * off]} label={`+${side.toFixed(2)}"`} color="#06b6d4" small />}
      {top > 0 && <DimensionLine start={[-r - r * off, H / 2, 0]} end={[-r - r * off, H / 2 + top, 0]} label={`+${top.toFixed(2)}"`} color="#06b6d4" small />}
      {bottom > 0 && <DimensionLine start={[-r - r * off, -H / 2, 0]} end={[-r - r * off, -H / 2 - bottom, 0]} label={`+${bottom.toFixed(2)}"`} color="#06b6d4" small />}
    </group>
  );
}

function ConeAnnotations({ D, H, pt }: { D: number; H: number; pt: (k: string) => number }) {
  const r = D / 2;
  const off = 0.2;

  const side = pt('side'), bottom = pt('bottom');

  return (
    <group>
      {/* Diameter at the base */}
      <DimensionLine start={[-r, -H / 2 - H * off, 0]} end={[r, -H / 2 - H * off, 0]} label={`D: ${D.toFixed(2)}"`} color="#78716c" />
      {/* Height along the side */}
      <DimensionLine start={[r + r * off, -H / 2, 0]} end={[r + r * off, H / 2, 0]} label={`H: ${H.toFixed(2)}"`} color="#78716c" />

      {side > 0 && <DimensionLine start={[r, 0, r * off]} end={[r + side, 0, r * off]} label={`+${side.toFixed(2)}"`} color="#06b6d4" small />}
      {bottom > 0 && <DimensionLine start={[-r - r * off, -H / 2, 0]} end={[-r - r * off, -H / 2 - bottom, 0]} label={`+${bottom.toFixed(2)}"`} color="#06b6d4" small />}
    </group>
  );
}

function SphereAnnotations({ D, pt }: { D: number; pt: (k: string) => number }) {
  const r = D / 2;
  const off = 0.2;
  const uniform = pt('uniform');

  return (
    <group>
      {/* Diameter across equator */}
      <DimensionLine start={[-r, r + r * off, 0]} end={[r, r + r * off, 0]} label={`D: ${D.toFixed(2)}"`} color="#78716c" />

      {uniform > 0 && <DimensionLine start={[r, 0, r * off]} end={[r + uniform, 0, r * off]} label={`+${uniform.toFixed(2)}"`} color="#06b6d4" small />}
    </group>
  );
}

function TriPrismAnnotations({ L, W, H, pt }: { L: number; W: number; H: number; pt: (k: string) => number }) {
  const off = 0.15;
  const oW = W / 2 + W * off;

  const top = pt('top'), bottom = pt('bottom');
  const left = pt('left'), right = pt('right');
  const front = pt('front'), back = pt('back');

  return (
    <group>
      {/* Base L along x */}
      <DimensionLine start={[-L / 2, -H / 2 - H * off, oW]} end={[L / 2, -H / 2 - H * off, oW]} label={`L: ${L.toFixed(2)}"`} color="#78716c" />
      {/* Depth W along z */}
      <DimensionLine start={[L / 2 + L * off, -H / 2, -W / 2]} end={[L / 2 + L * off, -H / 2, W / 2]} label={`W: ${W.toFixed(2)}"`} color="#78716c" />
      {/* Height along y at front-right */}
      <DimensionLine start={[L / 2 + L * off, -H / 2, oW]} end={[L / 2 + L * off, H / 2, oW]} label={`H: ${H.toFixed(2)}"`} color="#78716c" />

      {top > 0 && <DimensionLine start={[0, H / 2, -oW]} end={[0, H / 2 + top, -oW]} label={`+${top.toFixed(2)}"`} color="#06b6d4" small />}
      {bottom > 0 && <DimensionLine start={[0, -H / 2, -oW]} end={[0, -H / 2 - bottom, -oW]} label={`+${bottom.toFixed(2)}"`} color="#06b6d4" small />}
      {left > 0 && <DimensionLine start={[-L / 2, 0, 0]} end={[-L / 2 - left, 0, 0]} label={`+${left.toFixed(2)}"`} color="#06b6d4" small />}
      {right > 0 && <DimensionLine start={[L / 2, 0, 0]} end={[L / 2 + right, 0, 0]} label={`+${right.toFixed(2)}"`} color="#06b6d4" small />}
      {front > 0 && <DimensionLine start={[0, 0, W / 2]} end={[0, 0, W / 2 + front]} label={`+${front.toFixed(2)}"`} color="#06b6d4" small />}
      {back > 0 && <DimensionLine start={[0, 0, -W / 2]} end={[0, 0, -W / 2 - back]} label={`+${back.toFixed(2)}"`} color="#06b6d4" small />}
    </group>
  );
}

export function DimensionAnnotations({ item }: { item: ShapeItem }) {
  const shape = item.packed_shape || 'box';
  const L = item.packed_dimension_l || 0;
  const W = item.packed_dimension_w || 0;
  const H = item.packed_dimension_h || 0;
  const D = item.packed_diameter || 0;

  const pt = (key: string) => (item as any)[`paper_thickness_${key}`] || 0;

  if (L <= 0 && W <= 0 && H <= 0 && D <= 0) return null;

  switch (shape) {
    case 'box':
      return <BoxAnnotations L={L} W={W} H={H} pt={pt} />;
    case 'cylinder':
      return <CylinderAnnotations D={D} H={H} pt={pt} />;
    case 'cone':
      return <ConeAnnotations D={D} H={H} pt={pt} />;
    case 'sphere':
      return <SphereAnnotations D={D} pt={pt} />;
    case 'triangular_prism':
      return <TriPrismAnnotations L={L} W={W} H={H} pt={pt} />;
    default:
      return <BoxAnnotations L={L} W={W} H={H} pt={pt} />;
  }
}
