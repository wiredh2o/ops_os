import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { OrderDetailsDisplay } from "@/components/payment/OrderDetailsDisplay";
import { CustomerPaymentForm } from "@/components/payment/CustomerPaymentForm";
import { PaymentSuccessView } from "@/components/payment/PaymentSuccessView";
import { Loader2 } from "lucide-react";

interface OrderData {
  order: {
    id: string;
    order_number: string;
    order_type: string;
    status: string;
    created_at: string;
  };
  customer: {
    name: string;
    email: string;
    phone: string;
  } | null;
  line_items: Array<{
    id: string;
    item_name: string;
    item_sku: string | null;
    item_type: string;
    quantity: number;
    unit_price: number | null;
    total_price: number | null;
    notes: string | null;
    is_taxable: boolean;
    tax_amount: number | null;
    repair_item_id: string | null;
  }>;
  repair_items: Array<{
    id: string;
    item_description: string;
    diagnosis_notes: string | null;
    repair_notes: string | null;
    actual_issue: string | null;
    repair_item_photos: Array<{
      id: string;
      file_path: string;
      photo_type: string;
      signed_url: string | null;
    }>;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    tax_lines?: unknown;
    shipping: number;
    total: number;
  };
  payment: {
    client_secret: string | null;
    stripe_customer_id: string | null;
  };
}

type PageState = "loading" | "error" | "expired" | "already_paid" | "ready" | "success";

export default function CustomerPayment() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchOrderData();
    } else {
      setPageState("error");
      setErrorMessage("Invalid payment link");
    }
  }, [token]);

  const fetchOrderData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-order-by-token", {
        body: { token },
      });

      if (error) {
        console.error("Error fetching order:", error);
        setPageState("error");
        setErrorMessage("Failed to load order details");
        return;
      }

      if (data.error) {
        if (data.already_paid) {
          setPageState("already_paid");
          setPaidAt(data.paid_at);
          setOrderData({ 
            order: { order_number: data.order_number } 
          } as OrderData);
        } else if (data.error.includes("expired")) {
          setPageState("expired");
          setErrorMessage(data.error);
        } else {
          setPageState("error");
          setErrorMessage(data.error);
        }
        return;
      }

      setOrderData(data);
      setPageState("ready");
    } catch (err) {
      console.error("Error:", err);
      setPageState("error");
      setErrorMessage("An unexpected error occurred");
    }
  };

  const handlePaymentSuccess = () => {
    setPageState("success");
  };

  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (pageState === "error" || pageState === "expired") {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <div className="bg-background rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-destructive text-2xl">✕</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">
            {pageState === "expired" ? "Link Expired" : "Invalid Link"}
          </h1>
          <p className="text-muted-foreground">
            {errorMessage || "This payment link is no longer valid."}
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Please contact support if you need assistance.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === "already_paid") {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <div className="bg-background rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-green-600 text-2xl">✓</span>
          </div>
          <h1 className="text-xl font-semibold mb-2">Already Paid</h1>
          <p className="text-muted-foreground">
            Order #{orderData?.order?.order_number} has already been paid.
          </p>
          {paidAt && (
            <p className="text-sm text-muted-foreground mt-2">
              Paid on {new Date(paidAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (pageState === "success" && orderData) {
    return (
      <PaymentSuccessView
        orderNumber={orderData.order.order_number}
        amount={orderData.totals.total}
        customerEmail={orderData.customer?.email}
        customerPhone={orderData.customer?.phone}
      />
    );
  }

  if (!orderData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-background rounded-lg shadow-lg overflow-hidden">
          <OrderDetailsDisplay
            order={orderData.order}
            customer={orderData.customer}
            lineItems={orderData.line_items}
            repairItems={orderData.repair_items}
            totals={orderData.totals}
          />
          
          {orderData.payment.client_secret && (
            <CustomerPaymentForm
              clientSecret={orderData.payment.client_secret}
              amount={orderData.totals.total}
              token={token!}
              stripeCustomerId={orderData.payment.stripe_customer_id}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </div>
      </div>
    </div>
  );
}
