import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Check, Clock, AlertCircle, Loader2, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentStatus, PaymentMethod } from "@/hooks/usePaymentStatus";

interface PaymentStatusAlertProps {
  status: PaymentStatus;
  validCardCount: number;
  soonestExpiringCard: PaymentMethod | null;
  daysUntilExpiry: number | null;
  onManageCards: () => void;
  onLinkStripe: () => void;
}

export const PaymentStatusAlert: React.FC<PaymentStatusAlertProps> = ({
  status,
  validCardCount,
  soonestExpiringCard,
  daysUntilExpiry,
  onManageCards,
  onLinkStripe,
}) => {
  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <Alert className="border-muted bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-muted-foreground">Checking payment methods...</span>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'valid') {
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-green-700 dark:text-green-300">
            Payment method on file ({validCardCount} card{validCardCount !== 1 ? 's' : ''})
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-green-700 hover:text-green-800 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900"
            onClick={onManageCards}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Manage Cards
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'expiring_soon' && soonestExpiringCard && daysUntilExpiry !== null) {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-300">
            Card ending in {soonestExpiringCard.last4} expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
            onClick={onManageCards}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Manage Cards
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'expired_cards') {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-300">
            All cards on file are expired
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
            onClick={onManageCards}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Add Card
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'no_payment_method') {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-700 dark:text-amber-300">
            No payment method on file
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
            onClick={onManageCards}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Add Card
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'no_stripe_customer') {
    return (
      <Alert className="border-destructive/50 bg-destructive/10">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-destructive">
            No Stripe customer linked
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onLinkStripe}
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Link Stripe
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};
