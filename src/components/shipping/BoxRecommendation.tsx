import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Package,
  FileWarning,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import {
  getBoxRecommendation,
  formatDimensions,
  type PackableItem,
  type BoxSize,
  type BoxRecommendation as BoxRecommendationType,
  type PackingResult,
} from "@/lib/box-packing-utils";
import { PackageCard } from "./PackageCard";

interface BoxRecommendationProps {
  items: PackableItem[];
  onSelectBox?: (result: PackingResult) => void;
  selectedBoxId?: string;
}

/**
 * Single-box recommendation component.
 * For multi-box scenarios, use MultiBoxRecommendation instead.
 */
export function BoxRecommendation({
  items,
  onSelectBox,
  selectedBoxId,
}: BoxRecommendationProps) {
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const [recommendation, setRecommendation] = useState<BoxRecommendationType | null>(null);
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
      const rec = getBoxRecommendation(items, boxes, {
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
          <span className="text-sm">Calculating optimal box...</span>
        </div>
      </div>
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

  const { primary, alternatives, itemsMissingDimensions } = recommendation;

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

      {/* Primary Recommendation */}
      {primary.box ? (
        <PackageCard
          result={primary}
          isSelected={selectedBoxId === primary.box.id}
          onSelect={onSelectBox}
          paperCubicInchesPerInch={paperConfig!.cubicInchesPerInch}
        />
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>No standard box fits these items.</strong>
            {primary.minimumRequiredDimensions && (
              <span className="block mt-1">
                Minimum dimensions needed:{" "}
                {formatDimensions(
                  primary.minimumRequiredDimensions.l,
                  primary.minimumRequiredDimensions.w,
                  primary.minimumRequiredDimensions.h
                )}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <Collapsible open={alternativesOpen} onOpenChange={setAlternativesOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span>{alternatives.length} alternative box{alternatives.length !== 1 ? "es" : ""} available</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${alternativesOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {alternatives.map((alt) => {
              if (!alt.box) return null;
              return (
                <PackageCard
                  key={alt.box.id}
                  result={alt}
                  isSelected={selectedBoxId === alt.box.id}
                  onSelect={onSelectBox}
                  compact
                  paperCubicInchesPerInch={paperConfig!.cubicInchesPerInch}
                />
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
