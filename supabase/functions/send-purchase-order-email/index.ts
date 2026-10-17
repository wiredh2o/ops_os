import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { sendResendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendPOEmailRequest {
  purchaseOrderId: string;
  shipByDate: string;
  shippingCarrier?: string;
  shippingMethod?: string;
  baseUrl?: string; // For generating shipment tracking URL
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
};

const getCarrierLabel = (carrier: string | null): string => {
  if (!carrier) return '';
  const labels: Record<string, string> = {
    'fedex': 'FedEx',
    'ups': 'UPS',
    'usps': 'USPS',
  };
  return labels[carrier.toLowerCase()] || carrier;
};

const getMethodLabel = (carrier: string | null, method: string | null): string => {
  if (!carrier || !method) return '';
  const methods: Record<string, Record<string, string>> = {
    'fedex': {
      'ground': 'Ground',
      'express_saver': 'Express Saver (3 Day)',
      '2day': '2 Day',
      'priority_overnight': 'Priority Overnight',
    },
    'ups': {
      'ground': 'Ground',
      '3day_select': '3 Day Select',
      '2nd_day_air': '2nd Day Air',
      'next_day_air': 'Next Day Air',
    },
    'usps': {
      'ground_advantage': 'Ground Advantage',
      'priority_mail': 'Priority Mail',
      'priority_express': 'Priority Express',
    },
  };
  return methods[carrier.toLowerCase()]?.[method.toLowerCase()] || method;
};

const buildItemsTable = (items: any[]): string => {
  if (!items || items.length === 0) {
    return '<p>No items</p>';
  }

  let html = `
    <table class="items-table" style="width: 100%; border-collapse: collapse; margin-top: 10px; word-break: break-word; font-size: 13px;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="border: 1px solid #ddd; padding: 8px 6px; text-align: left;">Item</th>
          <th style="border: 1px solid #ddd; padding: 8px 6px; text-align: center; width: 10%;">Qty</th>
          <th style="border: 1px solid #ddd; padding: 8px 6px; text-align: right; width: 18%;">Unit Cost</th>
          <th style="border: 1px solid #ddd; padding: 8px 6px; text-align: right; width: 18%;">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const item of items) {
    html += `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px 6px;">${item.item_name}</td>
        <td style="border: 1px solid #ddd; padding: 8px 6px; text-align: center;">${item.quantity}${item.uom ? ' ' + item.uom : ''}</td>
        <td style="border: 1px solid #ddd; padding: 8px 6px; text-align: right;">$${item.unit_cost.toFixed(2)}</td>
        <td style="border: 1px solid #ddd; padding: 8px 6px; text-align: right;">$${item.total_cost.toFixed(2)}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  return html;
};

const replaceTemplateVariables = (
  template: string, 
  variables: Record<string, string>
): string => {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value || '');
  }
  
  // Handle conditional blocks {{#if notes}}...{{/if}}
  result = result.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (match, varName, content) => {
    return variables[varName] ? content : '';
  });
  
  return result;
};

async function getCompanyLogoUrl(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_logo_url")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "https://pnawosyjmvibwjpegnrs.supabase.co/storage/v1/object/public/branding/company-logo.png";
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { purchaseOrderId, shipByDate, shippingCarrier, shippingMethod, baseUrl }: SendPOEmailRequest = await req.json();

    // Default base URL for shipment tracking portal
    const trackingBaseUrl = baseUrl || "https://lean-prime-ops.lovable.app";

    if (!purchaseOrderId) {
      throw new Error("purchaseOrderId is required");
    }

    // Fetch purchase order details including shipment token
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select('*, shipment_token, is_drop_ship, drop_ship_address_snapshot')
      .eq('id', purchaseOrderId)
      .single();

    if (poError || !po) {
      throw new Error(`Purchase order not found: ${poError?.message}`);
    }

    // Generate shipment tracking URL
    const shipmentTrackingUrl = `${trackingBaseUrl}/vendor-shipment/${po.shipment_token}`;

    // Fetch supplier details
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', po.supplier_id)
      .single();

    if (supplierError || !supplier) {
      throw new Error(`Supplier not found: ${supplierError?.message}`);
    }

    if (supplierError || !supplier) {
      throw new Error(`Supplier not found: ${supplierError?.message}`);
    }

    if (!supplier.email) {
      throw new Error("Supplier does not have an email address");
    }

    // Fetch PO items
    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', purchaseOrderId);

    if (itemsError) {
      throw new Error(`Failed to fetch PO items: ${itemsError.message}`);
    }

    // Fetch company settings for sender info and logo
    const { data: companySettings } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['company_name', 'company_phone', 'company_email', 'po_email_subject_template', 'po_email_body_template', 'ship_from_address']);

    const settings: Record<string, string> = {};
    for (const setting of companySettings || []) {
      settings[setting.setting_key] = setting.setting_value;
    }

    // Determine ship-to address
    let shipToAddress = '';
    if (po.is_drop_ship && po.drop_ship_address_snapshot) {
      const addr = po.drop_ship_address_snapshot as any;
      shipToAddress = [
        addr.attention || addr.company_name,
        addr.street1,
        addr.street2,
        `${addr.city}, ${addr.state} ${addr.postal_code}`,
        addr.country
      ].filter(Boolean).join('<br>');
    } else if (settings.ship_from_address) {
      try {
        const addr = JSON.parse(settings.ship_from_address);
        shipToAddress = [
          addr.company,
          addr.attention,
          addr.street1,
          addr.street2,
          `${addr.city}, ${addr.state} ${addr.postalCode}`,
          addr.country
        ].filter(Boolean).join('<br>');
      } catch (e) {
        shipToAddress = settings.ship_from_address;
      }
    }
    const logoUrl = await getCompanyLogoUrl(supabase);

    // Build template variables
    const carrierLabel = getCarrierLabel(shippingCarrier || null);
    const methodLabel = getMethodLabel(shippingCarrier || null, shippingMethod || null);
    
    const templateVars: Record<string, string> = {
      po_number: po.purchase_order_number,
      vendor_name: supplier.name,
      order_date: formatDate(po.order_date),
      ship_by_date: shipByDate ? formatDate(shipByDate) : '',
      shipping_carrier: carrierLabel,
      shipping_method: methodLabel,
      items_table: buildItemsTable(items || []),
      subtotal: `$${(po.subtotal || 0).toFixed(2)}`,
      total: `$${(po.total || 0).toFixed(2)}`,
      notes: po.notes || '',
      company_name: settings.company_name || 'WashGear',
      company_phone: settings.company_phone || '',
      company_email: settings.company_email || '',
      company_logo: logoUrl,
      ship_to_address: shipToAddress,
      shipment_tracking_url: shipmentTrackingUrl,
    };

    // Get email templates
    const subjectTemplate = settings.po_email_subject_template || 'Purchase Order {{po_number}}';
    const bodyTemplate = settings.po_email_body_template || `
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
          }
        </style>
      </head>
      <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f8;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f7f8;">
          <tr>
            <td align="center" style="padding: 24px;" class="email-container">
              <table width="700" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width: 700px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.08);">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #e6f3fb, #ffffff);">
                      <tr>
                        <td style="padding: 24px;">
                          <img src="{{company_logo}}" alt="{{company_name}}" width="35" height="35" style="border-radius: 12px; vertical-align: middle;" />
                          <span style="font-size: 22px; font-weight: 700; color: #0f172a; vertical-align: middle; padding-left: 12px;">Purchase Order {{po_number}}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="email-body" style="padding: 24px; color: #0f172a;">
              <p style="margin: 0 0 16px;">Dear {{vendor_name}},</p>
              <p style="margin: 0 0 24px;">Please find below our purchase order details:</p>
              
              <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px;"><strong>Order Date:</strong> {{order_date}}</p>
                <p style="margin: 0 0 8px;"><strong>Ship By:</strong> {{ship_by_date}}</p>
                <p style="margin: 0;"><strong>Shipping:</strong> {{shipping_carrier}} - {{shipping_method}}</p>
              </div>
              
              {{#if ship_to_address}}
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-weight: 600; color: #065f46;">📦 Ship To:</p>
                <p style="margin: 0; color: #047857; line-height: 1.6;">{{ship_to_address}}</p>
              </div>
              {{/if}}
              
              {{items_table}}
              
              <div style="text-align: right; margin-top: 16px; padding-top: 16px; border-top: 2px solid #e5e7eb;">
                <p style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">Total: {{total}}</p>
              </div>
              
              {{#if notes}}
              <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-top: 24px;">
                <p style="margin: 0; font-weight: 600; color: #92400e;">Notes:</p>
                <p style="margin: 8px 0 0; color: #a16207;">{{notes}}</p>
              </div>
              {{/if}}
              
              <div style="margin-top: 32px; padding: 24px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; text-align: center;">
                <p style="margin: 0 0 16px; color: #ffffff; font-size: 16px;">Once shipped, please add your tracking information:</p>
                <a href="{{shipment_tracking_url}}" style="display: inline-block; padding: 14px 32px; background: #ffffff; color: #2563eb; font-weight: 600; text-decoration: none; border-radius: 8px; font-size: 16px;">
                  ✈️ Add Tracking Number
                </a>
              </div>
              
              <p style="margin: 32px 0 0; color: #374151;">Best regards,</p>
              <p style="margin: 4px 0; font-weight: 600; color: #0f172a;">{{company_name}}</p>
              <p style="margin: 0; font-size: 14px; color: #6b7280;">{{company_email}} | {{company_phone}}</p>
            </div>
            
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 24px; background: #f8fafc; text-align: center; font-size: 12px; color: #64748b;">
                    <p style="margin: 0;">&copy; ${new Date().getFullYear()} {{company_name}}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const emailSubject = replaceTemplateVariables(subjectTemplate, templateVars);
    const emailBody = replaceTemplateVariables(bodyTemplate, templateVars);

    // Send email via Resend
    const result = await sendResendEmail({
      to: supplier.email,
      subject: emailSubject,
      html: emailBody,
      from: { email: "noreply@washgear.com", name: settings.company_name || "WashGear" },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to send email");
    }

    console.log("Purchase order email sent successfully via Resend");

    return new Response(
      JSON.stringify({ 
        success: true, 
        sentTo: supplier.email 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in send-purchase-order-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
