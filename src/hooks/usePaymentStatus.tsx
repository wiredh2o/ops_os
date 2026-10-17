import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  type?: 'payment_method' | 'source';
}

export type PaymentStatus = 
  | 'idle' 
  | 'loading' 
  | 'no_stripe_customer' 
  | 'no_payment_method' 
  | 'expired_cards' 
  | 'expiring_soon' 
  | 'valid';

const EXPIRING_SOON_DAYS = 30;

/**
 * Calculate days until a card expires (end of the expiration month)
 */
function calculateDaysUntilExpiry(expMonth: number, expYear: number): number {
  const now = new Date();
  // Card is valid through the last day of the expiration month
  // Set to the first day of the NEXT month, then subtract 1 day
  const expirationDate = new Date(expYear, expMonth, 0); // Day 0 of next month = last day of exp month
  const diffTime = expirationDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a card is expired
 */
function isCardExpired(expMonth: number, expYear: number): boolean {
  return calculateDaysUntilExpiry(expMonth, expYear) < 0;
}

export function usePaymentStatus() {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [soonestExpiringCard, setSoonestExpiringCard] = useState<PaymentMethod | null>(null);
  const [daysUntilExpiry, setDaysUntilExpiry] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkPaymentStatus = useCallback(async (stripeCustomerId: string | null) => {
    // Reset state
    setPaymentMethods([]);
    setSoonestExpiringCard(null);
    setDaysUntilExpiry(null);

    // No Stripe customer linked
    if (!stripeCustomerId) {
      setPaymentStatus('no_stripe_customer');
      return;
    }

    setPaymentStatus('loading');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('get-stripe-payment-methods', {
        body: { stripe_customer_id: stripeCustomerId }
      });

      if (error) {
        console.error('Error fetching payment methods:', error);
        setPaymentStatus('no_payment_method');
        return;
      }

      // Handle customer not found (likely TEST/LIVE mismatch)
      if (data?.error === 'stripe_customer_not_found') {
        console.warn('Stripe customer not found:', data.message);
        setPaymentStatus('no_stripe_customer');
        return;
      }

      const methods: PaymentMethod[] = data?.payment_methods || [];
      setPaymentMethods(methods);

      if (methods.length === 0) {
        setPaymentStatus('no_payment_method');
        return;
      }

      // Analyze card expiration dates
      const validCards: PaymentMethod[] = [];
      const expiringCards: { card: PaymentMethod; days: number }[] = [];
      
      for (const pm of methods) {
        const days = calculateDaysUntilExpiry(pm.exp_month, pm.exp_year);
        
        if (isCardExpired(pm.exp_month, pm.exp_year)) {
          // Card is already expired - skip
          continue;
        }
        
        if (days <= EXPIRING_SOON_DAYS) {
          expiringCards.push({ card: pm, days });
        } else {
          validCards.push(pm);
        }
      }

      // All cards expired
      if (validCards.length === 0 && expiringCards.length === 0) {
        setPaymentStatus('expired_cards');
        return;
      }

      // Some cards expiring soon (and no valid cards with 30+ days)
      if (validCards.length === 0 && expiringCards.length > 0) {
        // Find the soonest expiring card
        const soonest = expiringCards.reduce((a, b) => a.days < b.days ? a : b);
        setSoonestExpiringCard(soonest.card);
        setDaysUntilExpiry(soonest.days);
        setPaymentStatus('expiring_soon');
        return;
      }

      // Has valid cards (might also have some expiring soon)
      // Check if the soonest card is expiring soon for a warning
      const allNonExpired = [...validCards, ...expiringCards.map(e => e.card)];
      if (expiringCards.length > 0) {
        const soonest = expiringCards.reduce((a, b) => a.days < b.days ? a : b);
        setSoonestExpiringCard(soonest.card);
        setDaysUntilExpiry(soonest.days);
        setPaymentStatus('expiring_soon');
      } else {
        setPaymentStatus('valid');
      }

    } catch (err) {
      console.error('Error checking payment status:', err);
      setPaymentStatus('no_payment_method');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetPaymentStatus = useCallback(() => {
    setPaymentStatus('idle');
    setPaymentMethods([]);
    setSoonestExpiringCard(null);
    setDaysUntilExpiry(null);
  }, []);

  return {
    paymentStatus,
    paymentMethods,
    soonestExpiringCard,
    daysUntilExpiry,
    isLoading,
    checkPaymentStatus,
    resetPaymentStatus,
    validCardCount: paymentMethods.filter(pm => !isCardExpired(pm.exp_month, pm.exp_year)).length,
  };
}
