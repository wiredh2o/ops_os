-- Add shipping preference columns to suppliers table
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS default_shipping_carrier TEXT,
ADD COLUMN IF NOT EXISTS default_shipping_method TEXT;

-- Add ship by date and shipping columns to purchase_orders table
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS ship_by_date DATE,
ADD COLUMN IF NOT EXISTS requested_shipping_carrier TEXT,
ADD COLUMN IF NOT EXISTS requested_shipping_method TEXT;

-- Add default PO email templates to system_settings
INSERT INTO public.system_settings (setting_key, setting_value, description, is_active)
VALUES 
  ('po_email_subject_template', 'Purchase Order {{po_number}} from {{company_name}}', 'Email subject template for purchase orders sent to vendors', true),
  ('po_email_body_template', '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<h2 style="color: #333;">Purchase Order {{po_number}}</h2>

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
</div>', 'HTML body template for purchase orders sent to vendors', true)
ON CONFLICT (setting_key) DO NOTHING;

-- Add comment explaining the ship_by_date calculation
COMMENT ON COLUMN public.purchase_orders.ship_by_date IS 'Calculated as order_date + lead_time_days - 4 calendar days. Represents when vendor should ship by.';