import React, { useState, useEffect } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe, StripeElementsOptions, StripeCardElementOptions } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStripePublishableKey } from '@/hooks/useStripePublishableKey';

interface AddCardFormProps {
  stripeCustomerId: string;
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
}

interface SetupFormProps {
  clientSecret: string;
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
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

function SetupForm({ clientSecret, onSuccess, onCancel }: SetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
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
      const { error: submitError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (submitError) {
        setError(submitError.message || 'Failed to save card');
        setProcessing(false);
        return;
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        const paymentMethodId = typeof setupIntent.payment_method === 'string' 
          ? setupIntent.payment_method 
          : setupIntent.payment_method?.id;
        
        if (paymentMethodId) {
          onSuccess(paymentMethodId);
        } else {
          setError('Card saved but unable to retrieve payment method ID');
        }
      } else {
        setError('Setup was not completed successfully');
      }
    } catch (err: any) {
      console.error('Setup error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3 border rounded-md bg-background">
        <CardElement options={cardElementOptions} />
      </div>
      
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={processing}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button 
          type="submit" 
          className="flex-1"
          disabled={!stripe || processing}
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving Card...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Save Card
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export function AddCardForm({ stripeCustomerId, onSuccess, onCancel }: AddCardFormProps) {
  const { publishableKey, isLoading: loadingKey, isConfigured } = useStripePublishableKey();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const keyError = !isConfigured && !loadingKey ? 'Stripe is not configured' : null;
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);

  useEffect(() => {
    if (publishableKey) {
      setStripePromise(loadStripe(publishableKey));
    }
  }, [publishableKey]);

  useEffect(() => {
    const createSetupIntent = async () => {
      if (!stripeCustomerId) {
        setError('No Stripe customer ID available');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke('create-stripe-setup-intent', {
          body: { stripe_customer_id: stripeCustomerId }
        });

        if (fnError) {
          let errorMessage = fnError.message || 'Failed to create setup intent';
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

        if (!data?.client_secret) {
          throw new Error('No client secret returned');
        }

        setClientSecret(data.client_secret);
      } catch (err: any) {
        console.error('Error creating SetupIntent:', err);
        setError(err.message || 'Failed to initialize card form');
      } finally {
        setLoading(false);
      }
    };

    if (!loadingKey && publishableKey) {
      createSetupIntent();
    }
  }, [stripeCustomerId, loadingKey, publishableKey]);

  if (loadingKey || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Preparing card form...</p>
      </div>
    );
  }

  if (keyError || error) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{keyError || error}</p>
        </div>
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (!stripePromise || !clientSecret) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">Unable to initialize payment form</p>
        </div>
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#0ea5e9',
      },
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Add New Payment Method</h3>
      </div>
      
      <Elements stripe={stripePromise} options={options}>
        <SetupForm clientSecret={clientSecret} onSuccess={onSuccess} onCancel={onCancel} />
      </Elements>
    </div>
  );
}
