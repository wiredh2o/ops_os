import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STORAGE_KEY = 'thermal-print-instructions-dismissed';

export function PrintInstructionsTooltip() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const wasDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    setDismissed(wasDismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-sm">
              Works with thermal label printers (4×6.75") and standard laser printers. Select "Fit to page" in the print dialog.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Info className="h-4 w-4 text-primary cursor-help animate-pulse" />
        </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2">
              <p className="text-sm font-medium">Printing Tips</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Works with thermal (4×6.75") or laser printers</li>
                <li>• Select "Fit to page" in print dialog</li>
                <li>• Disable headers/footers if prompted</li>
              </ul>
            <button
              onClick={handleDismiss}
              className="text-xs text-primary hover:underline"
            >
              Got it, don't show again
            </button>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
