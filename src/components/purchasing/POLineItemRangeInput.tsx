import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import {
  calculateRangeQuantity,
  validateRangeMatch,
  checkPurchaseRangeOverlap,
} from "@/lib/serial-range-utils";

interface POLineItemRangeInputProps {
  itemId: string;
  itemType: "inventory" | "assembly";
  quantity: number;
  rangeStart: number | null;
  rangeEnd: number | null;
  onRangeChange: (rangeStart: number | null, rangeEnd: number | null, isValid: boolean) => void;
  excludePoItemId?: string;
}

export function POLineItemRangeInput({
  itemId,
  itemType,
  quantity,
  rangeStart: initialStart,
  rangeEnd: initialEnd,
  onRangeChange,
  excludePoItemId,
}: POLineItemRangeInputProps) {
  const [rangeStartStr, setRangeStartStr] = useState(initialStart?.toString() ?? "");
  const [rangeEndStr, setRangeEndStr] = useState(initialEnd?.toString() ?? "");
  const [validationMessage, setValidationMessage] = useState<string>("");
  const [isValid, setIsValid] = useState(false);
  const [checkingOverlap, setCheckingOverlap] = useState(false);

  // Memoize the callback to avoid re-renders
  const stableOnRangeChange = useCallback(onRangeChange, []);

  // Update local state when props change (e.g., loading existing PO)
  useEffect(() => {
    setRangeStartStr(initialStart?.toString() ?? "");
    setRangeEndStr(initialEnd?.toString() ?? "");
  }, [initialStart, initialEnd]);

  // Validate range on input change
  useEffect(() => {
    const validateRange = async () => {
      const start = rangeStartStr ? parseInt(rangeStartStr, 10) : null;
      const end = rangeEndStr ? parseInt(rangeEndStr, 10) : null;

      // Check if both fields are empty
      if (!rangeStartStr && !rangeEndStr) {
        setValidationMessage("Enter card range for this order");
        setIsValid(false);
        stableOnRangeChange(null, null, false);
        return;
      }

      // Check if only one field is filled
      if (!rangeStartStr || !rangeEndStr || start === null || end === null) {
        setValidationMessage("Both start and end numbers required");
        setIsValid(false);
        stableOnRangeChange(null, null, false);
        return;
      }

      // Check range direction
      if (end < start) {
        setValidationMessage("End must be >= start");
        setIsValid(false);
        stableOnRangeChange(start, end, false);
        return;
      }

      // Calculate expected quantity based on stocking calculation
      // For PO, we use quantity as stocking_quantity
      const rangeValidation = validateRangeMatch(start, end, quantity);
      if (!rangeValidation.valid) {
        setValidationMessage(rangeValidation.message);
        setIsValid(false);
        stableOnRangeChange(start, end, false);
        return;
      }

      // Check for overlap with existing inventory ranges
      setCheckingOverlap(true);
      try {
        const overlapCheck = await checkPurchaseRangeOverlap(
          itemId,
          itemType,
          start,
          end,
          excludePoItemId
        );
        if (overlapCheck.hasOverlap) {
          setValidationMessage(overlapCheck.message);
          setIsValid(false);
          stableOnRangeChange(start, end, false);
          return;
        }
      } finally {
        setCheckingOverlap(false);
      }

      // All validations passed
      setValidationMessage(rangeValidation.message);
      setIsValid(true);
      stableOnRangeChange(start, end, true);
    };

    // Debounce the validation
    const timeoutId = setTimeout(validateRange, 300);
    return () => clearTimeout(timeoutId);
  }, [rangeStartStr, rangeEndStr, quantity, itemId, itemType, excludePoItemId, stableOnRangeChange]);

  return (
    <div className="col-span-full mt-2 p-2 border border-dashed border-accent/50 rounded bg-accent/5">
      <div className="flex items-center gap-2 mb-2">
        <Label className="text-xs font-medium text-accent">Card Range (Fleet/Gift)</Label>
      </div>
      <div className="grid grid-cols-[1fr_1fr_2fr] gap-2 items-end">
        <div>
          <Label className="text-xs">Start</Label>
          <Input
            type="number"
            value={rangeStartStr}
            onChange={(e) => setRangeStartStr(e.target.value)}
            placeholder="335000"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">End</Label>
          <Input
            type="number"
            value={rangeEndStr}
            onChange={(e) => setRangeEndStr(e.target.value)}
            placeholder="339999"
            className="h-8 text-xs"
          />
        </div>
        <div className={`flex items-center gap-1 text-xs ${isValid ? "text-green-600" : "text-destructive"}`}>
          {checkingOverlap ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking...
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
    </div>
  );
}
