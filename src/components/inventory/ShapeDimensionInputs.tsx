import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PackedShape } from "@/lib/shape-volume-utils";

interface ShapeDimensionInputsProps {
  shape: PackedShape;
  packedL: number | null;
  packedW: number | null;
  packedH: number | null;
  packedDiameter: number | null;
  onChange: (field: string, value: number | null) => void;
}

export function ShapeDimensionInputs({
  shape,
  packedL,
  packedW,
  packedH,
  packedDiameter,
  onChange,
}: ShapeDimensionInputsProps) {
  const numChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value === '' ? null : parseFloat(e.target.value);
    onChange(field, val);
  };

  switch (shape) {
    case 'cylinder':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Diameter (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedDiameter ?? ''} onChange={numChange('packed_diameter')} />
          </div>
          <div>
            <Label className="text-xs">Height (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedH ?? ''} onChange={numChange('packed_dimension_h')} />
          </div>
        </div>
      );
    case 'cone':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Base Diameter (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedDiameter ?? ''} onChange={numChange('packed_diameter')} />
          </div>
          <div>
            <Label className="text-xs">Height (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedH ?? ''} onChange={numChange('packed_dimension_h')} />
          </div>
        </div>
      );
    case 'sphere':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Diameter (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedDiameter ?? ''} onChange={numChange('packed_diameter')} />
          </div>
        </div>
      );
    case 'triangular_prism':
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Base Width (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedL ?? ''} onChange={numChange('packed_dimension_l')} />
          </div>
          <div>
            <Label className="text-xs">Tri Height (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedH ?? ''} onChange={numChange('packed_dimension_h')} />
          </div>
          <div>
            <Label className="text-xs">Depth (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedW ?? ''} onChange={numChange('packed_dimension_w')} />
          </div>
        </div>
      );
    case 'box':
    default:
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Length (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedL ?? ''} onChange={numChange('packed_dimension_l')} />
          </div>
          <div>
            <Label className="text-xs">Width (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedW ?? ''} onChange={numChange('packed_dimension_w')} />
          </div>
          <div>
            <Label className="text-xs">Height (in)</Label>
            <Input type="number" step="0.01" min="0" value={packedH ?? ''} onChange={numChange('packed_dimension_h')} />
          </div>
        </div>
      );
  }
}
