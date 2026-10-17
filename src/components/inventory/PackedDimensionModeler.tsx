import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import { DimensionAnnotations } from './DimensionAnnotations';
import * as THREE from 'three';
import type { PackedShape, ShapeItem } from '@/lib/shape-volume-utils';

interface PackedDimensionModelerProps {
  item: ShapeItem;
  highlightedFace?: string | null;
}

function PulsingMaterial({ color, isHighlighted }: { color: string; isHighlighted: boolean }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (ref.current && isHighlighted) {
      const t = Math.sin(clock.getElapsedTime() * 3) * 0.15 + 0.40;
      ref.current.opacity = t;
    }
  });

  return (
    <meshStandardMaterial
      ref={ref}
      color={isHighlighted ? "#06b6d4" : color}
      transparent
      opacity={isHighlighted ? 0.40 : 0.18}
      depthWrite={false}
      polygonOffset
      polygonOffsetFactor={-1}
    />
  );
}

function InnerShape({ shape, L, W, H, D }: { shape: PackedShape; L: number; W: number; H: number; D: number }) {
  const r = D / 2;

  const triGeo = useMemo(() => {
    if (shape !== 'triangular_prism') return null;
    const triShape = new THREE.Shape();
    triShape.moveTo(-L / 2, -H / 2);
    triShape.lineTo(L / 2, -H / 2);
    triShape.lineTo(0, H / 2);
    triShape.closePath();
    const geo = new THREE.ExtrudeGeometry(triShape, { depth: W, bevelEnabled: false });
    geo.translate(0, 0, -W / 2);
    return geo;
  }, [shape, L, W, H]);

  const material = <meshStandardMaterial color="#a8a29e" transparent opacity={0.8} />;
  const edgeColor = "#57534e";

  switch (shape) {
    case 'cylinder':
      return (
        <mesh>
          <cylinderGeometry args={[r, r, H, 24]} />
          {material}
          <Edges color={edgeColor} />
        </mesh>
      );
    case 'cone':
      return (
        <mesh>
          <coneGeometry args={[r, H, 24]} />
          {material}
          <Edges color={edgeColor} />
        </mesh>
      );
    case 'sphere':
      return (
        <mesh>
          <sphereGeometry args={[r, 24, 16]} />
          {material}
          <Edges color={edgeColor} />
        </mesh>
      );
    case 'triangular_prism':
      return triGeo ? (
        <mesh geometry={triGeo}>
          {material}
          <Edges color={edgeColor} />
        </mesh>
      ) : null;
    case 'box':
    default:
      return (
        <mesh>
          <boxGeometry args={[L, H, W]} />
          {material}
          <Edges color={edgeColor} />
        </mesh>
      );
  }
}

function PaperShell({ item, highlightedFace }: { item: ShapeItem; highlightedFace?: string | null }) {
  const shape = item.packed_shape || 'box';
  const L = item.packed_dimension_l || 0;
  const W = item.packed_dimension_w || 0;
  const H = item.packed_dimension_h || 0;
  const D = item.packed_diameter || 0;
  const r = D / 2;

  const pt = (key: string) => (item as any)[`paper_thickness_${key}`] || 0;
  const isHighlighted = highlightedFace !== null && highlightedFace !== undefined;

  if (shape === 'box') {
    const top = pt('top'); const bottom = pt('bottom');
    const left = pt('left'); const right = pt('right');
    const front = pt('front'); const back = pt('back');
    const totalL = L + left + right;
    const totalH = H + top + bottom;
    const totalW = W + front + back;
    if (totalL <= L && totalH <= H && totalW <= W) return null;

    return (
      <mesh renderOrder={1} position={[(right - left) / 2, (top - bottom) / 2, (front - back) / 2]}>
        <boxGeometry args={[totalL, totalH, totalW]} />
        <PulsingMaterial color="#06b6d4" isHighlighted={isHighlighted} />
        <Edges color="#06b6d4" />
      </mesh>
    );
  }

  if (shape === 'cylinder') {
    const side = pt('side'); const top = pt('top'); const bottom = pt('bottom');
    if (side <= 0 && top <= 0 && bottom <= 0) return null;
    const outerR = r + side;
    const totalH = H + top + bottom;
    return (
      <mesh renderOrder={1} position={[0, (top - bottom) / 2, 0]}>
        <cylinderGeometry args={[outerR, outerR, totalH, 24]} />
        <PulsingMaterial color="#06b6d4" isHighlighted={isHighlighted} />
        <Edges color="#06b6d4" />
      </mesh>
    );
  }

  if (shape === 'cone') {
    const side = pt('side'); const bottom = pt('bottom');
    if (side <= 0 && bottom <= 0) return null;

    const s = Math.sqrt(r * r + H * H);
    const outerR = r + (side > 0 ? side * s / H : 0) + bottom * (r / H);
    const apexShift = side > 0 ? side * s / r : 0;
    const totalH = H + apexShift + bottom;

    return (
      <mesh renderOrder={1} position={[0, (apexShift - bottom) / 2, 0]}>
        <coneGeometry args={[outerR, totalH, 24]} />
        <PulsingMaterial color="#06b6d4" isHighlighted={isHighlighted} />
        <Edges color="#06b6d4" />
      </mesh>
    );
  }

  if (shape === 'sphere') {
    const u = pt('uniform');
    if (u <= 0) return null;
    return (
      <mesh renderOrder={1}>
        <sphereGeometry args={[r + u, 24, 16]} />
        <PulsingMaterial color="#06b6d4" isHighlighted={isHighlighted} />
        <Edges color="#06b6d4" />
      </mesh>
    );
  }

  if (shape === 'triangular_prism') {
    const top = pt('top'); const bottom = pt('bottom');
    const left = pt('left'); const right = pt('right');
    const front = pt('front'); const back = pt('back');
    if (top <= 0 && bottom <= 0 && left <= 0 && right <= 0 && front <= 0 && back <= 0) return null;

    // Inner triangle vertices (2D cross-section, XY plane)
    const A: [number, number] = [-L / 2, -H / 2]; // bottom-left
    const B: [number, number] = [L / 2, -H / 2];  // bottom-right
    const C: [number, number] = [0, H / 2];        // apex

    // Helper: 2D cross product
    const cross2 = (a: [number, number], b: [number, number]) => a[0] * b[1] - a[1] * b[0];

    // Helper: outward normal for edge (p1 -> p2), assuming CCW winding
    const outwardNormal = (p1: [number, number], p2: [number, number]): [number, number] => {
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      // For CCW winding, outward normal is (dy, -dx) normalized
      return [dy / len, -dx / len];
    };

    // Helper: intersect two lines (point + direction)
    const intersectLines = (
      p1: [number, number], d1: [number, number],
      p2: [number, number], d2: [number, number]
    ): [number, number] => {
      const denom = cross2(d1, d2);
      if (Math.abs(denom) < 1e-10) return p1; // parallel fallback
      const diff: [number, number] = [p2[0] - p1[0], p2[1] - p1[1]];
      const t = cross2(diff, d2) / denom;
      return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
    };

    // Edge directions (CCW winding: A -> B -> C -> A)
    const dBottom: [number, number] = [B[0] - A[0], B[1] - A[1]]; // A -> B
    const dRight: [number, number] = [C[0] - B[0], C[1] - B[1]];  // B -> C
    const dLeft: [number, number] = [A[0] - C[0], A[1] - C[1]];   // C -> A

    // Outward normals
    const nBottom = outwardNormal(A, B);
    const nRight = outwardNormal(B, C);
    const nLeft = outwardNormal(C, A);

    // Offset edge lines: shift each edge's start point along its outward normal by thickness
    const oA_bottom: [number, number] = [A[0] + nBottom[0] * bottom, A[1] + nBottom[1] * bottom];
    const oC_left: [number, number] = [C[0] + nLeft[0] * left, C[1] + nLeft[1] * left];
    const oB_right: [number, number] = [B[0] + nRight[0] * right, B[1] + nRight[1] * right];

    // Intersect offset lines to find outer vertices
    const outerBL = intersectLines(oA_bottom, dBottom, oC_left, dLeft);
    const outerBR = intersectLines(oA_bottom, dBottom, oB_right, dRight);
    const outerApex = intersectLines(oB_right, dRight, oC_left, dLeft);
    // Apply top thickness: shift apex upward
    outerApex[1] += top;

    const totalW = W + front + back;
    const triShape = new THREE.Shape();
    triShape.moveTo(outerBL[0], outerBL[1]);
    triShape.lineTo(outerBR[0], outerBR[1]);
    triShape.lineTo(outerApex[0], outerApex[1]);
    triShape.closePath();
    const geo = new THREE.ExtrudeGeometry(triShape, { depth: totalW, bevelEnabled: false });
    geo.translate(0, 0, -totalW / 2);

    return (
      <mesh renderOrder={1}
        geometry={geo}
        position={[0, 0, (front - back) / 2]}
      >
        <PulsingMaterial color="#06b6d4" isHighlighted={isHighlighted} />
        <Edges color="#06b6d4" />
      </mesh>
    );
  }

  return null;
}

function Scene({ item, highlightedFace }: { item: ShapeItem; highlightedFace?: string | null }) {
  const shape = item.packed_shape || 'box';
  const L = item.packed_dimension_l || 0;
  const W = item.packed_dimension_w || 0;
  const H = item.packed_dimension_h || 0;
  const D = item.packed_diameter || 0;

  const maxDim = Math.max(L, W, H, D, 1);
  const camDist = maxDim * 2.5;

  // Grid floor based on item dimensions
  const floorY = -(Math.max(H, D) / 2 + 0.1);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <InnerShape shape={shape} L={L} W={W} H={H} D={D} />
      <PaperShell item={item} highlightedFace={highlightedFace} />
      <DimensionAnnotations item={item} />
      <gridHelper args={[maxDim * 3, 10, '#a1a1aa', '#e4e4e7']} position={[0, floorY, 0]} />
      <OrbitControls makeDefault minDistance={1} maxDistance={camDist * 2} />
    </>
  );
}

export function PackedDimensionModeler({ item, highlightedFace }: PackedDimensionModelerProps) {
  const L = item.packed_dimension_l || 0;
  const W = item.packed_dimension_w || 0;
  const H = item.packed_dimension_h || 0;
  const D = item.packed_diameter || 0;
  const maxDim = Math.max(L, W, H, D, 1);

  return (
    <div className="space-y-2">
      <div className="border rounded-lg overflow-hidden bg-muted/30" style={{ height: 300 }}>
        <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading 3D viewer...</div>}>
          <Canvas camera={{ position: [maxDim * 1.5, maxDim * 1.2, maxDim * 1.5], fov: 45 }}>
            <Scene item={item} highlightedFace={highlightedFace} />
          </Canvas>
        </Suspense>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#a8a29e' }} /> Item
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-cyan-500/20 inline-block" /> Paper
        </div>
      </div>
    </div>
  );
}
