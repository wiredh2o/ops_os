import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { queueContactNotification } from "../_shared/notification-outbox.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

async function getEmailTemplate(supabase: ReturnType<typeof createClient>, subjectKey: string, bodyKey: string) {
  const { data: subjectSetting } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", subjectKey)
    .eq("is_active", true)
    .maybeSingle();

  const { data: bodySetting } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", bodyKey)
    .eq("is_active", true)
    .maybeSingle();

  return {
    subject: subjectSetting?.setting_value || null,
    body: bodySetting?.setting_value || null,
  };
}

async function sendConfirmationEmail(
  supabase: ReturnType<typeof createClient>,
  to: string,
  orderNumber: string,
  customerName: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);

  const paidDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Fetch templates from database
  const { subject: subjectTemplate, body: bodyTemplate } = await getEmailTemplate(
    supabase,
    "email_payment_confirmation_subject",
    "email_payment_confirmation_body"
  );

  const templateVars: Record<string, string> = {
    customer_name: customerName,
    order_number: orderNumber,
    amount: formattedAmount,
    payment_date: paidDate,
  };

  let emailSubject: string;
  let htmlContent: string;

  if (subjectTemplate && bodyTemplate) {
    emailSubject = replaceTemplateVariables(subjectTemplate, templateVars);
    htmlContent = replaceTemplateVariables(bodyTemplate, templateVars);
  } else {
    // Default template
    emailSubject = `Payment Received - Order #${orderNumber}`;
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 60px; height: 60px; background-color: #10b981; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="color: white; font-size: 32px;">✓</span>
            </div>
          </div>
          
          <h1 style="color: #333; margin-bottom: 8px; font-size: 24px; text-align: center;">Payment Received!</h1>
          
          <p style="color: #333; font-size: 16px;">Hi ${customerName},</p>
          
          <p style="color: #333; font-size: 16px;">Thank you for your payment!</p>
          
          <div style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 24px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #666;">Order Number</span>
              <span style="color: #333; font-weight: 500;">#${orderNumber}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #666;">Amount Paid</span>
              <span style="color: #333; font-weight: 500;">${formattedAmount}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #666;">Date</span>
              <span style="color: #333; font-weight: 500;">${paidDate}</span>
            </div>
          </div>
          
          <p style="color: #333; font-size: 16px;">
            Your order is now being prepared for shipment. You'll receive tracking information once it ships.
          </p>
          
          <p style="color: #999; font-size: 13px; margin-top: 32px;">
            If you have any questions, please contact us.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  const result = await sendResendEmail({
    to: to,
    subject: emailSubject,
    html: htmlContent,
    from: { email: "noreply@washgear.com", name: "WashGear" },
  });

  if (result.success) {
    console.log("Confirmation email sent to:", to);
  }

  return result;
}

async function sendConfirmationSMS(
  to: string,
  orderNumber: string,
  amount: number
): Promise<{ success: boolean; error?: string; messageSid?: string }> {
  return queueContactNotification(to, 'text', `Payment received - ${orderNumber}`, `Payment of $${amount.toFixed(2)} received for order #${orderNumber}.`);

}

async function logNotification(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  notificationType: string,
  recipient: string,
  message: string,
  status: string,
  errorMessage?: string,
  externalId?: string
) {
  try {
    await supabase.from("notification_log").insert({
      order_id: orderId,
      order_type: "production_order",
      notification_type: notificationType,
      recipient: recipient,
      message: message,
      status: status,
      error_message: errorMessage,
      external_id: externalId,
      subject: "Payment Confirmation",
    });
  } catch (error) {
    console.error("Failed to log notification:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, payment_intent_id } = await req.json();

    if (!token || !payment_intent_id) {
      return new Response(
        JSON.stringify({ error: "Token and payment_intent_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing payment for token:", token, "PaymentIntent:", payment_intent_id);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order by payment token
    const { data: order, error: orderError } = await supabase
      .from("production_orders")
      .select(`
        id,
        order_number,
        payment_status,
        shipping_cost,
        companies:customer_id (
          id,
          name,
          email,
          phone
        )
      `)
      .eq("payment_token", token)
      .single();

    if (orderError || !order) {
      console.error("Order not found:", orderError);
      return new Response(
        JSON.stringify({ error: "Invalid payment token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify payment with Stripe
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== "succeeded") {
      return new Response(
        JSON.stringify({ error: "Payment has not been completed", status: paymentIntent.status }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amountPaid = paymentIntent.amount / 100; // Convert from cents

    // Update order payment status
    const { error: updateError } = await supabase
      .from("production_orders")
      .update({
        payment_status: "paid",
        payment_received_at: new Date().toISOString(),
        stripe_payment_intent_id: payment_intent_id,
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Order payment status updated to paid:", order.id);

    // Send confirmation notifications
    const customer = order.companies as any;
    const confirmationResults = {
      email: { sent: false, error: null as string | null },
      sms: { sent: false, error: null as string | null },
    };

    if (customer?.email) {
      const emailResult = await sendConfirmationEmail(
        supabase,
        customer.email,
        order.order_number,
        customer.name,
        amountPaid
      );
      confirmationResults.email.sent = emailResult.success;
      confirmationResults.email.error = emailResult.error || null;

      await logNotification(
        supabase,
        order.id,
        "email",
        customer.email,
        `Payment confirmation for ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountPaid)}`,
        emailResult.success ? "queued" : "failed",
        emailResult.error
      );
    }

    if (customer?.phone && !customer?.email) {
      const smsResult = await sendConfirmationSMS(
        customer.phone,
        order.order_number,
        amountPaid
      );
      confirmationResults.sms.sent = smsResult.success;
      confirmationResults.sms.error = smsResult.error || null;

      await logNotification(
        supabase,
        order.id,
        "sms",
        customer.phone,
        `Payment confirmation for ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountPaid)}`,
        smsResult.success ? "queued" : "failed",
        smsResult.error,
        smsResult.messageSid
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_number: order.order_number,
        amount_paid: amountPaid,
        confirmations: confirmationResults,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in process-token-payment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
