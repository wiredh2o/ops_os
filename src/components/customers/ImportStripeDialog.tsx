import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ImportStripeDialogProps {
  open: boolean;
  onClose: () => void;
  importResult: {
    created: number;
    updated: number;
    skipped: number;
    errors?: string[];
  };
  newCustomerIds: string[];
}

type DialogStep = "summary" | "processing" | "complete";

interface StripeCreationResult {
  created: number;
  failed: number;
  failures: Array<{ id: string; name: string; error: string }>;
}

export function ImportStripeDialog({
  open,
  onClose,
  importResult,
  newCustomerIds,
}: ImportStripeDialogProps) {
  const [step, setStep] = useState<DialogStep>("summary");
  const [progress, setProgress] = useState(0);
  const [currentCustomer, setCurrentCustomer] = useState("");
  const [stripeResult, setStripeResult] = useState<StripeCreationResult | null>(null);

  const hasNewCustomers = newCustomerIds.length > 0;

  const handleCreateInStripe = async () => {
    if (newCustomerIds.length === 0) {
      onClose();
      return;
    }

    setStep("processing");
    setProgress(0);

    try {
      const { data, error } = await supabase.functions.invoke("batch-create-stripe-customers", {
        body: { 
          customer_ids: newCustomerIds,
        },
      });

      if (error) {
        console.error("Batch Stripe creation error:", error);
        setStripeResult({
          created: 0,
          failed: newCustomerIds.length,
          failures: [{ id: "", name: "All customers", error: error.message }],
        });
      } else {
        setStripeResult(data.results);
      }
    } catch (err: any) {
      console.error("Stripe batch error:", err);
      setStripeResult({
        created: 0,
        failed: newCustomerIds.length,
        failures: [{ id: "", name: "All customers", error: err.message }],
      });
    }

    setProgress(100);
    setStep("complete");
  };

  const handleSkip = () => {
    onClose();
  };

  const handleDone = () => {
    setStep("summary");
    setProgress(0);
    setStripeResult(null);
    onClose();
  };

  // Step 1: Import Summary
  if (step === "summary") {
    return (
      <Dialog open={open} onOpenChange={handleDone}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex flex-col items-center text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <DialogTitle className="text-xl">Import Complete</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Customers imported:</span>
              <span className="font-medium">{importResult.created}</span>
            </div>
            <div className="flex justify-between">
              <span>Customers updated:</span>
              <span className="font-medium">{importResult.updated}</span>
            </div>
            {importResult.skipped > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Skipped:</span>
                <span>{importResult.skipped}</span>
              </div>
            )}
          </div>

          {hasNewCustomers && (
            <>
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-2">Create Stripe Accounts?</h4>
                <p className="text-sm text-muted-foreground">
                  {newCustomerIds.length} new customer{newCustomerIds.length !== 1 ? "s" : ""} need Stripe 
                  accounts to process payments. Would you like to create them now?
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={handleSkip}>
                  Skip for Now
                </Button>
                <Button onClick={handleCreateInStripe}>
                  Create in Stripe
                </Button>
              </DialogFooter>
            </>
          )}

          {!hasNewCustomers && (
            <DialogFooter>
              <Button onClick={handleDone} className="w-full">
                Done
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Step 2: Processing
  if (step === "processing") {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center">Creating Stripe Customers...</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Processing {newCustomerIds.length} customer{newCustomerIds.length !== 1 ? "s" : ""}...
              </span>
            </div>
            {currentCustomer && (
              <p className="text-center text-sm">Processing: {currentCustomer}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 3: Complete
  return (
    <Dialog open={open} onOpenChange={handleDone}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex flex-col items-center text-center space-y-3">
            {stripeResult && stripeResult.failed === 0 ? (
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            ) : (
              <AlertTriangle className="h-12 w-12 text-yellow-500" />
            )}
            <DialogTitle className="text-xl">Stripe Customers Created</DialogTitle>
          </div>
        </DialogHeader>

        {stripeResult && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Successfully linked to Stripe:</span>
              <span className="font-medium text-green-600">{stripeResult.created}</span>
            </div>
            {stripeResult.failed > 0 && (
              <div className="flex justify-between text-yellow-600">
                <span>Failed:</span>
                <span className="font-medium">{stripeResult.failed}</span>
              </div>
            )}
          </div>
        )}

        {stripeResult && stripeResult.failures.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm max-h-32 overflow-y-auto">
            <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
              Failed customers:
            </p>
            {stripeResult.failures.slice(0, 5).map((f, i) => (
              <p key={i} className="text-yellow-700 dark:text-yellow-300 text-xs">
                {f.name}: {f.error}
              </p>
            ))}
            {stripeResult.failures.length > 5 && (
              <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-1">
                ...and {stripeResult.failures.length - 5} more
              </p>
            )}
            <p className="mt-2 text-muted-foreground text-xs">
              Failed customers can be linked manually from their customer details page.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleDone} className="w-full">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
