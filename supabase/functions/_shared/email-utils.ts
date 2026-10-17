import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

/**
 * Replaces template variables like {{variable}} with their values
 */
export function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
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
  result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, varName, content) => {
    const varValue = variables[varName];
    return !varValue || varValue === 'false' ? content : '';
  });
  return result;
}

/**
 * Fetches company logo URL from system_settings
 */
export async function getCompanyLogoUrl(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_logo_url")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "https://pnawosyjmvibwjpegnrs.supabase.co/storage/v1/object/public/branding/company-logo.png";
}

/**
 * Fetches company name from system_settings
 */
export async function getCompanyName(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_name")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "WashGear";
}

/**
 * Fetches email templates from system_settings
 */
export async function getEmailTemplate(
  supabase: ReturnType<typeof createClient>, 
  subjectKey: string, 
  bodyKey: string
) {
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

/**
 * Generates the email header with company logo — table-based for email client compatibility
 */
export function generateEmailHeader(logoUrl: string, companyName: string, title?: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #e6f3fb, #ffffff);">
      <tr>
        <td style="padding: 32px 24px 24px 32px;">
          <img src="${logoUrl}" alt="${companyName}" width="35" height="35" style="vertical-align: middle;" />
          ${title ? `<span style="font-size: 22px; font-weight: 700; color: #0f172a; vertical-align: middle; padding-left: 12px;">${title}</span>` : ''}
        </td>
      </tr>
    </table>
  `;
}

/**
 * Responsive style block for email media queries
 */
function getResponsiveStyles(): string {
  return `
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
  `;
}

/**
 * Wraps email content with branded header and footer — table-based layout for email clients
 */
export function wrapEmailWithBranding(
  content: string, 
  logoUrl: string, 
  companyName: string,
  title?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${getResponsiveStyles()}
    </head>
    <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f8;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f7f8;">
        <tr>
          <td align="center" style="padding: 24px;" class="email-container">
            <table width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.08);">
              <tr>
                <td>
                  ${generateEmailHeader(logoUrl, companyName, title)}
                </td>
              </tr>
              <tr>
                <td class="email-body" style="padding: 24px; color: #0f172a;">
                  ${content}
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

/**
 * Builds an HTML table for order items — responsive with reduced padding
 */
export function buildItemsTable(items: any[]): string {
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
