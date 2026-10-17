import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStripePublishableKey } from "@/hooks/useStripePublishableKey";

interface CustomerPaymentFormProps {
  clientSecret: string;
  amount: number;
  token: string;
  stripeCustomerId: string | null;
  onSuccess: () => void;
}

interface PaymentFormInnerProps {
  amount: number;
  token: string;
  stripeCustomerId: string | null;
  onSuccess: () => void;
}

function PaymentFormInner({ amount, token, stripeCustomerId, onSuccess }: PaymentFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(true);

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amt);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
          save_payment_method: saveCard && !!stripeCustomerId,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message || "Payment failed");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        // Notify backend of successful payment
        const { error: processError } = await supabase.functions.invoke(
          "process-token-payment",
          {
            body: {
              token,
              payment_intent_id: paymentIntent.id,
            },
          }
        );

        if (processError) {
          console.error("Error processing payment:", processError);
          // Payment succeeded but backend update failed - still show success
        }

        onSuccess();
      }
    } catch (err) {
      console.error("Payment error:", err);
      setErrorMessage("An unexpected error occurred");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 border-t">
      <h2 className="font-semibold mb-4">Payment</h2>

      <div className="mb-4">
        <PaymentElement />
      </div>

      {stripeCustomerId && (
        <div className="flex items-center space-x-2 mb-4">
          <Checkbox
            id="save-card"
            checked={saveCard}
            onCheckedChange={(checked) => setSaveCard(checked === true)}
          />
          <Label htmlFor="save-card" className="text-sm cursor-pointer">
            Save this card for future purchases
          </Label>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {errorMessage}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Pay ${formatCurrency(amount)}`
        )}
      </Button>
    </form>
  );
}

export function CustomerPaymentForm({
  clientSecret,
  amount,
  token,
  stripeCustomerId,
  onSuccess,
}: CustomerPaymentFormProps) {
  const { publishableKey, isLoading } = useStripePublishableKey();

  if (isLoading || !publishableKey) {
    return (
      <div className="p-6 border-t flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#2563eb",
          },
        },
      }}
    >
      <PaymentFormInner
        amount={amount}
        token={token}
        stripeCustomerId={stripeCustomerId}
        onSuccess={onSuccess}
      />
    </Elements>
  );
}
