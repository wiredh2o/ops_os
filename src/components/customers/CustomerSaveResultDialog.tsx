import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface CustomerSaveResultDialogProps {
  open: boolean;
  onClose: () => void;
  dbSuccess: boolean;
  dbError?: string;
  stripeSuccess: boolean;
  stripeError?: string;
  customerName: string;
}

export function CustomerSaveResultDialog({
  open,
  onClose,
  dbSuccess,
  dbError,
  stripeSuccess,
  stripeError,
  customerName,
}: CustomerSaveResultDialogProps) {
  // Determine the dialog state
  const isFullSuccess = dbSuccess && stripeSuccess;
  const isPartialSuccess = dbSuccess && !stripeSuccess;
  const isFailure = !dbSuccess;

  const getIcon = () => {
    if (isFullSuccess) return <CheckCircle2 className="h-12 w-12 text-green-500" />;
    if (isPartialSuccess) return <AlertTriangle className="h-12 w-12 text-yellow-500" />;
    return <XCircle className="h-12 w-12 text-destructive" />;
  };

  const getTitle = () => {
    if (isFullSuccess) return "Customer Saved Successfully";
    if (isPartialSuccess) return "Customer Saved with Warning";
    return "Error Saving Customer";
  };

  const getDescription = () => {
    if (isFullSuccess) {
      return `"${customerName}" has been created and linked to Stripe for payment processing.`;
    }
    if (isPartialSuccess) {
      return `"${customerName}" was saved to the database, but we couldn't create them in Stripe.`;
    }
    return `Failed to save customer to database:`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex flex-col items-center text-center space-y-3">
            {getIcon()}
            <DialogTitle className="text-xl">{getTitle()}</DialogTitle>
            <DialogDescription className="text-center">
              {getDescription()}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Show error details if any */}
        {isPartialSuccess && stripeError && (
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm">
            <p className="font-medium text-yellow-800 dark:text-yellow-200">Error:</p>
            <p className="text-yellow-700 dark:text-yellow-300">{stripeError}</p>
            <p className="mt-2 text-muted-foreground">
              You can link to Stripe later from the customer details page.
            </p>
          </div>
        )}

        {isFailure && dbError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm">
            <p className="text-destructive">{dbError}</p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
