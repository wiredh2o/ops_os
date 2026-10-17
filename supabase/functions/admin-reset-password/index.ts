import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { sendResendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResetPasswordRequest {
  userId: string;
}

interface ResetPasswordResponse {
  success: boolean;
  message: string;
  error?: string;
}

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

async function getCompanyName(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("setting_value")
    .eq("setting_key", "company_name")
    .eq("is_active", true)
    .maybeSingle();
  
  return data?.setting_value || "WashGear";
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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { userId }: ResetPasswordRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "User ID is required" } as ResetPasswordResponse),
        { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // Initialize Supabase clients
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!supabaseServiceKey || !supabaseUrl) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" } as ResetPasswordResponse),
        { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // Admin client for user operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Regular client for current user verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" } as ResetPasswordResponse),
        { 
          status: 401, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Get current user
    const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !currentUser) {
      console.error('Error getting current user:', userError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" } as ResetPasswordResponse),
        { 
          status: 401, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // Check if user is trying to reset their own password
    if (currentUser.id === userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot reset your own password through this interface" } as ResetPasswordResponse),
        { 
          status: 403, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // Get current user's roles
    const { data: currentUserRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return new Response(
        JSON.stringify({ success: false, error: "Permission check failed" } as ResetPasswordResponse),
        { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    const roles = currentUserRoles?.map(r => r.role) || [];
    const isAdmin = roles.includes('admin');
    const isSalesSupport = roles.includes('sales_support');

    // Check basic permissions
    if (!isAdmin && !isSalesSupport) {
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions" } as ResetPasswordResponse),
        { 
          status: 403, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // For sales support, check if target user is car_wash_admin
    if (isSalesSupport && !isAdmin) {
      const { data: targetUserRoles, error: targetRolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (targetRolesError) {
        console.error('Error fetching target user roles:', targetRolesError);
        return new Response(
          JSON.stringify({ success: false, error: "Permission check failed" } as ResetPasswordResponse),
          { 
            status: 500, 
            headers: { "Content-Type": "application/json", ...corsHeaders } 
          }
        );
      }

      const targetRoles = targetUserRoles?.map(r => r.role) || [];
      if (!targetRoles.includes('car_wash_admin')) {
        return new Response(
          JSON.stringify({ success: false, error: "Sales support can only reset passwords for car wash admin accounts" } as ResetPasswordResponse),
          { 
            status: 403, 
            headers: { "Content-Type": "application/json", ...corsHeaders } 
          }
        );
      }
    }

    // Get target user details
    const { data: targetUser, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (targetUserError || !targetUser.user) {
      console.error('Error fetching target user:', targetUserError);
      return new Response(
        JSON.stringify({ success: false, error: "User not found" } as ResetPasswordResponse),
        { 
          status: 404, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // Get user's first name from profiles table
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('first_name')
      .eq('email', targetUser.user.email!)
      .maybeSingle();

    if (profileError) {
      console.log('Error fetching profile for first name:', profileError);
    }

    const firstName = profileData?.first_name || '';
    console.log(`Profile lookup for ${targetUser.user.email}: firstName="${firstName}"`);

    // Generate password reset link
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: targetUser.user.email!,
    });

    if (resetError) {
      console.error('Error generating reset link:', resetError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate password reset" } as ResetPasswordResponse),
        { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // Get company name, logo, and email templates
    const [companyName, logoUrl] = await Promise.all([
      getCompanyName(supabaseAdmin),
      getCompanyLogoUrl(supabaseAdmin),
    ]);
    
    const { subject: subjectTemplate, body: bodyTemplate } = await getEmailTemplate(
      supabaseAdmin,
      "email_password_reset_subject",
      "email_password_reset_body"
    );

    const templateVars: Record<string, string> = {
      user_name: firstName || 'User',
      reset_url: resetData.properties?.action_link || '',
      expires_in: '1 hour',
      company_name: companyName,
      company_logo: logoUrl,
    };

    let emailSubject: string;
    let htmlContent: string;

    if (subjectTemplate && bodyTemplate) {
      emailSubject = replaceTemplateVariables(subjectTemplate, templateVars);
      htmlContent = replaceTemplateVariables(bodyTemplate, templateVars);
    } else {
      // Default template with company logo
      emailSubject = `${companyName} Password Reset Request`;
      htmlContent = `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f7f7f8; padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="padding:24px; text-align:center; background:linear-gradient(135deg,#e6f3fb,#ffffff);">
                <img src="${logoUrl}" alt="${companyName} logo" width="72" height="72" style="display:inline-block; border-radius:12px;" />
                <h1 style="margin:12px 0 0; font-size:20px; color:#0f172a;">Password Reset Request</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px; color:#0f172a;">
                <p style="margin:0 0 16px;">Hello${firstName ? ` ${firstName}` : ''},</p>
                <p style="margin:0 0 16px;">A password reset has been requested for your ${companyName} account. Click the button below to securely reset your password:</p>
                <div style="text-align:center; margin:24px 0;">
                  <a href="${resetData.properties?.action_link}" style="display:inline-block; background:#0ea5e9; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Reset Your Password</a>
                </div>
                <p style="margin:16px 0 0; font-size:14px; color:#64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:8px 0 16px; font-size:12px; color:#64748b; word-break:break-all;">${resetData.properties?.action_link}</p>
                <p style="margin:16px 0; font-size:14px; color:#64748b;">If you didn't request this password reset, you can safely ignore this email.</p>
                <p style="margin:24px 0 8px; font-size:12px; color:#475569;">This link will expire in 1 hour for security reasons.</p>
                <p style="margin:16px 0 0; font-size:14px; color:#0f172a;">Best regards,<br>The ${companyName} Team</p>
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    // Send password reset email using Resend
    const result = await sendResendEmail({
      to: targetUser.user.email!,
      subject: emailSubject,
      html: htmlContent,
      from: { email: "noreply@washgear.com", name: companyName },
    });

    if (!result.success) {
      console.error('Error sending password reset email:', result.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send password reset email" } as ResetPasswordResponse),
        { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    console.log(`Password reset email sent successfully to ${targetUser.user.email}`);
    console.log(`Password reset initiated by ${currentUser.email} for user ${targetUser.user.email}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Password reset email sent to ${targetUser.user.email}`
      } as ResetPasswordResponse),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in admin-reset-password function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error"
      } as ResetPasswordResponse),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
