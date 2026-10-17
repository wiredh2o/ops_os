-- Seed default email templates into system_settings

-- Payment Request Email
INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_payment_request_subject',
  'Payment Request - Order {{order_number}}',
  'Subject line for payment request emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_payment_request_body',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1e3a8a;">Payment Request</h2>
  <p>Dear {{customer_name}},</p>
  <p>We have prepared your order and it is ready for payment.</p>
  <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin: 0 0 10px 0; color: #374151;">Order Details</h3>
    <p style="margin: 5px 0;"><strong>Order Number:</strong> {{order_number}}</p>
    <p style="margin: 5px 0;"><strong>Amount Due:</strong> {{amount}}</p>
  </div>
  <p><a href="{{payment_url}}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Pay Now</a></p>
  <p style="font-size: 14px; color: #6b7280;">If you have any questions, please don''t hesitate to contact us.</p>
</div>',
  'HTML body for payment request emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- Payment Confirmation Email
INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_payment_confirmation_subject',
  'Payment Confirmed - Order {{order_number}}',
  'Subject line for payment confirmation emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_payment_confirmation_body',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #16a34a;">Payment Confirmed</h2>
  <p>Dear {{customer_name}},</p>
  <p>Thank you! Your payment has been successfully processed.</p>
  <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #86efac;">
    <h3 style="margin: 0 0 10px 0; color: #166534;">Payment Details</h3>
    <p style="margin: 5px 0;"><strong>Order Number:</strong> {{order_number}}</p>
    <p style="margin: 5px 0;"><strong>Amount Paid:</strong> {{amount}}</p>
    <p style="margin: 5px 0;"><strong>Payment Date:</strong> {{payment_date}}</p>
  </div>
  <p style="font-size: 14px; color: #6b7280;">Thank you for choosing our services. If you have any questions, please don''t hesitate to contact us.</p>
</div>',
  'HTML body for payment confirmation emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- Order Status Update Email
INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_status_update_subject',
  '{{order_type}} Order Update - {{order_number}}',
  'Subject line for order status update emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_status_update_body',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1e3a8a;">{{order_type}} Order Update</h2>
  <p>Dear {{customer_name}},</p>
  <p>{{status_message}}</p>
  <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin: 0 0 10px 0; color: #374151;">Order Details</h3>
    <p style="margin: 5px 0;"><strong>Order Number:</strong> {{order_number}}</p>
    <p style="margin: 5px 0;"><strong>Status:</strong> {{status}}</p>
  </div>
  <p style="font-size: 14px; color: #6b7280;">Thank you for choosing {{company_name}}. If you have any questions, please don''t hesitate to contact us.</p>
</div>',
  'HTML body for order status update emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- User Invitation Email
INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_user_invitation_subject',
  'You''ve Been Invited to Join {{company_name}}',
  'Subject line for user invitation emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_user_invitation_body',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1e3a8a;">Welcome to {{company_name}}!</h2>
  <p>Hello {{user_name}},</p>
  <p>You have been invited to join {{company_name}}. Click the button below to set up your account and get started.</p>
  <p style="margin: 30px 0;"><a href="{{invite_url}}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Accept Invitation</a></p>
  <p style="font-size: 14px; color: #6b7280;">If you didn''t expect this invitation, you can safely ignore this email.</p>
</div>',
  'HTML body for user invitation emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- Password Reset Email
INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_password_reset_subject',
  'Reset Your Password - {{company_name}}',
  'Subject line for password reset emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_password_reset_body',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1e3a8a;">Password Reset Request</h2>
  <p>Hello {{user_name}},</p>
  <p>We received a request to reset your password. Click the button below to create a new password.</p>
  <p style="margin: 30px 0;"><a href="{{reset_url}}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
  <p style="font-size: 14px; color: #6b7280;">This link will expire in {{expires_in}}. If you didn''t request a password reset, you can safely ignore this email.</p>
</div>',
  'HTML body for password reset emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

-- License Expiration Alert Email
INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_license_expiration_subject',
  '{{urgency_level}}: Sales Tax License {{expiration_status}} for {{company_name}}',
  'Subject line for license expiration alert emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value, description, is_active)
VALUES (
  'email_license_expiration_body',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: {{header_color}};">Sales Tax License {{expiration_status}}</h2>
  <p>Dear {{user_name}},</p>
  <p><strong>Company:</strong> {{company_name}}</p>
  <p><strong>License Expiration Date:</strong> {{expiration_date}}</p>
  <p><strong>Days {{days_label}}:</strong> {{days_count}} days</p>
  {{#if is_expired}}
  <div style="background-color: #fee; border: 1px solid #fcc; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h3 style="color: #c33; margin-top: 0;">IMPORTANT: Tax Will Be Applied</h3>
    <p>Since your sales tax license has expired, <strong>sales tax will now be applied to all orders shipped to Colorado addresses</strong> until a current license is uploaded.</p>
  </div>
  {{/if}}
  {{#unless is_expired}}
  <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h3 style="color: #856404; margin-top: 0;">Action Required</h3>
    <p>Please upload a current sales tax license to avoid having sales tax applied to Colorado orders.</p>
  </div>
  {{/unless}}
  <p><strong>To update your license:</strong></p>
  <ol>
    <li>Log into your account</li>
    <li>Go to your company profile</li>
    <li>Upload your current sales tax license</li>
  </ol>
  <p>If you have any questions, please contact our support team.</p>
  <p>Best regards,<br>System Administrator</p>
</div>',
  'HTML body for license expiration alert emails',
  true
) ON CONFLICT (setting_key) DO NOTHING;