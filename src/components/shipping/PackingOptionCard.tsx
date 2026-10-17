import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatWeight, type PackingResult } from "@/lib/box-packing-utils";
import { BoxPackingVisualization } from "./BoxPackingVisualization";

interface PackingOptionCardProps {
  result: PackingResult;
  index: number;
  isRecommended: boolean;
  isSelected: boolean;
  onSelect: () => void;
  itemNames: Record<string, string>;
  globalMaxDim?: number;
  skuColorMap?: Record<string, string>;
}

export function PackingOptionCard({
  result,
  index,
  isRecommended,
  isSelected,
  onSelect,
  itemNames,
  globalMaxDim,
  skuColorMap,
}: PackingOptionCardProps) {
  if (!result.box) return null;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md relative",
        isSelected
          ? "ring-2 ring-primary border-primary"
          : "hover:border-primary/50"
      )}
      onClick={onSelect}
    >
      {isRecommended && (
        <Badge className="absolute -top-2 left-3 z-10 text-xs">
          Recommended
        </Badge>
      )}

      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm truncate">{result.box.name}</span>
          <span className="text-xs text-muted-foreground">
            Option {index + 1}
          </span>
        </div>

        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>
            {result.box.dimension_l}×{result.box.dimension_w}×{result.box.dimension_h}"
          </div>
          <div className="flex justify-between">
            <span>{result.fillPercentage.toFixed(0)}% filled</span>
            <span>{formatWeight(result.totalPackageWeightOz)}</span>
          </div>
          <div className="flex justify-between">
            <span>${result.totalMaterialCost.toFixed(2)} materials</span>
            <span>{result.packedItems.length} items</span>
          </div>
        </div>

        {result.box && result.packedItems.length > 0 && (
          <div className="pointer-events-none">
            <BoxPackingVisualization
              box={result.box}
              packedItems={result.packedItems}
              itemNames={itemNames}
              globalMaxDim={globalMaxDim}
              skuColorMap={skuColorMap}
              className="h-[140px]"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
