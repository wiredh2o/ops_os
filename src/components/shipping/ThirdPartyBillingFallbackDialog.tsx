import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface ThirdPartyBillingFallbackDialogProps {
  open: boolean;
  onClose: () => void;
  onUseCompanyAccount: () => void;
  carrierName: string;
  accountNumber: string;
  errorMessage: string;
}

export function ThirdPartyBillingFallbackDialog({
  open,
  onClose,
  onUseCompanyAccount,
  carrierName,
  accountNumber,
  errorMessage,
}: ThirdPartyBillingFallbackDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Third-Party Billing Failed
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              {carrierName} could not bill to the customer's account{' '}
              <span className="font-mono font-medium">#{accountNumber}</span>.
            </p>
            <p className="text-sm bg-muted p-2 rounded">
              {errorMessage}
            </p>
            <p>
              Would you like to ship using your company's {carrierName} account instead? 
              You can invoice the customer separately for shipping charges.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onUseCompanyAccount}>
            Use Our Account Instead
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
