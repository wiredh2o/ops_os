import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import React, { useState, useEffect } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { StripeCardElementOptions } from '@stripe/stripe-js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, CreditCard, ArrowLeft, AlertCircle, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStripePublishableKey } from '@/hooks/useStripePublishableKey';
import { getStripe } from '@/lib/stripe';
import { formatCurrency } from '@/lib/utils';
import { Link } from 'react-router-dom';

export interface PaymentCompletionDetails {
  paymentIntentId: string;
  amount: number;
  paymentMethodType: string;
}

interface ManualCardEntryProps {
  customerId: string;
  stripeCustomerId: string | null;
  amount: number;
  orderId: string;
  orderNumber: string;
  onSuccess: (details: PaymentCompletionDetails) => void;
  onBack: () => void;
  isOneTimePayment?: boolean;
  forceSaveCard?: boolean;
}

const cardElementOptions: StripeCardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1a1a1a',
      '::placeholder': {
        color: '#6b7280',
      },
    },
    invalid: {
      color: '#ef4444',
    },
  },
};

function PaymentForm({ 
  amount, 
  clientSecret,
  saveCard, 
  onSaveCardChange,
  onSuccess, 
  onBack,
  processing,
  setProcessing,
  showSaveCardOption
}: {
  amount: number;
  clientSecret: string;
  saveCard: boolean;
  onSaveCardChange: (checked: boolean) => void;
  onSuccess: (details: PaymentCompletionDetails) => void;
  onBack: () => void;
  processing: boolean;
  setProcessing: (processing: boolean) => void;
  showSaveCardOption: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const { error: submitError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (submitError) {
        setError(submitError.message || 'Payment failed');
        setProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess({
          paymentIntentId: paymentIntent.id,
          amount: amount,
          paymentMethodType: paymentIntent.payment_method_types?.[0] || 'card',
        });
      } else if (paymentIntent && paymentIntent.status === 'requires_action') {
        setError('Additional authentication required. Please complete the verification.');
        setProcessing(false);
      } else {
        setError('Payment was not successful. Please try again.');
        setProcessing(false);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'An error occurred');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="mb-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">Amount to Charge</p>
            <p className="text-2xl font-bold text-primary"><FinancialGuard kind="revenue">{formatCurrency(amount)}</FinancialGuard></p>
          </div>
          
          <div className="p-3 border rounded-md bg-background">
            <CardElement options={cardElementOptions} />
          </div>
          
          {showSaveCardOption && (
            <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
              <Checkbox 
                id="saveCard" 
                checked={saveCard}
                onCheckedChange={(checked) => onSaveCardChange(checked === true)}
              />
              <Label htmlFor="saveCard" className="text-sm cursor-pointer">
                Save this card for future purchases
              </Label>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={processing}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={!stripe || processing}>
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Pay <FinancialGuard kind="revenue">{formatCurrency(amount)}</FinancialGuard>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export function ManualCardEntry({ 
  customerId,
  stripeCustomerId,
  amount, 
  orderId,
  orderNumber,
  onSuccess, 
  onBack,
  isOneTimePayment = false,
  forceSaveCard = false
}: ManualCardEntryProps) {
  const { publishableKey, isLoading: keyLoading, isConfigured } = useStripePublishableKey();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(forceSaveCard ? true : !isOneTimePayment);
  const [processing, setProcessing] = useState(false);
  
  const showSaveCardOption = !isOneTimePayment && !forceSaveCard;

  useEffect(() => {
    if (!keyLoading && isConfigured) {
      createPaymentIntent();
    } else if (!keyLoading && !isConfigured) {
      setLoading(false);
    }
  }, [keyLoading, isConfigured]);

  const createPaymentIntent = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          stripe_customer_id: stripeCustomerId,
          amount,
          order_id: orderId,
          order_number: orderNumber,
          save_card: saveCard,
        },
      });

      if (fnError) {
        let errorMessage = fnError.message || 'Failed to initialize payment';
        try {
          const bodyText = fnError.context?.body;
          if (bodyText) {
            const parsed = typeof bodyText === 'string' ? JSON.parse(bodyText) : bodyText;
            if (parsed?.error) {
              errorMessage = parsed.error;
            }
          }
        } catch {
          // Keep original error message
        }
        throw new Error(errorMessage);
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      if (data?.client_secret) {
        setClientSecret(data.client_secret);
      } else {
        throw new Error('No client secret returned');
      }
    } catch (err: any) {
      console.error('Error creating payment intent:', err);
      setError(err.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  if (keyLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">Initializing payment...</p>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="space-y-4">
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Stripe Not Configured
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  To accept card payments, add your Stripe publishable key in Settings → System Settings → Stripe Configuration.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Go to Settings
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-destructive text-sm p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={createPaymentIntent}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">Loading payment form...</p>
      </div>
    );
  }

  const stripePromise = getStripe(publishableKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Enter Card Details</h3>
      </div>

      <Elements 
        stripe={stripePromise} 
        options={{ 
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: 'hsl(var(--primary))',
            },
          },
        }}
      >
        <PaymentForm 
          amount={amount}
          clientSecret={clientSecret}
          saveCard={forceSaveCard ? true : saveCard}
          onSaveCardChange={setSaveCard}
          onSuccess={onSuccess}
          onBack={onBack}
          processing={processing}
          setProcessing={setProcessing}
          showSaveCardOption={showSaveCardOption}
        />
      </Elements>
    </div>
  );
}
