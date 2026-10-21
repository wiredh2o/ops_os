
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'
import { sendResendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type AppRole =
  | 'admin'
  | 'sales_support'
  | 'production'
  | 'accounting'
  | 'marketing'
  | 'car_wash_admin'
  | 'car_wash_employee'
  | 'vendor_admin'
  | 'vendor_employee'
  | 'distributor_admin'
  | 'distributor_employee'

interface InviteRequestBody {
  email: string
  companyId?: string
  intendedRole?: AppRole
  inviteMessage?: string
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? ''

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Service role key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as InviteRequestBody
    const { email, companyId, intendedRole, inviteMessage } = body

    if (!email) {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Client for current user (RLS-aware)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Admin client for privileged actions
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Identify the requester
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const requesterId = userData.user.id

    // Load requester roles (RLS allows users to view their own roles)
    const { data: roles, error: rolesError } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', requesterId)

    if (rolesError) {
      console.error('Error fetching roles:', rolesError)
      return new Response(JSON.stringify({ error: 'Failed to verify permissions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const roleList = (roles || []).map((r) => r.role as AppRole)

    // Check hierarchical permissions for inviting users
    let canInvite = false
    let canSetPermissions = false
    let finalRole: AppRole = intendedRole || 'car_wash_admin'
    
    // Check if any of the user's roles can manage the intended role
    for (const userRole of roleList) {
      // Check if this role can manage the intended role using hierarchical system
      const { data: canManage, error: manageError } = await userClient.rpc('can_role_manage_role', {
        _manager_role: userRole,
        _target_role: finalRole
      });

      if (!manageError && canManage) {
        canInvite = true;
        
        // Only admin can set permissions for car_wash_admin and other roles
        if (userRole === 'admin') {
          canSetPermissions = true;
        }
        break;
      }
    }

    if (!canInvite) {
      return new Response(JSON.stringify({ error: 'You do not have permission to invite users with this role' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check for existing pending invite - handle NULL company_id properly
    let existingInvitesQuery = userClient
      .from('pending_invites')
      .select('id, status')
      .eq('email', email)
      .eq('status', 'pending')

    // Handle company_id filtering properly for NULL values
    if (companyId) {
      existingInvitesQuery = existingInvitesQuery.eq('company_id', companyId)
    } else {
      existingInvitesQuery = existingInvitesQuery.is('company_id', null)
    }

    const { data: existingInvites, error: checkError } = await existingInvitesQuery

    if (checkError) {
      console.error('Error checking existing invites:', checkError)
      return new Response(JSON.stringify({ error: 'Failed to check existing invites' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let inviteRow: any

    if (existingInvites && existingInvites.length > 0) {
      // Update existing invite instead of creating new one
      const { data: updatedInvite, error: updateError } = await userClient
        .from('pending_invites')
        .update({
          intended_role: finalRole as unknown as string,
          inviter_user_id: requesterId,
          invite_message: inviteMessage || null,
          created_at: new Date().toISOString(), // Reset timestamp
        })
        .eq('id', existingInvites[0].id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating invite:', updateError)
        return new Response(JSON.stringify({ error: 'Failed to update existing invite' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      inviteRow = updatedInvite
    } else {
      // Insert new pending invite
      const { data: newInvite, error: inviteError } = await userClient
        .from('pending_invites')
        .insert({
          email,
          company_id: companyId || null, // Ensure undefined becomes null
          intended_role: finalRole as unknown as string,
          inviter_user_id: requesterId,
          invite_message: inviteMessage || null,
        })
        .select()
        .single()

      if (inviteError) {
        console.error('Error creating invite:', inviteError)
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      inviteRow = newInvite
    }

    // Clean up any failed invites for this email before attempting to send
    await userClient
      .from('pending_invites')
      .delete()
      .eq('email', email)
      .eq('status', 'failed')

    // Try Supabase invite first, fall back to direct user creation if email is blacklisted
    let { data: inviteResp, error: adminInviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        role: finalRole,
        company_id: companyId
      }
    })
    
    let isDirectUserCreation = false
    
    if (adminInviteError) {
      console.error('Supabase invite error:', adminInviteError)
      
      // If email is blacklisted/invalid, create user directly with temp password
      if (adminInviteError.message?.includes('invalid')) {
        console.log('Email blacklisted, creating user directly with temp password')
        
        // Generate a temporary password
        const tempPassword = crypto.randomUUID()
        
        // Create user directly
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: email,
          password: tempPassword,
          email_confirm: false, // User will need to reset password
          user_metadata: {
            role: finalRole,
            company_id: companyId
          }
        })

        if (createError) {
          console.error('Direct user creation error:', createError)
          await userClient
            .from('pending_invites')
            .update({ status: 'failed' })
            .eq('id', inviteRow.id)
          
          return new Response(JSON.stringify({ 
            error: `Failed to create user: ${createError.message}` 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Generate password reset link for the new user
        const redirectUrl = siteUrl || 'https://6410f7ff-45ec-4220-b569-f8e7c70d0f79.lovableproject.com'
        const { data: resetLink, error: resetError } = await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: email,
          options: {
            redirectTo: redirectUrl
          }
        })

        if (resetError) {
          console.error('Password reset link generation error:', resetError)
        } else if (resetLink) {
          // Send password reset email via Resend for direct user creation
          try {
            const resetHtml = `
              <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f7f7f8; padding:24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,0.08);">
                  <tr>
                    <td style="padding:24px; text-align:center; background:linear-gradient(135deg,#e6f3fb,#ffffff);">
                      <h1 style="margin:0; font-size:20px; color:#0f172a;">Set Your Password</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px; color:#0f172a;">
                      <p style="margin:0 0 16px;">Hello,</p>
                      <p style="margin:0 0 16px;">Your account has been created for <strong>${email}</strong>. Click the button below to set your password and access your account.</p>
                      <div style="text-align:center; margin:24px 0;">
                        <a href="${resetLink.properties.action_link}" style="display:inline-block; background:#0ea5e9; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Set Your Password</a>
                      </div>
                      <p style="margin:16px 0 0; font-size:14px; color:#64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
                      <p style="margin:8px 0 16px; font-size:12px; color:#64748b; word-break:break-all;">${resetLink.properties.action_link}</p>
                      <p style="margin:24px 0 8px; font-size:12px; color:#475569;">This link will expire in 1 hour for security reasons.</p>
                    </td>
                  </tr>
                </table>
              </div>`;

            const resetResult = await sendResendEmail({
              bypassPreferences: true,
              to: email,
              subject: "Set your password - Wash Gear",
              html: resetHtml,
              from: { email: "noreply@washgear.com", name: "Wash Gear" },
            });

            if (!resetResult.success) {
              console.error('Password reset email error:', resetResult.error);
            } else {
              console.log('Password reset email sent successfully');
            }
          } catch (e) {
            console.error('Error sending password reset email:', e);
          }
        }

        inviteResp = { user: newUser.user }
        isDirectUserCreation = true
        console.log('User created directly, bypass Supabase invite system')
        
      } else {
        // Mark invite as failed for other errors
        await userClient
          .from('pending_invites')
          .update({ status: 'failed' })
          .eq('id', inviteRow.id)
        
        // Check if this is an "email already exists" error
        if (adminInviteError.message?.includes('already exists')) {
          return new Response(JSON.stringify({ 
            error: `Email "${email}" cannot be invited: ${adminInviteError.message}. Try deleting the user first if they exist.` 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        
        return new Response(JSON.stringify({ 
          error: `Failed to send invite: ${adminInviteError.message}` 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Log notification and send branded email (best effort)
    await userClient.from('notification_log').insert({
      order_id: inviteRow.id,
      order_type: 'user_invite',
      notification_type: 'email',
      recipient: email,
      subject: `You're invited to Wash Gear`,
      message: inviteMessage || `You have been invited with role ${finalRole}`,
      status: 'sent',
    })

    // Get invitee's first name from profiles table (if they exist)
    const { data: profileData, error: profileError } = await adminClient
      .from('profiles')
      .select('first_name')
      .eq('email', email)
      .maybeSingle();

    if (profileError) {
      console.log('Error fetching profile for first name:', profileError);
    }

    const firstName = profileData?.first_name || '';
    console.log(`Profile lookup for ${email}: firstName="${firstName}"`);

    // Fetch company logo dynamically and send welcome email
    try {
      const logoUrl = await getCompanyLogoUrl(adminClient);
      const html = `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f7f7f8; padding:24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="padding:24px; text-align:center; background:linear-gradient(135deg,#e6f3fb,#ffffff);">
                <img src="${logoUrl}" alt="WashGear logo" width="72" height="72" style="display:inline-block; border-radius:12px;" />
                <h1 style="margin:12px 0 0; font-size:20px; color:#0f172a;">Welcome to WashGear!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px; color:#0f172a;">
                <p style="margin:0 0 16px;">Hello${firstName ? ` ${firstName}` : ''},</p>
                <p style="margin:0 0 16px;">You've been invited to join WashGear, the comprehensive business management platform for car wash operations. We're excited to have you on board!</p>
                ${inviteMessage ? `<p style="margin:0 0 16px; background:#f8fafc; padding:16px; border-radius:8px; border-left:4px solid #0ea5e9; white-space:pre-line; font-style:italic;">"${inviteMessage}"</p>` : ''}
                <p style="margin:0 0 16px;">Your account has been ${isDirectUserCreation ? 'created' : 'invited'} with the role of <strong>${finalRole.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>. You'll have access to manage your business operations efficiently through our platform.</p>
                <p style="margin:0 0 16px;"><strong>Next steps:</strong></p>
                <ul style="margin:0 0 16px; padding-left:20px;">
                  <li style="margin:0 0 8px;">${isDirectUserCreation ? 'Check your inbox for a "Set your password" email' : 'Look for a separate invitation email from Supabase'}</li>
                  <li style="margin:0 0 8px;">Click the secure link to activate your account and set your password</li>
                  <li style="margin:0 0 8px;">Log in and start exploring WashGear's features</li>
                </ul>
                ${siteUrl ? `<div style="text-align:center; margin:24px 0;"><a href="${siteUrl}" style="display:inline-block; background:#0ea5e9; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Access WashGear</a></div>` : ''}
                <p style="margin:16px 0 0; font-size:14px; color:#64748b;">If you have any questions, don't hesitate to reach out to our support team.</p>
                <p style="margin:24px 0 8px; font-size:12px; color:#475569;">If you didn't expect this invitation, you can safely ignore this message.</p>
                <p style="margin:16px 0 0; font-size:14px; color:#0f172a;">Welcome aboard!<br>The WashGear Team</p>
              </td>
            </tr>
          </table>
        </div>`;

      const welcomeResult = await sendResendEmail({
        bypassPreferences: true,
        to: email,
        subject: `Welcome to WashGear${firstName ? `, ${firstName}` : ''}!`,
        html: html,
        from: { email: "noreply@washgear.com", name: "WashGear" },
      });

      if (!welcomeResult.success) {
        console.log('Welcome email error:', welcomeResult.error);
      }
    } catch (e) {
      console.log('SendGrid email error:', e)
    }

    return new Response(
      JSON.stringify({ success: true, inviteId: inviteRow.id, role: finalRole, supabaseInvite: inviteResp }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('invite-user error:', err)
    return new Response(JSON.stringify({ error: err?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
