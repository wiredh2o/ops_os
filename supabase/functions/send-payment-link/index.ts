import { requireNotificationStaff } from "../_shared/notification-auth.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { queueContactNotification } from "../_shared/notification-outbox.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentLinkRequest {
  order_id: string;
  order_number: string;
  customer_email?: string;
  customer_phone?: string;
  customer_name: string;
  amount: number;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  // Handle conditional blocks
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
    const varValue = variables[varName];
    return varValue && varValue !== 'false' ? content : '';
  });
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

async function getCompanyLogoUrl(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_logo_url")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "https://pnawosyjmvibwjpegnrs.supabase.co/storage/v1/object/public/branding/company-logo.png";
}

async function getCompanyName(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_name")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "WashGear";
}

function buildItemsTable(items: any[]): string {
  if (!items || items.length === 0) {
    return '<p style="color: #6b7280; font-style: italic;">No items</p>';
  }

  let html = `
    <table class="items-table" style="width: 100%; border-collapse: collapse; margin: 16px 0; word-break: break-word; font-size: 13px;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th class="sku-col" style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; font-weight: 600; color: #374151;">SKU</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; font-weight: 600; color: #374151;">Item</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: center; font-weight: 600; color: #374151; width: 8%;">Qty</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; font-weight: 600; color: #374151; width: 15%;">Price</th>
          <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; font-weight: 600; color: #374151; width: 15%;">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const item of items) {
    const unitPrice = item.unit_price || 0;
    const quantity = item.quantity || 1;
    const total = unitPrice * quantity;
    
    html += `
      <tr>
        <td class="sku-col" style="border: 1px solid #e5e7eb; padding: 8px 6px; color: #6b7280; font-family: monospace; font-size: 12px;">${item.item_sku || '-'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px 6px; color: #1f2937;">${item.item_name || 'Item'}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: center; color: #1f2937;">${quantity}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; color: #1f2937;">$${unitPrice.toFixed(2)}</td>
        <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; color: #1f2937; font-weight: 500;">$${total.toFixed(2)}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  return html;
}

async function sendEmail(
  supabase: ReturnType<typeof createClient>,
  to: string,
  orderNumber: string,
  customerName: string,
  amount: number,
  paymentUrl: string,
  orderId: string,
  companyName: string
): Promise<{ success: boolean; error?: string }> {
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);

  // Fetch order items for detailed invoice
  const { data: orderItems, error: itemsError } = await supabase
    .from("production_order_items")
    .select("*")
    .eq("production_order_id", orderId);

  if (itemsError) {
    console.error("Error fetching order items:", itemsError);
  }

  // Fetch order details for tax and shipping
  const { data: orderData, error: orderError } = await supabase
    .from("production_orders")
    .select("tax_amount, tax_lines, shipping_cost, total_amount")
    .eq("id", orderId)
    .single();

  if (orderError) {
    console.error("Error fetching order details:", orderError);
  }

  // Build items table
  const itemsTable = buildItemsTable(orderItems || []);
  
  // Calculate totals
  const subtotal = (orderItems || []).reduce((sum: number, item: any) => sum + (item.total_price || 0), 0) || amount;
  const taxAmount = orderData?.tax_amount || 0;
  const shippingCost = orderData?.shipping_cost || 0;
  const escapeTax = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
  const taxRows = (orderData?.tax_lines || []).map((line: any) => `<tr><td style="padding:4px 0;">${escapeTax(line.name)}${line.type === 'sales_tax' ? ` (${Number(line.rate)}%)` : ''}</td><td style="padding:4px 0;text-align:right;">$${Number(line.amount).toFixed(2)}</td></tr>`).join('');

  // Fetch company info and logo
  const [logoUrl, templates] = await Promise.all([
    getCompanyLogoUrl(supabase),
    getEmailTemplate(supabase, "email_payment_request_subject", "email_payment_request_body"),
  ]);

  const templateVars: Record<string, string> = {
    customer_name: customerName,
    order_number: orderNumber,
    amount: formattedAmount,
    payment_url: paymentUrl,
    items_table: itemsTable,
    subtotal: `$${subtotal.toFixed(2)}`,
    tax_amount: taxAmount > 0 ? `$${taxAmount.toFixed(2)}` : '$0.00',
    shipping_cost: shippingCost > 0 ? `$${shippingCost.toFixed(2)}` : '$0.00',
    company_name: companyName,
    company_logo: logoUrl,
  };

  let emailSubject: string;
  let htmlContent: string;

  if (templates.subject && templates.body) {
    emailSubject = replaceTemplateVariables(templates.subject, templateVars);
    htmlContent = replaceTemplateVariables(templates.body, templateVars) + (taxRows ? `<table style="width:100%;">${taxRows}</table>` : "");
  } else {
    // Default template with detailed invoice
    emailSubject = `Payment Request - Order #${orderNumber}`;
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style type="text/css">
          @media only screen and (max-width: 620px) {
            .email-container { width: 100% !important; padding: 12px !important; }
            .email-card { border-radius: 8px !important; }
            .email-body { padding: 16px !important; }
            .items-table { font-size: 12px !important; }
            .items-table td, .items-table th { padding: 6px 4px !important; font-size: 12px !important; }
            .totals-table { width: 100% !important; }
          }
        </style>
      </head>
      <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f8;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f7f8;">
          <tr>
            <td align="center" style="padding: 24px;" class="email-container">
              <table width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.08);">
                <tr>
                  <td style="text-align: center; padding: 24px; background: linear-gradient(135deg, #e6f3fb, #ffffff);">
                    <img src="${logoUrl}" alt="${companyName}" width="80" height="80" style="display: inline-block; border-radius: 12px; margin-bottom: 12px;" />
                    <h1 style="margin: 0; font-size: 22px; color: #0f172a;">Payment Request</h1>
                    <p style="margin: 8px 0 0; color: #64748b; font-size: 14px;">Order #${orderNumber}</p>
                  </td>
                </tr>
                <tr>
                  <td class="email-body" style="padding: 24px; color: #0f172a;">
              <p style="margin: 0 0 16px;">Hi ${customerName},</p>
              <p style="margin: 0 0 24px;">Your order is ready for payment! Please review the details below:</p>
              
              <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px; color: #374151; font-size: 16px;">Order Summary</h3>
                ${itemsTable}
                
              <table class="totals-table" style="width: 100%; border-top: 1px solid #e5e7eb; margin-top: 12px; padding-top: 12px;">
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280;">Subtotal:</td>
                    <td style="padding: 4px 0; text-align: right; color: #1f2937;">$${subtotal.toFixed(2)}</td>
                  </tr>
                  ${taxRows || (taxAmount > 0 ? `
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280;">Tax:</td>
                    <td style="padding: 4px 0; text-align: right; color: #1f2937;">$${taxAmount.toFixed(2)}</td>
                  </tr>
                  ` : '')}
                  ${shippingCost > 0 ? `
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280;">Shipping:</td>
                    <td style="padding: 4px 0; text-align: right; color: #1f2937;">$${shippingCost.toFixed(2)}</td>
                  </tr>
                  ` : ''}
                  <tr style="border-top: 1px solid #e5e7eb;">
                    <td style="padding: 8px 0 4px; font-weight: 600; color: #0f172a;">Total Due:</td>
                    <td style="padding: 8px 0 4px; text-align: right; font-weight: 700; color: #0f172a; font-size: 18px;">${formattedAmount}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 24px 0;">
                <a href="${paymentUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">View Order & Pay Now</a>
              </div>
              
              <p style="font-size: 13px; color: #6b7280; margin: 24px 0 0;">
                This payment link expires in 7 days. If you have any questions, please contact us.
              </p>
            </div>
            
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 24px; background: #f8fafc; text-align: center; font-size: 12px; color: #64748b;">
                    <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  const result = await sendResendEmail({
    to: to,
    subject: emailSubject,
    html: htmlContent,
    from: { email: "noreply@washgear.com", name: companyName },
  });

  if (result.success) {
    console.log("Email sent successfully to:", to);
  }

  return result;
}

async function sendSMS(
  to: string,
  orderNumber: string,
  amount: number,
  paymentUrl: string
): Promise<{ success: boolean; error?: string; messageSid?: string }> {
  const message = `Order #${orderNumber}: pay $${amount.toFixed(2)} here: ${paymentUrl}`;
  return queueContactNotification(to, 'text', `Payment link - ${orderNumber}`, message);

}

async function logNotification(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  orderType: string,
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
      order_type: orderType,
      notification_type: notificationType,
      recipient: recipient,
      message: message,
      status: status,
      error_message: errorMessage,
      external_id: externalId,
      subject: `Payment Request - Order #${orderId}`,
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
    await requireNotificationStaff(req);
    const { order_id, order_number, customer_email, customer_phone, customer_name, amount }: PaymentLinkRequest = await req.json();

    console.log("Processing payment link request:", { order_id, order_number, customer_email, customer_phone, amount });

    if (!order_id || !order_number || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: order_id, order_number, amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!customer_email && !customer_phone) {
      return new Response(
        JSON.stringify({ error: "At least one of customer_email or customer_phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get company name
    const companyName = await getCompanyName(supabase);

    // Generate new payment token and set expiration (7 days)
    const paymentToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update order with payment token
    const { error: updateError } = await supabase
      .from("production_orders")
      .update({
        payment_token: paymentToken,
        payment_token_expires_at: expiresAt.toISOString(),
      })
      .eq("id", order_id);

    if (updateError) {
      console.error("Failed to update order with payment token:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to generate payment link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build payment URL
    const baseUrl = "https://6410f7ff-45ec-4220-b569-f8e7c70d0f79.lovableproject.com";
    const paymentUrl = `${baseUrl}/pay/${paymentToken}`;

    console.log("Generated payment URL:", paymentUrl);

    const results = {
      email: { sent: false, error: null as string | null },
      sms: { sent: false, error: null as string | null },
    };

    // Send email if provided
    if (customer_email) {
      const emailResult = await sendEmail(supabase, customer_email, order_number, customer_name, amount, paymentUrl, order_id, companyName);
      results.email.sent = emailResult.success;
      results.email.error = emailResult.error || null;
      
      await logNotification(
        supabase,
        order_id,
        "production_order",
        "email",
        customer_email,
        `Payment link sent for ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)}`,
        emailResult.success ? "sent" : "failed",
        emailResult.error
      );
    }

    // Send SMS if provided
    if (customer_phone && !customer_email) {
      const smsResult = await sendSMS(customer_phone, order_number, amount, paymentUrl);
      results.sms.sent = smsResult.success;
      results.sms.error = smsResult.error || null;
      
      await logNotification(
        supabase,
        order_id,
        "production_order",
        "sms",
        customer_phone,
        `Payment link sent for ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)}`,
        smsResult.success ? "sent" : "failed",
        smsResult.error,
        smsResult.messageSid
      );
    }

    const anySuccess = results.email.sent || results.sms.sent;

    return new Response(
      JSON.stringify({
        success: anySuccess,
        payment_url: paymentUrl,
        expires_at: expiresAt.toISOString(),
        results,
      }),
      {
        status: anySuccess ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-payment-link:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
