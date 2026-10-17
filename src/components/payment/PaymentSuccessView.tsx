import React from "react";
import { CheckCircle, Mail, Phone } from "lucide-react";

interface PaymentSuccessViewProps {
  orderNumber: string;
  amount: number;
  customerEmail?: string;
  customerPhone?: string;
}

export function PaymentSuccessView({
  orderNumber,
  amount,
  customerEmail,
  customerPhone,
}: PaymentSuccessViewProps) {
  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amt);
  };

  const formatPhone = (phone: string) => {
    // Simple US phone formatting
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold mb-2">Payment Successful!</h1>
        <p className="text-muted-foreground mb-6">Thank you for your payment.</p>

        {/* Order Details */}
        <div className="bg-muted rounded-lg p-4 mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-muted-foreground">Order Number</span>
            <span className="font-medium">#{orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="font-medium">{formatCurrency(amount)}</span>
          </div>
        </div>

        {/* Confirmation Sent To */}
        {(customerEmail || customerPhone) && (
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-3">
              A confirmation has been sent to:
            </p>
            <div className="space-y-2">
              {customerEmail && (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{customerEmail}</span>
                </div>
              )}
              {customerPhone && (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{formatPhone(customerPhone)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Next Steps */}
        <div className="border-t pt-6">
          <h2 className="font-semibold mb-2">What's Next?</h2>
          <p className="text-sm text-muted-foreground">
            Your order is being prepared for shipment. You'll receive tracking
            information once it ships.
          </p>
        </div>

        {/* Contact Info */}
        <div className="mt-6 text-sm text-muted-foreground">
          <p>Questions? Contact us:</p>
          <p className="mt-1">
            <a href="tel:1-800-WASHGEAR" className="text-primary hover:underline">
              1-800-WASHGEAR
            </a>
            {" • "}
            <a href="mailto:support@washgear.com" className="text-primary hover:underline">
              support@washgear.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
