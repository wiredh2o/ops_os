import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Calculator as CalculatorIcon } from "lucide-react";
// Import formatCurrency utility function
import { formatCurrency } from "@/lib/utils";

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onValueSelect?: (value: string) => void;
  initialValue?: string;
}

interface TapeEntry {
  operation: string;
  result: string;
}

export const Calculator: React.FC<CalculatorProps> = ({
  isOpen,
  onClose,
  onValueSelect,
  initialValue = ""
}) => {
  const [display, setDisplay] = useState(initialValue || "0");
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);
  const [tape, setTape] = useState<TapeEntry[]>([]);

  useEffect(() => {
    if (initialValue && initialValue !== "0") {
      setDisplay(initialValue);
    }
  }, [initialValue]);

  const addToTape = (operation: string, result: string) => {
    setTape(prev => [...prev, { operation, result }]);
  };

  const inputNumber = (num: string) => {
    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay(display === "0" ? num : display + num);
    }
  };

  const inputDecimal = () => {
    if (waitingForNewValue) {
      setDisplay("0.");
      setWaitingForNewValue(false);
    } else if (display.indexOf(".") === -1) {
      setDisplay(display + ".");
    }
  };

  const clear = () => {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForNewValue(false);
  };

  const clearAll = () => {
    clear();
    setTape([]);
  };

  const performOperation = (nextOperation?: string) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(display);
    } else if (operation) {
      const currentValue = previousValue || "0";
      const prev = parseFloat(currentValue);
      let result: number;

      switch (operation) {
        case "+":
          result = prev + inputValue;
          break;
        case "-":
          result = prev - inputValue;
          break;
        case "×":
          result = prev * inputValue;
          break;
        case "÷":
          result = inputValue !== 0 ? prev / inputValue : 0;
          break;
        default:
          return;
      }

      const resultStr = String(result);
      const operationStr = `${currentValue} ${operation} ${display} =`;
      
      addToTape(operationStr, resultStr);
      setDisplay(resultStr);
      setPreviousValue(resultStr);
    }

    setWaitingForNewValue(true);
    setOperation(nextOperation || null);
  };

  const handleUseValue = () => {
    if (onValueSelect) {
      // Format the value to 4 decimal places for full precision
      const formattedValue = parseFloat(display).toFixed(4);
      onValueSelect(formattedValue);
    }
    onClose();
  };

  const buttonClass = "h-12 text-lg font-medium transition-colors";
  const numberButtonClass = `${buttonClass} bg-card text-card-foreground hover:bg-muted border`;
  const operatorButtonClass = `${buttonClass} bg-primary text-primary-foreground hover:bg-primary/90`;
  const specialButtonClass = `${buttonClass} bg-secondary text-secondary-foreground hover:bg-secondary/80`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <CalculatorIcon className="h-4 w-4" />
              Calculator
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Tape Display */}
          <div className="h-24 bg-muted rounded-md p-2">
            <ScrollArea className="h-full">
              <div className="space-y-1 text-xs font-mono">
                {tape.length === 0 ? (
                  <div className="text-muted-foreground text-center py-6">
                    Calculation history will appear here
                  </div>
                ) : (
                  tape.map((entry, index) => (
                    <div key={index} className="space-y-0.5">
                      <div className="text-muted-foreground">{entry.operation}</div>
                      <div className="text-right font-semibold">{entry.result}</div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Display */}
          <div className="bg-background border rounded-md p-3">
            <div className="text-right text-2xl font-mono min-h-[2rem] overflow-hidden">
              {display}
            </div>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-4 gap-2">
            {/* Row 1 */}
            <Button onClick={clearAll} className={`${specialButtonClass} col-span-2`}>
              AC
            </Button>
            <Button onClick={clear} className={specialButtonClass}>
              C
            </Button>
            <Button onClick={() => performOperation("÷")} className={operatorButtonClass}>
              ÷
            </Button>

            {/* Row 2 */}
            <Button onClick={() => inputNumber("7")} className={numberButtonClass}>
              7
            </Button>
            <Button onClick={() => inputNumber("8")} className={numberButtonClass}>
              8
            </Button>
            <Button onClick={() => inputNumber("9")} className={numberButtonClass}>
              9
            </Button>
            <Button onClick={() => performOperation("×")} className={operatorButtonClass}>
              ×
            </Button>

            {/* Row 3 */}
            <Button onClick={() => inputNumber("4")} className={numberButtonClass}>
              4
            </Button>
            <Button onClick={() => inputNumber("5")} className={numberButtonClass}>
              5
            </Button>
            <Button onClick={() => inputNumber("6")} className={numberButtonClass}>
              6
            </Button>
            <Button onClick={() => performOperation("-")} className={operatorButtonClass}>
              -
            </Button>

            {/* Row 4 */}
            <Button onClick={() => inputNumber("1")} className={numberButtonClass}>
              1
            </Button>
            <Button onClick={() => inputNumber("2")} className={numberButtonClass}>
              2
            </Button>
            <Button onClick={() => inputNumber("3")} className={numberButtonClass}>
              3
            </Button>
            <Button onClick={() => performOperation("+")} className={operatorButtonClass}>
              +
            </Button>

            {/* Row 5 */}
            <Button onClick={() => inputNumber("0")} className={`${numberButtonClass} col-span-2`}>
              0
            </Button>
            <Button onClick={inputDecimal} className={numberButtonClass}>
              .
            </Button>
            <Button onClick={() => performOperation()} className={operatorButtonClass}>
              =
            </Button>
          </div>

          {/* Use Value Button */}
          {onValueSelect && (
            <Button onClick={handleUseValue} className="w-full">
              Use Value: {formatCurrency(parseFloat(display))}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};