import { Resend } from "npm:resend@2.0.0";
import { queueContactNotification } from './notification-outbox.ts';

export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: { email: string; name: string };
  bypassPreferences?: boolean;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email using the Resend API
 * @param params Email parameters (to, subject, html, optional from)
 * @returns Result with success status and optional ID or error
 */
export async function sendResendEmail(params: EmailParams): Promise<EmailResult> {
  if (!params.bypassPreferences) {
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    for (const to of recipients) {
      const result = await queueContactNotification(to, 'email', params.subject, params.html);
      if (!result.matched) return { success: false, error: 'Recipient has no user notification profile' };
    }
    return { success: true };
  }
  return deliverResendEmail(params);
}

export async function deliverResendEmail(params: EmailParams): Promise<EmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured");
    return { success: false, error: "Resend API key not configured" };
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: params.from 
        ? `${params.from.name} <${params.from.email}>`
        : "WashGear <noreply@washgear.com>",
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      return { success: false, error: 'Email delivery failed' };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: 'Email delivery failed' };
  }
}
