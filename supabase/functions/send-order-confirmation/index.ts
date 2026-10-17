import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { sendResendEmail } from "../_shared/resend-email.ts";
import {
  wrapEmailWithBranding,
  buildItemsTable,
  getCompanyLogoUrl,
  getCompanyName,
  getEmailTemplate,
  replaceTemplateVariables,
} from "../_shared/email-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      orderNumber,
      customerEmail,
      customerName,
      items,
      subtotal,
      tax,
      shipping,
      total,
      shippingAddress,
      paymentMethod,
      notes,
      orderDate,
      preview,
    } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [logoUrl, companyName, customTemplate] = await Promise.all([
      getCompanyLogoUrl(supabase),
      getCompanyName(supabase),
      getEmailTemplate(supabase, "email_order_confirmation_subject", "email_order_confirmation_body"),
    ]);

    let html: string;
    let subject: string;

    // Build items table (used by both custom and default templates)
    const itemsHtml = buildItemsTable(
      items.map((item: any) => ({
        item_name: item.item_name,
        item_sku: item.item_sku,
        quantity: item.quantity_ordered,
        unit_price: item.unit_price,
      }))
    );

    if (customTemplate.body) {
      // Use custom template from settings
      const templateVars: Record<string, string> = {
        company_logo: logoUrl,
        customer_name: customerName || "",
        order_number: orderNumber,
        order_date: orderDate || new Date().toLocaleDateString(),
        items_table: itemsHtml,
        subtotal: `$${Number(subtotal).toFixed(2)}`,
        tax_amount: tax > 0 ? `$${Number(tax).toFixed(2)}` : "",
        shipping_cost: shipping > 0 ? `$${Number(shipping).toFixed(2)}` : "",
        total: `$${Number(total).toFixed(2)}`,
        shipping_address: shippingAddress || "",
        payment_method: paymentMethod || "",
        notes: notes || "",
        company_name: companyName,
      };

      const bodyContent = replaceTemplateVariables(customTemplate.body, templateVars);
      const titleText = customTemplate.subject
        ? replaceTemplateVariables(customTemplate.subject, templateVars)
        : `Order Confirmation — #${orderNumber}`;

      html = wrapEmailWithBranding(bodyContent, logoUrl, companyName, titleText);
      subject = titleText;
    } else {
      // Fallback: original hardcoded HTML
      // Build totals section
      const totalsRows = [
        `<tr><td style="padding: 6px 0; color: #6b7280;">Subtotal</td><td style="padding: 6px 0; text-align: right; font-weight: 500;">$${Number(subtotal).toFixed(2)}</td></tr>`,
      ];
      if (tax > 0) {
        totalsRows.push(
          `<tr><td style="padding: 6px 0; color: #6b7280;">Tax</td><td style="padding: 6px 0; text-align: right;">$${Number(tax).toFixed(2)}</td></tr>`
        );
      }
      if (shipping > 0) {
        totalsRows.push(
          `<tr><td style="padding: 6px 0; color: #6b7280;">Shipping</td><td style="padding: 6px 0; text-align: right;">$${Number(shipping).toFixed(2)}</td></tr>`
        );
      }
      totalsRows.push(
        `<tr style="border-top: 2px solid #e5e7eb;"><td style="padding: 10px 0; font-weight: 700; font-size: 16px;">Total</td><td style="padding: 10px 0; text-align: right; font-weight: 700; font-size: 16px;">$${Number(total).toFixed(2)}</td></tr>`
      );

      let bodyContent = `
        <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">Order Date: ${orderDate || new Date().toLocaleDateString()}</p>
        <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">Customer: <strong style="color: #0f172a;">${customerName || ""}</strong></p>
        
        ${itemsHtml}
        
        <table class="totals-table" style="width: 100%; max-width: 280px; margin-left: auto; margin-top: 8px;">
          ${totalsRows.join("")}
        </table>
      `;

      if (shippingAddress) {
        bodyContent += `
          <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #374151;">Ship To</p>
            <p style="margin: 0; color: #4b5563; line-height: 1.6;">${shippingAddress}</p>
          </div>
        `;
      }

      if (paymentMethod) {
        bodyContent += `
          <div style="margin-top: 12px; padding: 12px 16px; background: #f8fafc; border-radius: 8px;">
            <p style="margin: 0; color: #374151;"><strong>Payment:</strong> ${paymentMethod}</p>
          </div>
        `;
      }

      if (notes) {
        bodyContent += `
          <div style="margin-top: 12px; padding: 12px 16px; background: #fffbeb; border-radius: 8px; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-size: 13px;"><strong>Notes:</strong> ${notes}</p>
          </div>
        `;
      }

      bodyContent += `
        <p style="margin: 24px 0 0 0; text-align: center; color: #6b7280; font-size: 14px;">Thank you for your order!</p>
      `;

      html = wrapEmailWithBranding(
        bodyContent,
        logoUrl,
        companyName,
        `Order Confirmation — #${orderNumber}`
      );
      subject = `Order Confirmation - #${orderNumber} - ${companyName}`;
    }

    // If preview mode, just return the HTML without sending
    if (preview) {
      return new Response(JSON.stringify({ success: true, html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Resend
    if (!customerEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "No customer email provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sendResendEmail({
      to: customerEmail,
      subject,
      html,
    });

    return new Response(JSON.stringify({ ...result, html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-order-confirmation error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
