import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Barcode, Hash, CalendarDays, Layers } from "lucide-react";

export type SerialTrackingType = 'none' | 'manual' | 'auto_date' | 'range';

interface SerialTrackingSectionProps {
  serialTrackingType: SerialTrackingType;
  serialPrefix: string;
  onSerialTrackingTypeChange: (value: SerialTrackingType) => void;
  onSerialPrefixChange: (value: string) => void;
}

export function SerialTrackingSection({
  serialTrackingType,
  serialPrefix,
  onSerialTrackingTypeChange,
  onSerialPrefixChange,
}: SerialTrackingSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Barcode className="h-4 w-4" />
          Serial Number Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={serialTrackingType}
          onValueChange={(value) => onSerialTrackingTypeChange(value as SerialTrackingType)}
          className="grid gap-3"
        >
          <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="none" id="serial-none" />
            <Label htmlFor="serial-none" className="flex-1 cursor-pointer">
              <div className="font-medium">No Tracking</div>
              <div className="text-xs text-muted-foreground">
                Standard items without serial numbers
              </div>
            </Label>
          </div>

          <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="manual" id="serial-manual" />
            <Label htmlFor="serial-manual" className="flex-1 cursor-pointer">
              <div className="font-medium flex items-center gap-2">
                <Hash className="h-3.5 w-3.5" />
                Manual Entry
              </div>
              <div className="text-xs text-muted-foreground">
                Enter serial numbers from vendor invoices (locks, keys, etc.)
              </div>
            </Label>
          </div>

          <div className="rounded-md border hover:bg-muted/50 cursor-pointer">
            <div className="flex items-center space-x-3 p-3">
              <RadioGroupItem value="auto_date" id="serial-auto" />
              <Label htmlFor="serial-auto" className="flex-1 cursor-pointer">
                <div className="font-medium flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Auto Date-Sequential
                </div>
                <div className="text-xs text-muted-foreground">
                  Auto-generate at shipping: PREFIX YY-MMDD#INITIALS
                </div>
              </Label>
            </div>
            
            {serialTrackingType === 'auto_date' && (
              <div className="px-3 pb-3 pt-1 ml-7 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="p-3 bg-muted/30 rounded-md space-y-2">
                  <Label htmlFor="serial-prefix" className="text-sm">
                    Serial Prefix <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="serial-prefix"
                    value={serialPrefix}
                    onChange={(e) => onSerialPrefixChange(e.target.value.toUpperCase())}
                    placeholder="e.g., LCD, MCA, ACW"
                    className="uppercase"
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: <span className="font-mono">{serialPrefix || 'LCD'} 26-01291DW</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="range" id="serial-range" />
            <Label htmlFor="serial-range" className="flex-1 cursor-pointer">
              <div className="font-medium flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" />
                Range Tracking
              </div>
              <div className="text-xs text-muted-foreground">
                Track numbered card ranges (fleet/gift cards)
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                • Specify ranges when ordering from vendor<br />
                • Allocate portions when selling<br />
                • System prevents overlaps and mismatches
              </div>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
