import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { sendResendEmail } from "../_shared/resend-email.ts";
import {
  wrapEmailWithBranding,
  getCompanyLogoUrl,
  getCompanyName,
} from "../_shared/email-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestEmailRequest {
  template_id: string;
  subject: string;
  body: string;
  recipient_email: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
    const varValue = variables[varName];
    return varValue && varValue !== 'false' ? content : '';
  });
  result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, varName, content) => {
    const varValue = variables[varName];
    return !varValue || varValue === 'false' ? content : '';
  });
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

function getSampleDataForTemplate(templateId: string, logoUrl: string): Record<string, string> {
  const sampleDataMap: Record<string, Record<string, string>> = {
    purchase_order: {
      company_logo: logoUrl,
      po_number: "PO-2024-001",
      vendor_name: "Sample Vendor Inc.",
      order_date: "January 24, 2026",
      ship_by_date: "January 31, 2026",
      shipping_carrier: "FedEx",
      shipping_method: "Ground",
      items_table: `<table style="width:100%; border-collapse:collapse; margin: 15px 0;">
        <tr style="background:#f3f4f6;">
          <th style="padding:10px; border:1px solid #ddd; text-align:left;">SKU</th>
          <th style="padding:10px; border:1px solid #ddd; text-align:left;">Description</th>
          <th style="padding:10px; border:1px solid #ddd; text-align:center;">Qty</th>
          <th style="padding:10px; border:1px solid #ddd; text-align:right;">Price</th>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #ddd;">BRUSH-001</td>
          <td style="padding:10px; border:1px solid #ddd;">Foam Brush Assembly</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:center;">10</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:right;">$25.00</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #ddd;">HOSE-002</td>
          <td style="padding:10px; border:1px solid #ddd;">High-Pressure Hose 50ft</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:center;">5</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:right;">$45.00</td>
        </tr>
      </table>`,
      total: "$475.00",
      notes: "Please ship ASAP - urgent order",
      company_name: "WashGear",
      company_email: "orders@washgear.com",
      company_phone: "(555) 123-4567"
    },
    payment_request: {
      company_logo: logoUrl,
      customer_name: "John Smith",
      order_number: "ORD-12345",
      items_table: `<table style="width:100%; border-collapse:collapse; margin: 15px 0;">
        <tr style="background:#f3f4f6;">
          <th style="padding:10px; border:1px solid #ddd; text-align:left;">Item</th>
          <th style="padding:10px; border:1px solid #ddd; text-align:left;">SKU</th>
          <th style="padding:10px; border:1px solid #ddd; text-align:center;">Qty</th>
          <th style="padding:10px; border:1px solid #ddd; text-align:right;">Unit Price</th>
          <th style="padding:10px; border:1px solid #ddd; text-align:right;">Total</th>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #ddd;">Foam Brush Assembly</td>
          <td style="padding:10px; border:1px solid #ddd; font-family:monospace;">BRUSH-001</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:center;">2</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:right;">$125.00</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:right; font-weight:500;">$250.00</td>
        </tr>
        <tr>
          <td style="padding:10px; border:1px solid #ddd;">High-Pressure Hose</td>
          <td style="padding:10px; border:1px solid #ddd; font-family:monospace;">HOSE-002</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:center;">1</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:right;">$24.99</td>
          <td style="padding:10px; border:1px solid #ddd; text-align:right; font-weight:500;">$24.99</td>
        </tr>
      </table>`,
      subtotal: "$274.99",
      tax_amount: "$22.00",
      shipping_cost: "$15.99",
      amount: "$312.98",
      payment_url: "https://example.com/pay/sample-token",
      company_name: "WashGear"
    },
    payment_confirmation: {
      company_logo: logoUrl,
      customer_name: "John Smith",
      order_number: "ORD-12345",
      amount: "$299.99",
      payment_date: "January 24, 2026",
      company_name: "WashGear"
    },
    status_update: {
      company_logo: logoUrl,
      customer_name: "John Smith",
      order_number: "ORD-12345",
      order_type: "Production",
      status: "In Production",
      status_message: "Your order is currently being assembled and will ship within 3-5 business days.",
      company_name: "WashGear"
    },
    user_invitation: {
      company_logo: logoUrl,
      user_name: "Jane Doe",
      user_email: "jane.doe@example.com",
      invite_url: "https://example.com/accept-invite/sample-token",
      company_name: "WashGear"
    },
    password_reset: {
      company_logo: logoUrl,
      user_name: "Jane Doe",
      reset_url: "https://example.com/reset-password/sample-token",
      expires_in: "1 hour",
      company_name: "WashGear"
    },
    license_expiration: {
      company_logo: logoUrl,
      user_name: "Admin User",
      company_name: "ABC Car Wash Company",
      expiration_date: "February 15, 2026",
      days_count: "22",
      days_label: "until expiration",
      urgency_level: "Important",
      expiration_status: "Expiring Soon",
      header_color: "#f59e0b",
      is_expired: "false"
    },
    order_confirmation: {
      company_logo: logoUrl,
      customer_name: "John Smith",
      order_number: "ORD-12345",
      order_date: "January 24, 2026",
      items_table: `<table class="items-table" style="width: 100%; border-collapse: collapse; margin: 16px 0; word-break: break-word; font-size: 13px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; font-weight: 600; color: #374151;">SKU</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; font-weight: 600; color: #374151;">Item</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: center; font-weight: 600; color: #374151; width: 8%;">Qty</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; font-weight: 600; color: #374151; width: 15%;">Price</th>
            <th style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; font-weight: 600; color: #374151; width: 15%;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; color: #6b7280; font-family: monospace; font-size: 12px;">BRUSH-001</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; color: #1f2937;">Foam Brush Assembly</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: center; color: #1f2937;">2</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; color: #1f2937;">$125.00</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; color: #1f2937; font-weight: 500;">$250.00</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; color: #6b7280; font-family: monospace; font-size: 12px;">HOSE-002</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; color: #1f2937;">High-Pressure Hose 50ft</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: center; color: #1f2937;">1</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; color: #1f2937;">$45.00</td>
            <td style="border: 1px solid #e5e7eb; padding: 8px 6px; text-align: right; color: #1f2937; font-weight: 500;">$45.00</td>
          </tr>
        </tbody>
      </table>`,
      subtotal: "$295.00",
      tax_amount: "$23.60",
      shipping_cost: "$15.99",
      total: "$334.59",
      shipping_address: "John Smith<br>456 Main Street<br>Denver, CO 80202",
      payment_method: "Visa ending in 4242",
      notes: "Please ship ASAP",
      company_name: "WashGear"
    }
  };
  
  return sampleDataMap[templateId] || { company_logo: logoUrl };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { template_id, subject, body, recipient_email }: TestEmailRequest = await req.json();

    if (!template_id || !subject || !body || !recipient_email) {
      throw new Error("Missing required fields: template_id, subject, body, recipient_email");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient_email)) {
      throw new Error("Invalid email address format");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const [logoUrl, companyName] = await Promise.all([
      getCompanyLogoUrl(supabase),
      getCompanyName(supabase),
    ]);

    const sampleData = getSampleDataForTemplate(template_id, logoUrl);

    const finalSubject = replaceTemplateVariables(subject, sampleData);
    const finalBody = replaceTemplateVariables(body, sampleData);

    // Add test email banner
    const testBanner = `
      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 12px 20px; text-align: center; border-bottom: 3px solid #f59e0b; font-family: Arial, sans-serif;">
        <strong style="color: #92400e; font-size: 14px;">🧪 TEST EMAIL</strong>
        <span style="color: #78350f; font-size: 13px; margin-left: 10px;">This is a preview with sample data - not a real notification</span>
      </div>
    `;

    let finalHtml: string;

    if (template_id === "order_confirmation") {
      // Wrap with branded header/footer to match production output
      const titleText = finalSubject || `Order Confirmation — #${sampleData.order_number || ""}`;
      finalHtml = wrapEmailWithBranding(
        testBanner + finalBody,
        logoUrl,
        companyName,
        titleText
      );
    } else {
      finalHtml = testBanner + finalBody;
    }

    console.log(`Sending test email to ${recipient_email} for template: ${template_id}`);

    const result = await sendResendEmail({
      bypassPreferences: true,
      to: recipient_email,
      subject: `[TEST] ${finalSubject}`,
      html: finalHtml,
      from: { email: "noreply@washgear.com", name: "WashGear (Test)" },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to send email");
    }

    console.log(`Test email sent successfully to ${recipient_email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Test email sent to ${recipient_email}`,
        template_id 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("Error sending test email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
};

serve(handler);
