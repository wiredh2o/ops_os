import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import type { ItemProfile, LayerProfile } from "@/lib/box-packing-utils";

interface Suggestion {
  id: string;
  category: "item" | "layer";
  message: string;
  confidence: number; // 0-100
  sampleSize: number;
}

interface PackingInsightsPanelProps {
  companyId?: string;
}

export function PackingInsightsPanel({ companyId }: PackingInsightsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [votes, setVotes] = useState<Record<string, "agree" | "disagree">>({});
  const [hasRun, setHasRun] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("packing_feedback")
        .select("*")
        .eq("feedback_type", "correction")
        .order("created_at", { ascending: false })
        .limit(200);

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        setSuggestions([]);
        setHasRun(true);
        return;
      }

      const results: Suggestion[] = [];

      // Item-level analysis
      analyzeItemPatterns(data as any[], results);

      // Layer-level analysis
      analyzeLayerPatterns(data as any[], results);

      setSuggestions(results);
      setHasRun(true);
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Packing Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasRun && (
          <Button onClick={runAnalysis} disabled={loading} variant="outline" size="sm">
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Analyzing...</>
            ) : (
              "Analyze Packing Feedback"
            )}
          </Button>
        )}

        {hasRun && suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Not enough correction data yet. Keep packing and adjusting — insights will appear after more feedback is collected.
          </p>
        )}

        {suggestions.map((s) => (
          <div key={s.id} className="p-3 rounded-lg border bg-muted/20 space-y-2">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="text-xs shrink-0">
                {s.category === "item" ? "Item" : "Layer"}
              </Badge>
              <p className="text-sm">{s.message}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{s.confidence}% confidence</span>
              <span>•</span>
              <span>{s.sampleSize} samples</span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant={votes[s.id] === "agree" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setVotes((v) => ({ ...v, [s.id]: "agree" }))}
                >
                  <ThumbsUp className="h-3 w-3 mr-1" /> Agree
                </Button>
                <Button
                  variant={votes[s.id] === "disagree" ? "destructive" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setVotes((v) => ({ ...v, [s.id]: "disagree" }))}
                >
                  <ThumbsDown className="h-3 w-3 mr-1" /> Disagree
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Analysis Functions ─────────────────────────────────────────────────────

function analyzeItemPatterns(rows: any[], results: Suggestion[]) {
  // Check: heavy items moved to bottom
  let totalCorrections = 0;
  let heavyMovedToBottom = 0;
  let tallRotated = 0;
  let tallTotal = 0;

  for (const row of rows) {
    const profiles: ItemProfile[] = row.item_profiles || [];
    const original: any[] = row.original_positions || [];
    const corrected: any[] = row.corrected_positions || [];
    if (!corrected || corrected.length === 0) continue;

    totalCorrections++;

    for (const cp of corrected) {
      const profile = profiles[cp.profile_index];
      if (!profile) continue;
      const op = original.find((o: any) => o.profile_index === cp.profile_index);
      if (!op) continue;

      // Heavy + large footprint moved to z=0
      if (profile.weight_oz > 10 && profile.surface_area > 40) {
        if (cp.z < 0.1 && op.z > 0.5) {
          heavyMovedToBottom++;
        }
      }

      // Tall narrow items rotated
      if (profile.aspect_lh < 0.5) {
        tallTotal++;
        if (cp.rotation_index !== op.rotation_index) {
          tallRotated++;
        }
      }
    }
  }

  if (totalCorrections >= 5 && heavyMovedToBottom > 0) {
    const pct = Math.round((heavyMovedToBottom / totalCorrections) * 100);
    if (pct >= 60) {
      results.push({
        id: "heavy-to-bottom",
        category: "item",
        message: `Items with surface area > 40 sq in and weight > 10oz are moved to the bottom ${pct}% of the time. Consider a prefer-bottom rule for heavy, large-footprint items.`,
        confidence: pct,
        sampleSize: totalCorrections,
      });
    }
  }

  if (tallTotal >= 5 && tallRotated > 0) {
    const pct = Math.round((tallRotated / tallTotal) * 100);
    if (pct >= 60) {
      results.push({
        id: "tall-rotated",
        category: "item",
        message: `Tall narrow items (aspect ratio L/H < 0.5) are rotated to lay flat in ${pct}% of corrections. Consider a prefer-flat-orientation rule.`,
        confidence: pct,
        sampleSize: tallTotal,
      });
    }
  }
}

function analyzeLayerPatterns(rows: any[], results: Suggestion[]) {
  let totalCorrections = 0;
  let layerReorderByWeight = 0;
  let sparseLayersModified = 0;
  let sparseLayersTotal = 0;
  let layerCountReduced = 0;
  let highVarianceModified = 0;
  let highVarianceTotal = 0;

  for (const row of rows) {
    const origLayers: LayerProfile[] = row.original_layers || [];
    const corrLayers: LayerProfile[] = row.corrected_layers || [];
    if (!corrLayers || corrLayers.length === 0) continue;

    totalCorrections++;

    // Layer reordering by weight
    if (origLayers.length >= 2 && corrLayers.length >= 2) {
      const origWeightOrder = origLayers.map((l) => l.weight_ratio_of_total);
      const corrWeightOrder = corrLayers.map((l) => l.weight_ratio_of_total);
      // Check if corrected puts heaviest at bottom
      const corrSortedDesc = [...corrWeightOrder].sort((a, b) => b - a);
      if (JSON.stringify(corrWeightOrder) === JSON.stringify(corrSortedDesc) &&
          JSON.stringify(origWeightOrder) !== JSON.stringify(corrSortedDesc)) {
        layerReorderByWeight++;
      }
    }

    // Sparse layer modification
    for (const ol of origLayers) {
      if (ol.fill_density < 0.4) {
        sparseLayersTotal++;
        const matching = corrLayers.find((cl) => Math.abs(cl.base_z - ol.base_z) < 0.2);
        if (!matching || matching.item_count !== ol.item_count) {
          sparseLayersModified++;
        }
      }
    }

    // Layer count reduction
    if (corrLayers.length < origLayers.length) {
      layerCountReduced++;
    }

    // High height variance modification
    for (const ol of origLayers) {
      if (ol.height_variance > 1.0) {
        highVarianceTotal++;
        const matching = corrLayers.find((cl) => Math.abs(cl.base_z - ol.base_z) < 0.2);
        if (!matching || Math.abs(matching.height_variance - ol.height_variance) > 0.3) {
          highVarianceModified++;
        }
      }
    }
  }

  if (totalCorrections >= 5) {
    if (layerReorderByWeight > 0) {
      const pct = Math.round((layerReorderByWeight / totalCorrections) * 100);
      if (pct >= 60) {
        results.push({
          id: "layer-weight-reorder",
          category: "layer",
          message: `Users reorder layers to place the heaviest at the bottom in ${pct}% of corrections. Increase weight priority in layer sorting.`,
          confidence: pct,
          sampleSize: totalCorrections,
        });
      }
    }

    if (layerCountReduced > 0) {
      const pct = Math.round((layerCountReduced / totalCorrections) * 100);
      if (pct >= 50) {
        results.push({
          id: "layer-count-reduce",
          category: "layer",
          message: `Users reduce layer count in ${pct}% of corrections. Consider more aggressive merge-down in the algorithm.`,
          confidence: pct,
          sampleSize: totalCorrections,
        });
      }
    }
  }

  if (sparseLayersTotal >= 5 && sparseLayersModified > 0) {
    const pct = Math.round((sparseLayersModified / sparseLayersTotal) * 100);
    if (pct >= 60) {
      results.push({
        id: "sparse-layer-merge",
        category: "layer",
        message: `Layers with fill density below 40% are modified ${pct}% of the time. Consider a minimum fill density target before accepting a layer.`,
        confidence: pct,
        sampleSize: sparseLayersTotal,
      });
    }
  }

  if (highVarianceTotal >= 5 && highVarianceModified > 0) {
    const pct = Math.round((highVarianceModified / highVarianceTotal) * 100);
    if (pct >= 60) {
      results.push({
        id: "height-variance-split",
        category: "layer",
        message: `Layers with high height variance are corrected ${pct}% of the time. Consider stricter height-grouping thresholds.`,
        confidence: pct,
        sampleSize: highVarianceTotal,
      });
    }
  }
}
