import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Package,
  FileWarning,
  ChevronDown,
  AlertTriangle,
  Boxes,
  Scale,
  DollarSign,
} from "lucide-react";
import {
  getSmartMultiBoxRecommendation,
  formatWeight,
  type PackableItem,
  type BoxSize,
  type MultiBoxPackingResult,
  type PackingResult,
} from "@/lib/box-packing-utils";
import { PackageCard } from "./PackageCard";

interface MultiBoxRecommendationProps {
  items: PackableItem[];
  onSelectPackages?: (packages: PackingResult[]) => void;
  selectedPackages?: PackingResult[];
}

export function MultiBoxRecommendation({
  items,
  onSelectPackages,
  selectedPackages,
}: MultiBoxRecommendationProps) {
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const [recommendation, setRecommendation] = useState<MultiBoxPackingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [paperConfig, setPaperConfig] = useState<{
    cubicInchesPerInch: number;
    weightOzPerFoot: number;
    costPerFoot: number;
    shippingCostMultiplier: number;
  } | null>(null);
  const [paperError, setPaperError] = useState(false);

  useEffect(() => {
    fetchBoxes();
    fetchActivePaper();
  }, []);

  useEffect(() => {
    if (boxes.length > 0 && items.length > 0 && paperConfig !== null) {
      const rec = getSmartMultiBoxRecommendation(items, boxes, {
        paperCubicInchesPerInch: paperConfig.cubicInchesPerInch,
        paperWeightOzPerFoot: paperConfig.weightOzPerFoot,
        paperCostPerFoot: paperConfig.costPerFoot,
        paperShippingCostMultiplier: paperConfig.shippingCostMultiplier,
      });
      setRecommendation(rec);
    }
  }, [boxes, items, paperConfig]);

  const fetchBoxes = async () => {
    try {
      const { data, error } = await supabase
        .from("box_sizes")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;
      setBoxes(data || []);
    } catch (err) {
      console.error("Error fetching boxes:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivePaper = async () => {
    try {
      const { data, error } = await supabase
        .from("packing_papers")
        .select("cubic_inches_per_linear_inch, weight_oz_per_foot, cost_per_foot, shipping_cost_multiplier")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (error || !data) {
        setPaperError(true);
        return;
      }
      setPaperConfig({
        cubicInchesPerInch: data.cubic_inches_per_linear_inch,
        weightOzPerFoot: data.weight_oz_per_foot,
        costPerFoot: data.cost_per_foot,
        shippingCostMultiplier: data.shipping_cost_multiplier,
      });
    } catch {
      setPaperError(true);
    }
  };

  if (loading) {
    return (
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span className="text-sm">Calculating optimal packaging...</span>
        </div>
      </div>
    );
  }

  if (paperError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No active packing paper configured.{" "}
          <a href="/settings" className="underline">
            Add one in Settings &gt; Shipping Materials
          </a>{" "}
          before packing.
        </AlertDescription>
      </Alert>
    );
  }

  if (boxes.length === 0) {
    return (
      <Alert>
        <FileWarning className="h-4 w-4" />
        <AlertDescription>
          No box sizes configured.{" "}
          <a href="/settings" className="underline text-primary">
            Add box sizes in Settings
          </a>{" "}
          to get packing recommendations.
        </AlertDescription>
      </Alert>
    );
  }

  if (!recommendation || items.length === 0) {
    return (
      <Alert>
        <Package className="h-4 w-4" />
        <AlertDescription>
          Add items with packed dimensions to get box recommendations.
        </AlertDescription>
      </Alert>
    );
  }

  const { packages, itemsMissingDimensions, unpackedItems, allItemsFit } = recommendation;
  const selfPackagedCount = packages.filter(p => p.isSelfPackaged).length;
  const boxedCount = packages.length - selfPackagedCount;

  return (
    <div className="space-y-3">
      {/* Warning for items missing dimensions */}
      {itemsMissingDimensions.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            {itemsMissingDimensions.length} item(s) missing packed dimensions:{" "}
            {itemsMissingDimensions.slice(0, 3).join(", ")}
            {itemsMissingDimensions.length > 3 && ` +${itemsMissingDimensions.length - 3} more`}
          </AlertDescription>
        </Alert>
      )}

      {/* Warning for unpacked items */}
      {!allItemsFit && unpackedItems.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>{unpackedItems.length} item(s) could not be packed</strong> - no box is large enough.
          </AlertDescription>
        </Alert>
      )}

      {/* Multi-package header */}
      {packages.length > 1 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
          <Boxes className="h-5 w-5 text-primary" />
          <span className="font-medium">
            {packages.length} package{packages.length !== 1 ? "s" : ""} required
          </span>
          {selfPackagedCount > 0 && (
            <Badge variant="outline" className="ml-auto">
              {selfPackagedCount} ship as packaged
            </Badge>
          )}
        </div>
      )}

      {/* Package list */}
      <div className="space-y-2">
        {packages.map((pkg, index) => (
          <PackageCard
            key={`pkg-${index}`}
            result={pkg}
            packageNumber={packages.length > 1 ? index + 1 : undefined}
            isSelected={selectedPackages?.some(
              (sp) => sp.box?.id === pkg.box?.id && sp.isSelfPackaged === pkg.isSelfPackaged
            )}
            onSelect={() => onSelectPackages?.(packages)}
            compact={packages.length > 2}
            paperCubicInchesPerInch={paperConfig!.cubicInchesPerInch}
          />
        ))}
      </div>

      {/* Totals summary for multi-package */}
      {packages.length > 1 && (
        <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-muted/20 border text-sm">
          <div className="flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span>
              Total weight: <strong>{formatWeight(recommendation.totalWeightOz)}</strong>
            </span>
          </div>
          {recommendation.totalMaterialCost > 0 && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>
                Materials: <strong>${recommendation.totalMaterialCost.toFixed(2)}</strong>
              </span>
            </div>
          )}
          {recommendation.totalPaperFeet > 0 && (
            <span className="text-muted-foreground">
              Paper: {recommendation.totalPaperFeet.toFixed(1)} ft
            </span>
          )}
        </div>
      )}

      {/* Use recommended button for single package */}
      {packages.length === 1 && onSelectPackages && (
        <Button
          className="w-full"
          onClick={() => onSelectPackages(packages)}
          variant={selectedPackages?.length ? "default" : "outline"}
        >
          {selectedPackages?.length ? "Selected" : "Use Recommended"}
        </Button>
      )}

      {/* Use all packages button for multi-package */}
      {packages.length > 1 && onSelectPackages && (
        <Button
          className="w-full"
          onClick={() => onSelectPackages(packages)}
          variant={selectedPackages?.length ? "default" : "outline"}
        >
          {selectedPackages?.length
            ? `${packages.length} Packages Selected`
            : `Use All ${packages.length} Packages`}
        </Button>
      )}
    </div>
  );
}
