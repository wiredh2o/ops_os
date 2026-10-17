import { Resend } from "npm:resend@2.0.0";

export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: { email: string; name: string };
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
      console.error("Resend API error:", error);
      return { success: false, error: error.message };
    }

    console.log("Email sent successfully via Resend:", data?.id);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("Resend send error:", err);
    return { success: false, error: err.message || "Unknown error sending email" };
  }
}
