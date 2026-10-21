import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Package,
  Check,
  Ruler,
  Scale,
  Scroll,
  PackageOpen,
} from "lucide-react";
import {
  calculatePaperFill,
  formatWeight,
  formatDimensions,
  type PackingResult,
} from "@/lib/box-packing-utils";

interface PackageCardProps {
  result: PackingResult;
  packageNumber?: number;
  isSelected?: boolean;
  onSelect?: (result: PackingResult) => void;
  compact?: boolean;
  paperCubicInchesPerInch: number;
}

export function PackageCard({
  result,
  packageNumber,
  isSelected,
  onSelect,
  compact = false,
  paperCubicInchesPerInch,
}: PackageCardProps) {
  const paperFill = calculatePaperFill(result.voidVolume ?? 0, paperCubicInchesPerInch);
  const isSelfPackaged = result.isSelfPackaged;

  if (compact) {
    return (
      <div
        className={`border rounded-lg p-3 transition-colors ${
          isSelected
            ? "border-primary bg-primary/5"
            : "bg-muted/20 hover:border-primary/50"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {isSelfPackaged ? (
                <PackageOpen className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium text-sm">
                {isSelfPackaged
                  ? "Ships as packaged"
                  : result.box?.name || "Unknown Box"}
              </span>
              <span className="text-xs text-muted-foreground">
                {isSelfPackaged && result.selfPackagedDimensions
                  ? formatDimensions(
                      result.selfPackagedDimensions.l,
                      result.selfPackagedDimensions.w,
                      result.selfPackagedDimensions.h
                    )
                  : result.box
                  ? formatDimensions(
                      result.box.dimension_l,
                      result.box.dimension_w,
                      result.box.dimension_h
                    )
                  : ""}
              </span>
            </div>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>{Math.round(result.fillPercentage)}% filled</span>
              {!isSelfPackaged && <span>Paper: {paperFill.feetAndInches}</span>}
            </div>
          </div>
          {onSelect && (
            <Button
              size="sm"
              variant={isSelected ? "default" : "outline"}
              onClick={() => onSelect(result)}
            >
              {isSelected ? <Check className="h-4 w-4" /> : "Select"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border rounded-lg p-4 transition-colors ${
        isSelected
          ? "border-primary bg-primary/5"
          : "bg-card hover:border-primary/50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          {/* Package header */}
          <div className="flex items-center gap-2">
            {isSelfPackaged ? (
              <>
                <PackageOpen className="h-5 w-5 text-primary" />
                <span className="font-semibold">Ships in own packaging</span>
                {packageNumber && (
                  <Badge variant="secondary" className="ml-1">
                    Pkg {packageNumber}
                  </Badge>
                )}
              </>
            ) : (
              <>
                <Package className="h-5 w-5 text-primary" />
                <span className="font-semibold">
                  {result.box?.name || "Box"}
                </span>
                {packageNumber && (
                  <Badge variant="secondary" className="ml-1">
                    Pkg {packageNumber}
                  </Badge>
                )}
              </>
            )}
            <Badge variant="outline" className="ml-auto">
              {isSelfPackaged && result.selfPackagedDimensions
                ? formatDimensions(
                    result.selfPackagedDimensions.l,
                    result.selfPackagedDimensions.w,
                    result.selfPackagedDimensions.h
                  )
                : result.box
                ? formatDimensions(
                    result.box.dimension_l,
                    result.box.dimension_w,
                    result.box.dimension_h
                  )
                : "N/A"}
            </Badge>
          </div>

          {/* Space utilization bar - items vs paper */}
          {!isSelfPackaged && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Space utilization</span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="absolute inset-y-0 left-0 bg-primary transition-all"
                  style={{ width: `${Math.round(result.fillPercentage)}%` }}
                />
                <div
                  className="absolute inset-y-0 bg-amber-400 transition-all"
                  style={{
                    left: `${Math.round(result.fillPercentage)}%`,
                    width: `${Math.round(100 - result.fillPercentage)}%`,
                  }}
                />
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                  Items {Math.round(result.fillPercentage)}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  Paper {Math.round(100 - result.fillPercentage)}%
                </span>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex flex-wrap gap-4 text-sm">
            {!isSelfPackaged && (
              <div className="flex items-center gap-1.5">
                <Scroll className="h-4 w-4 text-muted-foreground" />
                <span>
                  Paper fill: <strong>{paperFill.feetAndInches}</strong>
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-muted-foreground" />
              <span>
                Total ship weight: <strong>{formatWeight(result.totalPackageWeightOz ?? 0)}</strong>
              </span>
              {!isSelfPackaged && (
                <span className="text-xs text-muted-foreground">
                  (items + box + paper)
                </span>
              )}
            </div>
            {!isSelfPackaged && result.voidVolume > 0 && (
              <div className="flex items-center gap-1.5">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span>
                  Void: <strong>{((result.voidVolume ?? 0) / 1728).toFixed(2)} cu ft</strong>
                </span>
              </div>
            )}
          </div>

          {/* Material cost */}
          {!isSelfPackaged && result.totalMaterialCost > 0 && (
            <FinancialGuard kind="supplier_price"><div className="text-xs text-muted-foreground">
              Materials: ${result.totalMaterialCost.toFixed(2)}
              {result.boxCost > 0 && ` (box: $${result.boxCost.toFixed(2)})`}
              {result.paperCost > 0 && ` (paper: $${result.paperCost.toFixed(2)})`}
            </div></FinancialGuard>
          )}
        </div>

        {/* Select button */}
        {onSelect && (
          <Button
            size="sm"
            variant={isSelected ? "default" : "outline"}
            onClick={() => onSelect(result)}
            className="shrink-0"
          >
            {isSelected ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Selected
              </>
            ) : (
              "Use This"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
