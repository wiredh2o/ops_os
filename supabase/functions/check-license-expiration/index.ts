import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendResendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Checking for expiring sales tax licenses...');

    // Get distributors with licenses expiring in the next 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: expiringLicenses, error } = await supabase
      .from('companies')
      .select(`
        id,
        name,
        sales_tax_license_expires_at,
        sales_tax_license_url,
        profiles!inner(
          id,
          email,
          first_name,
          last_name,
          user_roles!inner(role)
        )
      `)
      .eq('is_distributor', true)
      .not('sales_tax_license_expires_at', 'is', null)
      .lte('sales_tax_license_expires_at', thirtyDaysFromNow.toISOString().split('T')[0])
      .eq('profiles.user_roles.role', 'car_wash_admin');

    if (error) {
      throw new Error(`Database query error: ${error.message}`);
    }

    console.log(`Found ${expiringLicenses?.length || 0} companies with expiring licenses`);

    if (!expiringLicenses || expiringLicenses.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No expiring licenses found',
        notificationsSent: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let notificationsSent = 0;

    for (const company of expiringLicenses) {
      const expirationDate = new Date(company.sales_tax_license_expires_at);
      const daysUntilExpiration = Math.ceil((expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      
      // Send notifications for licenses expiring in 30, 14, 7, 3, 1 days or already expired
      if ([30, 14, 7, 3, 1, 0, -1, -7, -14].includes(daysUntilExpiration)) {
        
        // Find car wash admins for this company
        const carWashAdmins = company.profiles?.filter(profile => 
          profile.user_roles?.some(role => role.role === 'car_wash_admin')
        ) || [];

        for (const admin of carWashAdmins) {
          if (!admin.email) continue;

          const isExpired = daysUntilExpiration <= 0;
          const urgencyLevel = daysUntilExpiration <= 3 ? 'URGENT' : 
                              daysUntilExpiration <= 7 ? 'Important' : 'Notice';

          const subject = isExpired 
            ? `🚨 EXPIRED: Sales Tax License for ${company.name}`
            : `${urgencyLevel}: Sales Tax License Expiring Soon for ${company.name}`;

          const htmlContent = `
            <h2>${isExpired ? 'Sales Tax License EXPIRED' : 'Sales Tax License Expiring Soon'}</h2>
            <p>Dear ${admin.first_name || 'Administrator'},</p>
            
            <p><strong>Company:</strong> ${company.name}</p>
            <p><strong>License Expiration Date:</strong> ${expirationDate.toLocaleDateString()}</p>
            <p><strong>Days ${isExpired ? 'since expiration' : 'until expiration'}:</strong> ${Math.abs(daysUntilExpiration)} days</p>
            
            ${isExpired ? `
              <div style="background-color: #fee; border: 1px solid #fcc; padding: 15px; margin: 15px 0; border-radius: 5px;">
                <h3 style="color: #c33; margin-top: 0;">IMPORTANT: Tax Will Be Applied</h3>
                <p>Since your sales tax license has expired, <strong>sales tax will now be applied to all orders shipped to Colorado addresses</strong> until a current license is uploaded.</p>
              </div>
            ` : `
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 5px;">
                <h3 style="color: #856404; margin-top: 0;">Action Required</h3>
                <p>Please upload a current sales tax license to avoid having sales tax applied to Colorado orders.</p>
              </div>
            `}
            
            <p><strong>To update your license:</strong></p>
            <ol>
              <li>Log into your account</li>
              <li>Go to your company profile</li>
              <li>Upload your current sales tax license</li>
            </ol>
            
            <p>If you have any questions, please contact our support team.</p>
            
            <p>Best regards,<br>System Administrator</p>
          `;

          try {
            const result = await sendResendEmail({
              to: admin.email,
              subject: subject,
              html: htmlContent,
              from: { email: "noreply@washgear.com", name: "WashGear" },
            });

            if (result.success) {
              // Log the notification
              await supabase.from('notification_log').insert({
                order_id: company.id,
                order_type: 'license_expiration',
                notification_type: 'email',
                recipient: admin.email,
                subject: subject,
                message: `License ${isExpired ? 'expired' : 'expiring'} notification sent`,
                status: 'sent'
              });

              notificationsSent++;
              console.log(`Notification sent to ${admin.email} for company ${company.name}`);
            } else {
              throw new Error(result.error || 'Unknown error');
            }
          } catch (emailError: any) {
            console.error(`Failed to send email to ${admin.email}:`, emailError);
            
            // Log the failure
            await supabase.from('notification_log').insert({
              order_id: company.id,
              order_type: 'license_expiration',
              notification_type: 'email',
              recipient: admin.email,
              subject: subject,
              message: `License ${isExpired ? 'expired' : 'expiring'} notification failed`,
              status: 'failed',
              error_message: emailError.message
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${expiringLicenses.length} companies`,
      notificationsSent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in check-license-expiration:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
