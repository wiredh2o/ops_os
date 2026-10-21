import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface USPSBalanceWarningProps {
  currentBalance: number;
  requiredAmount: number;
  onRetry?: () => void;
}

export function USPSBalanceWarning({
  currentBalance,
  requiredAmount,
  onRetry,
}: USPSBalanceWarningProps) {
  const shortfall = requiredAmount - currentBalance;

  return (
    <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <CreditCard className="h-4 w-4" />
        Insufficient USPS EPS Balance
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Required</p>
            <p className="font-semibold"><FinancialGuard kind="supplier_price">{formatCurrency(requiredAmount)}</FinancialGuard></p>
          </div>
          <div>
            <p className="text-muted-foreground">Current Balance</p>
            <p className="font-semibold text-amber-600"><FinancialGuard kind="supplier_price">{formatCurrency(currentBalance)}</FinancialGuard></p>
          </div>
          <div>
            <p className="text-muted-foreground">Shortfall</p>
            <p className="font-semibold text-destructive"><FinancialGuard kind="supplier_price">{formatCurrency(shortfall)}</FinancialGuard></p>
          </div>
        </div>

        <p className="text-sm">
          Please fund your EPS account before creating this label.
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a
              href="https://gateway.usps.com/eAdmin/view/signin"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Fund EPS Account
            </a>
          </Button>
          
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Check Again
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
