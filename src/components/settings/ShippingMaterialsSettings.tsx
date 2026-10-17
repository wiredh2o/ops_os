import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Package, Scroll, Layers, ShoppingBag } from "lucide-react";
import { BoxSizeManager } from "@/components/shipping/BoxSizeManager";
import { PackingPaperManager } from "@/components/shipping/PackingPaperManager";
import { PackingTapeManager } from "@/components/shipping/PackingTapeManager";
import { PackingBagsManager } from "@/components/shipping/PackingBagsManager";

export function ShippingMaterialsSettings() {
  const [isBoxesOpen, setIsBoxesOpen] = useState(false);
  const [isPaperOpen, setIsPaperOpen] = useState(false);
  const [isTapeOpen, setIsTapeOpen] = useState(false);
  const [isBagsOpen, setIsBagsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Boxes Card */}
      <Collapsible open={isBoxesOpen} onOpenChange={setIsBoxesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Boxes</CardTitle>
                    <CardDescription>
                      Configure shipping box sizes and costs
                    </CardDescription>
                  </div>
                </div>
                {isBoxesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <BoxSizeManager />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Paper Filler Card */}
      <Collapsible open={isPaperOpen} onOpenChange={setIsPaperOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scroll className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Paper Filler</CardTitle>
                    <CardDescription>
                      Configure packing paper types and costs
                    </CardDescription>
                  </div>
                </div>
                {isPaperOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <PackingPaperManager />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Packing Tape Card */}
      <Collapsible open={isTapeOpen} onOpenChange={setIsTapeOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Packing Tape</CardTitle>
                    <CardDescription>
                      Configure tape types and costs
                    </CardDescription>
                  </div>
                </div>
                {isTapeOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <PackingTapeManager />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Bags Card */}
      <Collapsible open={isBagsOpen} onOpenChange={setIsBagsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Bags</CardTitle>
                    <CardDescription>
                      Configure shipping bag types and costs
                    </CardDescription>
                  </div>
                </div>
                {isBagsOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <PackingBagsManager />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
