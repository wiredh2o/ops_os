import { useMemo } from 'react';
import * as THREE from 'three';

interface WedgeGeometryProps {
  l: number;
  w: number;
  h: number;
  mirrored?: boolean;
}

/**
 * Renders a right-triangle wedge (triangular prism) centered at origin.
 * Cross-section in XY plane, extruded along Z by `w`.
 * Normal: ramp goes bottom-left to top-right.
 * Mirrored: ramp goes bottom-right to top-left (hypotenuse flipped).
 */
export function WedgeGeometry({ l, w, h, mirrored = false }: WedgeGeometryProps) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const halfL = l / 2;
    const halfH = h / 2;

    if (mirrored) {
      // Bottom-left, bottom-right, top-left
      shape.moveTo(-halfL, -halfH);
      shape.lineTo(halfL, -halfH);
      shape.lineTo(-halfL, halfH);
    } else {
      // Bottom-left, bottom-right, top-right
      shape.moveTo(-halfL, -halfH);
      shape.lineTo(halfL, -halfH);
      shape.lineTo(halfL, halfH);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: w,
      bevelEnabled: false,
    });
    // Center along Z
    geo.translate(0, 0, -w / 2);
    return geo;
  }, [l, w, h, mirrored]);

  return <primitive object={geometry} attach="geometry" />;
}
