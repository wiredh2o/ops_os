-- Update the payment request email template to include full invoice details
UPDATE system_settings 
SET setting_value = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="text-align: center; padding: 20px 0;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="max-width: 120px; height: auto;" />
  </div>
  <h2 style="color: #1e3a8a;">Payment Request</h2>
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
</div>'
WHERE setting_key = 'email_payment_request_body';