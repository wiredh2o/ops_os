import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, CreditCard, Loader2 } from "lucide-react";
import {
  calculateRangeQuantity,
  validateRangeMatch,
  getAvailableRanges,
  checkSaleRangeOverlap,
  AvailableRange,
} from "@/lib/serial-range-utils";

interface RangeAssignmentSectionProps {
  itemId: string;
  itemType: "inventory" | "assembly";
  itemSku: string;
  quantityToFulfill: number;
  onRangeChange: (rangeStart: number | null, rangeEnd: number | null, isValid: boolean) => void;
}

export function RangeAssignmentSection({
  itemId,
  itemType,
  itemSku,
  quantityToFulfill,
  onRangeChange,
}: RangeAssignmentSectionProps) {
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const [availableRanges, setAvailableRanges] = useState<AvailableRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [validationMessage, setValidationMessage] = useState<string>("");
  const [isValid, setIsValid] = useState(false);
  const [checkingOverlap, setCheckingOverlap] = useState(false);

  // Fetch available ranges on mount
  useEffect(() => {
    const fetchRanges = async () => {
      setLoading(true);
      try {
        const ranges = await getAvailableRanges(itemId, itemType);
        setAvailableRanges(ranges);
      } catch (error) {
        console.error("Error fetching available ranges:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchRanges();
  }, [itemId, itemType]);

  // Validate range on input change
  useEffect(() => {
    const validateRange = async () => {
      const start = rangeStart ? parseInt(rangeStart, 10) : null;
      const end = rangeEnd ? parseInt(rangeEnd, 10) : null;

      // Check if both fields are empty
      if (!rangeStart && !rangeEnd) {
        setValidationMessage("Enter start and end card numbers");
        setIsValid(false);
        onRangeChange(null, null, false);
        return;
      }

      // Check if only one field is filled
      if (!rangeStart || !rangeEnd || start === null || end === null) {
        setValidationMessage("Both start and end numbers are required");
        setIsValid(false);
        onRangeChange(null, null, false);
        return;
      }

      // Check range direction
      if (end < start) {
        setValidationMessage("End number must be greater than or equal to start number");
        setIsValid(false);
        onRangeChange(start, end, false);
        return;
      }

      // Check quantity match
      const rangeValidation = validateRangeMatch(start, end, quantityToFulfill);
      if (!rangeValidation.valid) {
        setValidationMessage(rangeValidation.message);
        setIsValid(false);
        onRangeChange(start, end, false);
        return;
      }

      // Check if range exists in available inventory
      const fittingRange = availableRanges.find(
        (ar) => ar.availableStart <= start && ar.availableEnd >= end
      );
      if (!fittingRange) {
        setValidationMessage(`Range ${start.toLocaleString()}-${end.toLocaleString()} not found in available inventory`);
        setIsValid(false);
        onRangeChange(start, end, false);
        return;
      }

      // Check for overlap with existing sales
      setCheckingOverlap(true);
      try {
        const overlapCheck = await checkSaleRangeOverlap(itemId, itemType, start, end);
        if (overlapCheck.hasOverlap) {
          setValidationMessage(overlapCheck.message);
          setIsValid(false);
          onRangeChange(start, end, false);
          return;
        }
      } finally {
        setCheckingOverlap(false);
      }

      // All validations passed
      setValidationMessage(rangeValidation.message);
      setIsValid(true);
      onRangeChange(start, end, true);
    };

    // Debounce the validation
    const timeoutId = setTimeout(validateRange, 300);
    return () => clearTimeout(timeoutId);
  }, [rangeStart, rangeEnd, quantityToFulfill, availableRanges, itemId, itemType, onRangeChange]);

  const totalAvailable = availableRanges.reduce((sum, r) => sum + r.availableQty, 0);

  return (
    <div className="space-y-3 border border-accent/30 rounded-lg p-3 bg-accent/5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium">Range Tracking: {itemSku}</span>
        <Badge variant="outline" className="text-xs">
          {quantityToFulfill.toLocaleString()} cards needed
        </Badge>
      </div>

      {/* Available Ranges */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading available ranges...
        </div>
      ) : availableRanges.length === 0 ? (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          No card ranges available in inventory
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Available Ranges ({totalAvailable.toLocaleString()} cards total):
          </Label>
          <div className="flex flex-wrap gap-1">
            {availableRanges.slice(0, 5).map((range, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-accent/30"
                onClick={() => {
                  // Auto-fill range if it can fulfill the quantity
                  const neededEnd = range.availableStart + quantityToFulfill - 1;
                  if (neededEnd <= range.availableEnd) {
                    setRangeStart(range.availableStart.toString());
                    setRangeEnd(neededEnd.toString());
                  } else {
                    // Use entire available range
                    setRangeStart(range.availableStart.toString());
                    setRangeEnd(range.availableEnd.toString());
                  }
                }}
              >
                {range.availableStart.toLocaleString()}-{range.availableEnd.toLocaleString()}
                <span className="ml-1 opacity-70">
                  ({range.availableQty.toLocaleString()})
                </span>
              </Badge>
            ))}
            {availableRanges.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{availableRanges.length - 5} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Range Input */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Start Number</Label>
          <Input
            type="number"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            placeholder="e.g., 335000"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">End Number</Label>
          <Input
            type="number"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            placeholder="e.g., 335499"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Validation Message */}
      <div className={`flex items-center gap-1 text-xs ${isValid ? "text-green-600" : "text-destructive"}`}>
        {checkingOverlap ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking availability...
          </>
        ) : isValid ? (
          <>
            <CheckCircle className="h-3 w-3" />
            {validationMessage}
          </>
        ) : (
          <>
            <AlertTriangle className="h-3 w-3" />
            {validationMessage}
          </>
        )}
      </div>
    </div>
  );
}
