import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { queueContactNotification } from "../_shared/notification-outbox.ts";
import { sendResendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  order_type: 'production' | 'repair';
  order_id: string;
  order_number: string;
  status: string;
  customer_email?: string;
  customer_phone?: string;
  customer_name?: string;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

async function getEmailTemplate(subjectKey: string, bodyKey: string) {
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

async function getCompanyLogoUrl(): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_logo_url")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "https://pnawosyjmvibwjpegnrs.supabase.co/storage/v1/object/public/branding/company-logo.png";
}

async function getCompanyName(): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_name")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "WashGear";
}

const statusMessages: Record<string, Record<string, string>> = {
  production: {
    pending: 'Your production order has been received and is pending processing.',
    in_progress: 'Your production order is now in progress.',
    quality_check: 'Your production order is undergoing quality control checks.',
    completed: 'Your production order has been completed and is ready for shipping.',
    shipped: 'Your production order has been shipped and is on its way.',
    cancelled: 'Your production order has been cancelled.'
  },
  repair: {
    received: 'Your repair item has been received and logged into our system.',
    diagnosed: 'Your repair item has been diagnosed. We will contact you with repair details.',
    parts_ordered: 'Parts have been ordered for your repair. We will notify you when they arrive.',
    in_repair: 'Your item is currently being repaired by our technicians.',
    quality_check: 'Your repair is undergoing final quality checks.',
    completed: 'Your repair has been completed and is ready for pickup or shipping.',
    shipped: 'Your repaired item has been shipped and is on its way.',
    cancelled: 'Your repair order has been cancelled.'
  }
};

async function sendEmailNotification(
  email: string, 
  subject: string, 
  htmlContent: string,
  orderNumber: string,
  companyName: string
) {
  const result = await sendResendEmail({
    to: email,
    subject: subject,
    html: htmlContent,
    from: { email: "noreply@washgear.com", name: companyName },
  });

  if (result.success) {
    await logNotification('production', '', 'email', email, subject, htmlContent, 'sent');
  }

  return result;
}

async function sendSMSNotification(phone: string, message: string) {
  return queueContactNotification(phone, 'text', 'Order status update', message);

}

async function logNotification(
  orderType: string,
  orderId: string, 
  notificationType: string,
  recipient: string,
  subject?: string,
  message?: string,
  status = 'sent',
  externalId?: string,
  errorMessage?: string
) {
  try {
    await supabase.from('notification_log').insert({
      order_type: orderType,
      order_id: orderId,
      notification_type: notificationType,
      recipient: recipient,
      subject: subject,
      message: message,
      status: status,
      external_id: externalId,
      error_message: errorMessage,
    });
  } catch (error) {
    console.error('Failed to log notification:', error);
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_type, order_id, order_number, status, customer_email, customer_phone, customer_name }: NotificationRequest = await req.json();

    console.log(`Processing notification for ${order_type} order ${order_number} - Status: ${status}`);

    // Get status message
    const statusMessage = statusMessages[order_type]?.[status] || 
                   `Your ${order_type} order ${order_number} status has been updated to: ${status}`;

    // Get company info and logo
    const [companyName, logoUrl, templates] = await Promise.all([
      getCompanyName(),
      getCompanyLogoUrl(),
      getEmailTemplate("email_status_update_subject", "email_status_update_body"),
    ]);

    const orderTypeLabel = order_type === 'production' ? 'Production' : 'Repair';
    
    const templateVars: Record<string, string> = {
      customer_name: customer_name || 'Valued Customer',
      order_number: order_number,
      order_type: orderTypeLabel,
      status: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      status_message: statusMessage,
      company_name: companyName,
      company_logo: logoUrl,
    };

    let emailSubject: string;
    let htmlContent: string;

    if (templates.subject && templates.body) {
      emailSubject = replaceTemplateVariables(templates.subject, templateVars);
      htmlContent = replaceTemplateVariables(templates.body, templateVars);
    } else {
      // Default template with logo
      emailSubject = `${orderTypeLabel} Order Update - ${order_number}`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f8;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
            <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.08);">
              <div style="text-align: center; padding: 24px; background: linear-gradient(135deg, #e6f3fb, #ffffff);">
                <img src="${logoUrl}" alt="${companyName}" width="80" height="80" style="display: inline-block; border-radius: 12px; margin-bottom: 12px;" />
                <h1 style="margin: 0; font-size: 22px; color: #0f172a;">${orderTypeLabel} Order Update</h1>
                <p style="margin: 8px 0 0; color: #64748b; font-size: 14px;">Order #${order_number}</p>
              </div>
              
              <div style="padding: 24px; color: #0f172a;">
                <p style="margin: 0 0 16px;">Hi ${customer_name || 'Valued Customer'},</p>
                <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5;">${statusMessage}</p>
                
                <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                  <h3 style="margin: 0 0 8px; color: #166534; font-size: 14px;">Current Status</h3>
                  <p style="margin: 0; font-weight: 600; color: #15803d; font-size: 18px;">${status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                </div>
                
                <p style="font-size: 14px; color: #6b7280; margin: 0;">
                  Thank you for choosing ${companyName}. If you have any questions, please don't hesitate to contact us.
                </p>
              </div>
              
              <div style="padding: 16px 24px; background: #f8fafc; text-align: center; font-size: 12px; color: #64748b;">
                <p style="margin: 0;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Send email notification
    if (customer_email) {
      try {
        const emailResult = await sendEmailNotification(customer_email, emailSubject, htmlContent, order_number, companyName);
        console.log('Email notification result:', emailResult);
      } catch (error: any) {
        console.error('Email notification failed:', error);
        await logNotification(order_type, order_id, 'email', customer_email, emailSubject, statusMessage, 'failed', undefined, error.message);
      }
    }

    // Send SMS notification
    if (customer_phone && !customer_email) {
      try {
        const smsMessage = `${companyName}: ${emailSubject} - ${statusMessage}`;
        const smsResult = await sendSMSNotification(customer_phone, smsMessage);
        console.log('SMS notification result:', smsResult);
      } catch (error: any) {
        console.error('SMS notification failed:', error);
        await logNotification(order_type, order_id, 'sms', customer_phone, undefined, statusMessage, 'failed', undefined, error.message);
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'Notifications processed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error: any) {
    console.error('Error in send-status-notification function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
