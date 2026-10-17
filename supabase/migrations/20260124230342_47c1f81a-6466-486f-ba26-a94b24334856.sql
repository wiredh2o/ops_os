-- Update all email templates to use left-aligned logo with flex layout (80px size)

UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: center; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 80px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: #1e3a8a;">Payment Request</h2>
  </div>
  <p>Dear {{customer_name}},</p>
  <p>Your order is ready for payment. Please review the details below:</p>
  
  <h3 style="margin-top: 20px;">Order #{{order_number}}</h3>
  {{items_table}}
  
  <div style="background:#f9fafb; padding:15px; border-radius:8px; margin:20px 0;">
    <p style="margin:5px 0;"><strong>Subtotal:</strong> {{subtotal}}</p>
    <p style="margin:5px 0;"><strong>Tax:</strong> {{tax_amount}}</p>
    <p style="margin:5px 0;"><strong>Shipping:</strong> {{shipping_cost}}</p>
    <p style="margin:5px 0; font-size:18px; border-top:1px solid #e5e7eb; padding-top:10px;"><strong>Total Due:</strong> {{amount}}</p>
  </div>
  
  <p style="text-align:center;">
    <a href="{{payment_url}}" style="display:inline-block; background:#1e3a8a; color:white; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:bold;">Pay Now</a>
  </p>
  <p style="font-size: 14px; color: #6b7280;">If you have any questions, please don''t hesitate to contact us.</p>
</div>',
updated_at = now()
WHERE setting_key = 'email_payment_request_body';

UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: center; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 80px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: #16a34a;">Payment Confirmed</h2>
  </div>
  <p>Dear {{customer_name}},</p>
  <p>Thank you! Your payment has been successfully processed.</p>
  <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #86efac;">
    <h3 style="margin: 0 0 10px 0; color: #166534;">Payment Details</h3>
    <p style="margin: 5px 0;"><strong>Order Number:</strong> {{order_number}}</p>
    <p style="margin: 5px 0;"><strong>Amount Paid:</strong> {{amount}}</p>
    <p style="margin: 5px 0;"><strong>Payment Date:</strong> {{payment_date}}</p>
  </div>
  <p style="font-size: 14px; color: #6b7280;">Thank you for choosing {{company_name}}.</p>
</div>',
updated_at = now()
WHERE setting_key = 'email_payment_confirmation_body';

UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: center; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 80px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: #1e3a8a;">{{order_type}} Order Update</h2>
  </div>
  <p>Dear {{customer_name}},</p>
  <p>{{status_message}}</p>
  <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin: 0 0 10px 0; color: #374151;">Order Details</h3>
    <p style="margin: 5px 0;"><strong>Order Number:</strong> {{order_number}}</p>
    <p style="margin: 5px 0;"><strong>Status:</strong> {{status}}</p>
  </div>
  <p style="font-size: 14px; color: #6b7280;">Thank you for choosing {{company_name}}.</p>
</div>',
updated_at = now()
WHERE setting_key = 'email_status_update_body';

UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: center; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 80px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: #1e3a8a;">Welcome to {{company_name}}!</h2>
  </div>
  <p>Hello {{user_name}},</p>
  <p>You have been invited to join {{company_name}}. Click the button below to set up your account.</p>
  <p style="margin: 30px 0;"><a href="{{invite_url}}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Accept Invitation</a></p>
  <p style="font-size: 14px; color: #6b7280;">If you didn''t expect this invitation, you can safely ignore this email.</p>
</div>',
updated_at = now()
WHERE setting_key = 'email_user_invitation_body';

UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: center; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 80px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: #1e3a8a;">Password Reset Request</h2>
  </div>
  <p>Hello {{user_name}},</p>
  <p>We received a request to reset your password. Click the button below to create a new password.</p>
  <p style="margin: 30px 0;"><a href="{{reset_url}}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
  <p style="font-size: 14px; color: #6b7280;">This link will expire in {{expires_in}}. If you didn''t request this, you can safely ignore this email.</p>
</div>',
updated_at = now()
WHERE setting_key = 'email_password_reset_body';

UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: center; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 80px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: {{header_color}};">Sales Tax License {{expiration_status}}</h2>
  </div>
  <p>Dear {{user_name}},</p>
  <p><strong>Company:</strong> {{company_name}}</p>
  <p><strong>License Expiration Date:</strong> {{expiration_date}}</p>
  <p><strong>Days {{days_label}}:</strong> {{days_count}} days</p>
  {{#if is_expired}}
  <div style="background-color: #fee; border: 1px solid #fcc; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h3 style="color: #c33; margin-top: 0;">IMPORTANT: Tax Will Be Applied</h3>
    <p>Since your sales tax license has expired, sales tax will now be applied to all orders shipped to Colorado addresses.</p>
  </div>
  {{/if}}
  {{#unless is_expired}}
  <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 5px;">
    <h3 style="color: #856404; margin-top: 0;">Action Required</h3>
    <p>Please upload a current sales tax license to avoid having sales tax applied.</p>
  </div>
  {{/unless}}
  <p>Best regards,<br>System Administrator</p>
</div>',
updated_at = now()
WHERE setting_key = 'email_license_expiration_body';

UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <div style="display: flex; align-items: center; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 80px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0;">Purchase Order {{po_number}}</h2>
  </div>
  <table style="width: 100%; margin-bottom: 20px;">
    <tr><td><strong>From:</strong></td><td>{{company_name}}</td></tr>
    <tr><td><strong>Order Date:</strong></td><td>{{order_date}}</td></tr>
    <tr><td><strong>Ship By:</strong></td><td>{{ship_by_date}}</td></tr>
    <tr><td><strong>Ship Via:</strong></td><td>{{shipping_carrier}} {{shipping_method}}</td></tr>
  </table>
  <h3 style="border-bottom: 2px solid #333; padding-bottom: 5px;">Order Items</h3>
  {{items_table}}
  <p style="font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px;">Total: {{total}}</p>
  {{#if notes}}
  <div style="background: #f5f5f5; padding: 15px; margin-top: 20px; border-radius: 5px;">
    <strong>Notes:</strong><br>{{notes}}
  </div>
  {{/if}}
  <hr style="margin-top: 30px;">
  <p style="color: #666; font-size: 12px;">
    Please confirm receipt of this purchase order.<br>
    {{company_name}} | {{company_phone}} | {{company_email}}
  </p>
</div>',
updated_at = now()
WHERE setting_key = 'po_email_body_template';