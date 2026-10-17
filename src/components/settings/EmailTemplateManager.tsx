import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mail, FileText, CreditCard, Package, UserPlus, KeyRound, AlertTriangle, Receipt, RotateCcw, Save, Loader2, Eye, Send, Code } from "lucide-react";
import { useSystemSetting, useUpdateSystemSetting } from "@/hooks/useSystemSettings";
import { showToast } from "@/lib/toast-utils";
import { supabase } from "@/integrations/supabase/client";
import { VisualEmailEditor } from "./VisualEmailEditor";

interface TemplateConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  subjectKey: string;
  bodyKey: string;
  mergeFields: { field: string; description: string }[];
  defaultSubject: string;
  defaultBody: string;
}

// Default company logo URL
const DEFAULT_LOGO_URL = "https://pnawosyjmvibwjpegnrs.supabase.co/storage/v1/object/public/branding/company-logo.png";

// Sample data for each template type
const sampleDataMap: Record<string, Record<string, string>> = {
  purchase_order: {
    company_logo: DEFAULT_LOGO_URL,
    po_number: "PO-2024-001",
    vendor_name: "Sample Vendor Inc.",
    order_date: "January 24, 2026",
    ship_by_date: "January 31, 2026",
    shipping_carrier: "FedEx",
    shipping_method: "Ground",
    items_table: `<table style="width:100%; border-collapse:collapse; margin: 15px 0;">
      <tr style="background:#f3f4f6;">
        <th style="padding:10px; border:1px solid #ddd; text-align:left;">SKU</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:left;">Description</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:center;">Qty</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:right;">Price</th>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd;">BRUSH-001</td>
        <td style="padding:10px; border:1px solid #ddd;">Foam Brush Assembly</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:center;">10</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right;">$25.00</td>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd;">HOSE-002</td>
        <td style="padding:10px; border:1px solid #ddd;">High-Pressure Hose 50ft</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:center;">5</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right;">$45.00</td>
      </tr>
    </table>`,
    total: "$475.00",
    notes: "Please ship ASAP - urgent order",
    company_name: "WashGear",
    company_email: "orders@washgear.com",
    company_phone: "(555) 123-4567",
    ship_to_address: "WashGear<br>123 Industrial Blvd<br>Suite 100<br>Denver, CO 80202<br>USA",
    shipment_tracking_url: "https://lean-prime-ops.lovable.app/vendor-shipment/sample-token"
  },
  payment_request: {
    company_logo: DEFAULT_LOGO_URL,
    customer_name: "John Smith",
    order_number: "ORD-12345",
    items_table: `<table style="width:100%; border-collapse:collapse; margin: 15px 0;">
      <tr style="background:#f3f4f6;">
        <th style="padding:10px; border:1px solid #ddd; text-align:left;">Item</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:left;">SKU</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:center;">Qty</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:right;">Unit Price</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:right;">Total</th>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd;">Foam Brush Assembly</td>
        <td style="padding:10px; border:1px solid #ddd; font-family:monospace;">BRUSH-001</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:center;">2</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right;">$125.00</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right; font-weight:500;">$250.00</td>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd;">High-Pressure Hose</td>
        <td style="padding:10px; border:1px solid #ddd; font-family:monospace;">HOSE-002</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:center;">1</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right;">$24.99</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right; font-weight:500;">$24.99</td>
      </tr>
    </table>`,
    subtotal: "$274.99",
    tax_amount: "$22.00",
    shipping_cost: "$15.99",
    amount: "$312.98",
    payment_url: "https://example.com/pay/sample-token",
    company_name: "WashGear"
  },
  payment_confirmation: {
    company_logo: DEFAULT_LOGO_URL,
    customer_name: "John Smith",
    order_number: "ORD-12345",
    amount: "$299.99",
    payment_date: "January 24, 2026",
    company_name: "WashGear"
  },
  status_update: {
    company_logo: DEFAULT_LOGO_URL,
    customer_name: "John Smith",
    order_number: "ORD-12345",
    order_type: "Production",
    status: "In Production",
    status_message: "Your order is currently being assembled and will ship within 3-5 business days.",
    company_name: "WashGear"
  },
  user_invitation: {
    company_logo: DEFAULT_LOGO_URL,
    user_name: "Jane Doe",
    user_email: "jane.doe@example.com",
    invite_url: "https://example.com/accept-invite/sample-token",
    company_name: "WashGear"
  },
  password_reset: {
    company_logo: DEFAULT_LOGO_URL,
    user_name: "Jane Doe",
    reset_url: "https://example.com/reset-password/sample-token",
    expires_in: "1 hour",
    company_name: "WashGear"
  },
  license_expiration: {
    company_logo: DEFAULT_LOGO_URL,
    user_name: "Admin User",
    company_name: "ABC Car Wash Company",
    expiration_date: "February 15, 2026",
    days_count: "22",
    days_label: "until expiration",
    urgency_level: "Important",
    expiration_status: "Expiring Soon",
    header_color: "#f59e0b",
    is_expired: "false"
  },
  order_confirmation: {
    company_logo: DEFAULT_LOGO_URL,
    customer_name: "John Smith",
    order_number: "ORD-12345",
    order_date: "January 24, 2026",
    items_table: `<table style="width:100%; border-collapse:collapse; margin: 15px 0;">
      <tr style="background:#f3f4f6;">
        <th style="padding:10px; border:1px solid #ddd; text-align:left;">SKU</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:left;">Item</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:center;">Qty</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:right;">Price</th>
        <th style="padding:10px; border:1px solid #ddd; text-align:right;">Total</th>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd; font-family:monospace;">BRUSH-001</td>
        <td style="padding:10px; border:1px solid #ddd;">Foam Brush Assembly</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:center;">2</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right;">$125.00</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right; font-weight:500;">$250.00</td>
      </tr>
      <tr>
        <td style="padding:10px; border:1px solid #ddd; font-family:monospace;">HOSE-002</td>
        <td style="padding:10px; border:1px solid #ddd;">High-Pressure Hose 50ft</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:center;">1</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right;">$45.00</td>
        <td style="padding:10px; border:1px solid #ddd; text-align:right; font-weight:500;">$45.00</td>
      </tr>
    </table>`,
    subtotal: "$295.00",
    tax_amount: "$23.60",
    shipping_cost: "$15.99",
    total: "$334.59",
    shipping_address: "John Smith<br>456 Main Street<br>Denver, CO 80202",
    payment_method: "Visa ending in 4242",
    notes: "Please ship ASAP",
    company_name: "WashGear"
  }
};

const templateConfigs: TemplateConfig[] = [
  {
    id: "purchase_order",
    label: "Purchase Order",
    icon: <FileText className="h-4 w-4" />,
    subjectKey: "po_email_subject_template",
    bodyKey: "po_email_body_template",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{po_number}}", description: "Purchase order number" },
      { field: "{{vendor_name}}", description: "Supplier/vendor name" },
      { field: "{{order_date}}", description: "Date order was placed" },
      { field: "{{ship_by_date}}", description: "Calculated ship by date" },
      { field: "{{shipping_carrier}}", description: "Selected carrier" },
      { field: "{{shipping_method}}", description: "Selected shipping method" },
      { field: "{{items_table}}", description: "Auto-generated HTML table of line items" },
      { field: "{{total}}", description: "Order total" },
      { field: "{{notes}}", description: "PO notes" },
      { field: "{{company_name}}", description: "Your company name" },
      { field: "{{company_email}}", description: "Your company email" },
      { field: "{{company_phone}}", description: "Your company phone" },
      { field: "{{ship_to_address}}", description: "Ship-to address (facility or drop-ship)" },
      { field: "{{shipment_tracking_url}}", description: "Vendor portal URL for tracking submission" },
    ],
    defaultSubject: "Purchase Order {{po_number}} from {{company_name}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <div style="display: flex; align-items: flex-end; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 53px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0;">Purchase Order {{po_number}}</h2>
  </div>
  <p>Dear {{vendor_name}},</p>
  <p>Please find below our purchase order details:</p>
  <p><strong>Order Date:</strong> {{order_date}}</p>
  <p><strong>Ship By:</strong> {{ship_by_date}}</p>
  <p><strong>Shipping:</strong> {{shipping_carrier}} - {{shipping_method}}</p>
  {{#if ship_to_address}}
  <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0 0 8px; font-weight: 600; color: #065f46;">📦 Ship To:</p>
    <p style="margin: 0; color: #047857; line-height: 1.6;">{{ship_to_address}}</p>
  </div>
  {{/if}}
  {{items_table}}
  <p><strong>Total:</strong> {{total}}</p>
  {{#if notes}}<p><strong>Notes:</strong> {{notes}}</p>{{/if}}
  <p style="margin: 24px 0 10px;">Once shipped, please submit your tracking information:</p>
  <p><a href="{{shipment_tracking_url}}" style="display:inline-block; background:#1e3a8a; color:white; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:bold;">Add Tracking Number</a></p>
  <p style="margin-top: 24px;">Best regards,<br>{{company_name}}<br>{{company_email}}<br>{{company_phone}}</p>
</div>`,
  },
  {
    id: "payment_request",
    label: "Payment Request",
    icon: <CreditCard className="h-4 w-4" />,
    subjectKey: "email_payment_request_subject",
    bodyKey: "email_payment_request_body",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{customer_name}}", description: "Customer's name" },
      { field: "{{order_number}}", description: "Order number" },
      { field: "{{items_table}}", description: "Auto-generated HTML table of line items" },
      { field: "{{subtotal}}", description: "Subtotal before tax" },
      { field: "{{tax_amount}}", description: "Tax amount" },
      { field: "{{shipping_cost}}", description: "Shipping cost" },
      { field: "{{amount}}", description: "Total amount due" },
      { field: "{{payment_url}}", description: "Link to payment page" },
      { field: "{{company_name}}", description: "Your company name" },
    ],
    defaultSubject: "Payment Request - Order {{order_number}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: flex-end; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 53px; height: auto; flex-shrink: 0;" />
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
  <p style="font-size: 14px; color: #6b7280;">If you have any questions, please don't hesitate to contact us.</p>
</div>`,
  },
  {
    id: "payment_confirmation",
    label: "Payment Confirmation",
    icon: <CreditCard className="h-4 w-4" />,
    subjectKey: "email_payment_confirmation_subject",
    bodyKey: "email_payment_confirmation_body",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{customer_name}}", description: "Customer's name" },
      { field: "{{order_number}}", description: "Order number" },
      { field: "{{amount}}", description: "Amount paid" },
      { field: "{{payment_date}}", description: "Date of payment" },
      { field: "{{company_name}}", description: "Your company name" },
    ],
    defaultSubject: "Payment Confirmed - Order {{order_number}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: flex-end; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 53px; height: auto; flex-shrink: 0;" />
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
</div>`,
  },
  {
    id: "status_update",
    label: "Order Status Update",
    icon: <Package className="h-4 w-4" />,
    subjectKey: "email_status_update_subject",
    bodyKey: "email_status_update_body",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{customer_name}}", description: "Customer's name" },
      { field: "{{order_number}}", description: "Order number" },
      { field: "{{order_type}}", description: "Production or Repair" },
      { field: "{{status}}", description: "Current status" },
      { field: "{{status_message}}", description: "Status-specific message" },
      { field: "{{company_name}}", description: "Your company name" },
    ],
    defaultSubject: "{{order_type}} Order Update - {{order_number}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: flex-end; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 53px; height: auto; flex-shrink: 0;" />
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
</div>`,
  },
  {
    id: "user_invitation",
    label: "User Invitation",
    icon: <UserPlus className="h-4 w-4" />,
    subjectKey: "email_user_invitation_subject",
    bodyKey: "email_user_invitation_body",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{user_name}}", description: "Invitee's name" },
      { field: "{{user_email}}", description: "Invitee's email" },
      { field: "{{invite_url}}", description: "Invitation link" },
      { field: "{{company_name}}", description: "Your company name" },
    ],
    defaultSubject: "You've Been Invited to Join {{company_name}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: flex-end; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 53px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: #1e3a8a;">Welcome to {{company_name}}!</h2>
  </div>
  <p>Hello {{user_name}},</p>
  <p>You have been invited to join {{company_name}}. Click the button below to set up your account.</p>
  <p style="margin: 30px 0;"><a href="{{invite_url}}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Accept Invitation</a></p>
  <p style="font-size: 14px; color: #6b7280;">If you didn't expect this invitation, you can safely ignore this email.</p>
</div>`,
  },
  {
    id: "password_reset",
    label: "Password Reset",
    icon: <KeyRound className="h-4 w-4" />,
    subjectKey: "email_password_reset_subject",
    bodyKey: "email_password_reset_body",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{user_name}}", description: "User's name" },
      { field: "{{reset_url}}", description: "Password reset link" },
      { field: "{{expires_in}}", description: "Link expiration time" },
      { field: "{{company_name}}", description: "Your company name" },
    ],
    defaultSubject: "Reset Your Password - {{company_name}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: flex-end; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 53px; height: auto; flex-shrink: 0;" />
    <h2 style="margin: 0; color: #1e3a8a;">Password Reset Request</h2>
  </div>
  <p>Hello {{user_name}},</p>
  <p>We received a request to reset your password. Click the button below to create a new password.</p>
  <p style="margin: 30px 0;"><a href="{{reset_url}}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
  <p style="font-size: 14px; color: #6b7280;">This link will expire in {{expires_in}}. If you didn't request this, you can safely ignore this email.</p>
</div>`,
  },
  {
    id: "license_expiration",
    label: "License Expiration",
    icon: <AlertTriangle className="h-4 w-4" />,
    subjectKey: "email_license_expiration_subject",
    bodyKey: "email_license_expiration_body",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{user_name}}", description: "Admin's name" },
      { field: "{{company_name}}", description: "Company name" },
      { field: "{{expiration_date}}", description: "License expiration date" },
      { field: "{{days_count}}", description: "Days until/since expiration" },
      { field: "{{days_label}}", description: "'until expiration' or 'since expiration'" },
      { field: "{{urgency_level}}", description: "URGENT, Important, or Notice" },
      { field: "{{expiration_status}}", description: "Expiring Soon or EXPIRED" },
      { field: "{{header_color}}", description: "Dynamic header color" },
      { field: "{{is_expired}}", description: "Boolean for conditional content" },
    ],
    defaultSubject: "{{urgency_level}}: Sales Tax License {{expiration_status}} for {{company_name}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="display: flex; align-items: flex-end; padding: 20px 0; gap: 16px;">
    <img src="{{company_logo}}" alt="{{company_name}}" style="width: 53px; height: auto; flex-shrink: 0;" />
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
</div>`,
  },
  {
    id: "order_confirmation",
    label: "Order Confirmation",
    icon: <Receipt className="h-4 w-4" />,
    subjectKey: "email_order_confirmation_subject",
    bodyKey: "email_order_confirmation_body",
    mergeFields: [
      { field: "{{company_logo}}", description: "Company logo image URL" },
      { field: "{{customer_name}}", description: "Customer's name" },
      { field: "{{order_number}}", description: "Order number" },
      { field: "{{order_date}}", description: "Date order was placed" },
      { field: "{{items_table}}", description: "Auto-generated HTML table of line items" },
      { field: "{{subtotal}}", description: "Subtotal before tax" },
      { field: "{{tax_amount}}", description: "Tax amount" },
      { field: "{{shipping_cost}}", description: "Shipping cost" },
      { field: "{{total}}", description: "Order total" },
      { field: "{{shipping_address}}", description: "Ship-to address" },
      { field: "{{payment_method}}", description: "Payment method used" },
      { field: "{{notes}}", description: "Order notes" },
      { field: "{{company_name}}", description: "Your company name" },
    ],
    defaultSubject: "Order Confirmation - #{{order_number}} - {{company_name}}",
    defaultBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">Order Date: {{order_date}}</p>
  <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">Customer: <strong style="color: #0f172a;">{{customer_name}}</strong></p>
  
  {{items_table}}
  
  <table class="totals-table" style="width: 100%; max-width: 280px; margin-left: auto; margin-top: 8px;">
    <tr><td style="padding: 6px 0; color: #6b7280;">Subtotal</td><td style="padding: 6px 0; text-align: right; font-weight: 500;">{{subtotal}}</td></tr>
    {{#if tax_amount}}<tr><td style="padding: 6px 0; color: #6b7280;">Tax</td><td style="padding: 6px 0; text-align: right;">{{tax_amount}}</td></tr>{{/if}}
    {{#if shipping_cost}}<tr><td style="padding: 6px 0; color: #6b7280;">Shipping</td><td style="padding: 6px 0; text-align: right;">{{shipping_cost}}</td></tr>{{/if}}
    <tr style="border-top: 2px solid #e5e7eb;"><td style="padding: 10px 0; font-weight: 700; font-size: 16px;">Total</td><td style="padding: 10px 0; text-align: right; font-weight: 700; font-size: 16px;">{{total}}</td></tr>
  </table>

  {{#if shipping_address}}
  <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px;">
    <p style="margin: 0 0 8px 0; font-weight: 600; color: #374151;">Ship To</p>
    <p style="margin: 0; color: #4b5563; line-height: 1.6;">{{shipping_address}}</p>
  </div>
  {{/if}}

  {{#if payment_method}}
  <div style="margin-top: 12px; padding: 12px 16px; background: #f8fafc; border-radius: 8px;">
    <p style="margin: 0; color: #374151;"><strong>Payment:</strong> {{payment_method}}</p>
  </div>
  {{/if}}

  {{#if notes}}
  <div style="margin-top: 12px; padding: 12px 16px; background: #fffbeb; border-radius: 8px; border-left: 3px solid #f59e0b;">
    <p style="margin: 0; color: #92400e; font-size: 13px;"><strong>Notes:</strong> {{notes}}</p>
  </div>
  {{/if}}

  <p style="margin: 24px 0 0 0; text-align: center; color: #6b7280; font-size: 14px;">Thank you for your order!</p>
</div>`,
  },
];

function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  // Handle conditional blocks (simple implementation for preview)
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
    const varValue = variables[varName];
    return varValue && varValue !== 'false' ? content : '';
  });
  result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, varName, content) => {
    const varValue = variables[varName];
    return !varValue || varValue === 'false' ? content : '';
  });
  // Remove any remaining template variables
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

export function EmailTemplateManager() {
  const [activeTab, setActiveTab] = useState("purchase_order");
  const [editedTemplates, setEditedTemplates] = useState<Record<string, { subject: string; body: string }>>({});
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [editorMode, setEditorMode] = useState<"code" | "visual">("code");

  const updateSetting = useUpdateSystemSetting();

  // Fetch all template settings
  const templateSettings: Record<string, { subject: ReturnType<typeof useSystemSetting>; body: ReturnType<typeof useSystemSetting> }> = {};
  templateConfigs.forEach((config) => {
    templateSettings[config.id] = {
      subject: useSystemSetting(config.subjectKey),
      body: useSystemSetting(config.bodyKey),
    };
  });

  // Initialize edited templates from fetched data
  useEffect(() => {
    const newEdited: Record<string, { subject: string; body: string }> = {};
    templateConfigs.forEach((config) => {
      const subjectData = templateSettings[config.id]?.subject.data;
      const bodyData = templateSettings[config.id]?.body.data;
      newEdited[config.id] = {
        subject: subjectData?.setting_value || config.defaultSubject,
        body: bodyData?.setting_value || config.defaultBody,
      };
    });
    setEditedTemplates(newEdited);
  }, [
    templateSettings.purchase_order?.subject.data,
    templateSettings.purchase_order?.body.data,
    templateSettings.payment_request?.subject.data,
    templateSettings.payment_request?.body.data,
    templateSettings.payment_confirmation?.subject.data,
    templateSettings.payment_confirmation?.body.data,
    templateSettings.status_update?.subject.data,
    templateSettings.status_update?.body.data,
    templateSettings.user_invitation?.subject.data,
    templateSettings.user_invitation?.body.data,
    templateSettings.password_reset?.subject.data,
    templateSettings.password_reset?.body.data,
    templateSettings.license_expiration?.subject.data,
    templateSettings.license_expiration?.body.data,
    templateSettings.order_confirmation?.subject.data,
    templateSettings.order_confirmation?.body.data,
  ]);

  const handleSave = async (templateId: string) => {
    const config = templateConfigs.find((c) => c.id === templateId);
    if (!config) return;

    const edited = editedTemplates[templateId];
    if (!edited) return;

    setSavingTemplate(templateId);
    try {
      await updateSetting.mutateAsync({
        settingKey: config.subjectKey,
        settingValue: edited.subject,
        description: `Subject line for ${config.label} emails`,
      });
      await updateSetting.mutateAsync({
        settingKey: config.bodyKey,
        settingValue: edited.body,
        description: `HTML body for ${config.label} emails`,
      });
      showToast.success(`${config.label} template saved`);
    } catch (error) {
      showToast.error(`Failed to save ${config.label} template`);
    } finally {
      setSavingTemplate(null);
    }
  };

  const handleReset = (templateId: string) => {
    const config = templateConfigs.find((c) => c.id === templateId);
    if (!config) return;

    setEditedTemplates((prev) => ({
      ...prev,
      [templateId]: {
        subject: config.defaultSubject,
        body: config.defaultBody,
      },
    }));
  };

  const updateTemplate = (templateId: string, field: "subject" | "body", value: string) => {
    setEditedTemplates((prev) => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        [field]: value,
      },
    }));
  };

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient) {
      showToast.error("Please enter a recipient email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmailRecipient)) {
      showToast.error("Please enter a valid email address");
      return;
    }

    const edited = editedTemplates[activeTab];
    if (!edited) return;

    setSendingTestEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: {
          template_id: activeTab,
          subject: edited.subject,
          body: edited.body,
          recipient_email: testEmailRecipient,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      showToast.success(`Test email sent to ${testEmailRecipient}`);
      setTestEmailDialogOpen(false);
    } catch (error: any) {
      console.error("Failed to send test email:", error);
      showToast.error(error.message || "Failed to send test email");
    } finally {
      setSendingTestEmail(false);
    }
  };

  const activeConfig = templateConfigs.find((c) => c.id === activeTab);
  const activeSampleData = sampleDataMap[activeTab] || {};
  const activeEdited = editedTemplates[activeTab] || { subject: "", body: "" };

  // Prepare merge fields for visual editor
  const visualEditorMergeFields = activeConfig?.mergeFields.map((f) => ({
    name: f.description,
    value: f.field,
    sample: activeSampleData[f.field.replace(/\{\{|\}\}/g, '')] || f.field,
  })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Templates
        </CardTitle>
        <CardDescription>
          Customize the email templates sent to customers, vendors, and users. Use merge fields to personalize each email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
            {templateConfigs.map((config) => (
              <TabsTrigger key={config.id} value={config.id} className="flex items-center gap-1.5">
                {config.icon}
                <span className="hidden sm:inline">{config.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {templateConfigs.map((config) => (
            <TabsContent key={config.id} value={config.id} className="space-y-4">
              {/* Editor Mode Toggle */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <span className="text-sm font-medium text-muted-foreground">Editor Mode:</span>
                <div className="flex gap-1">
                  <Button
                    variant={editorMode === "code" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditorMode("code")}
                  >
                    <Code className="h-4 w-4 mr-1" />
                    Code
                  </Button>
                  <Button
                    variant={editorMode === "visual" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditorMode("visual")}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Visual
                  </Button>
                </div>
              </div>

              {editorMode === "visual" ? (
                /* Visual Editor Mode */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${config.id}-subject-visual`}>Subject Line</Label>
                    <Input
                      id={`${config.id}-subject-visual`}
                      value={editedTemplates[config.id]?.subject || ""}
                      onChange={(e) => updateTemplate(config.id, "subject", e.target.value)}
                      placeholder="Email subject..."
                    />
                  </div>

                  <VisualEmailEditor
                    initialHtml={editedTemplates[config.id]?.body || ""}
                    mergeFields={visualEditorMergeFields}
                    onExportHtml={(html) => updateTemplate(config.id, "body", html)}
                    onSave={() => handleSave(config.id)}
                    onReset={() => handleReset(config.id)}
                    isSaving={savingTemplate === config.id}
                    templateId={config.id}
                  />
                </div>
              ) : (
                /* Code Editor Mode */
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  {/* Editor Panel */}
                  <div className="xl:col-span-2 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${config.id}-subject`}>Subject Line</Label>
                      <Input
                        id={`${config.id}-subject`}
                        value={editedTemplates[config.id]?.subject || ""}
                        onChange={(e) => updateTemplate(config.id, "subject", e.target.value)}
                        placeholder="Email subject..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`${config.id}-body`}>Email Body (HTML)</Label>
                      <Textarea
                        id={`${config.id}-body`}
                        value={editedTemplates[config.id]?.body || ""}
                        onChange={(e) => updateTemplate(config.id, "body", e.target.value)}
                        placeholder="Email HTML content..."
                        className="min-h-[300px] font-mono text-sm"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => handleSave(config.id)}
                        disabled={savingTemplate === config.id}
                      >
                        {savingTemplate === config.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Template
                      </Button>
                      <Button variant="outline" onClick={() => handleReset(config.id)}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset to Default
                      </Button>
                      <Dialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary">
                            <Send className="h-4 w-4 mr-2" />
                            Send Test Email
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Send Test Email</DialogTitle>
                            <DialogDescription>
                              Send a test email with sample data to verify your template looks correct.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <Label htmlFor="test-email-recipient">Recipient Email</Label>
                              <Input
                                id="test-email-recipient"
                                type="email"
                                value={testEmailRecipient}
                                onChange={(e) => setTestEmailRecipient(e.target.value)}
                                placeholder="your@email.com"
                              />
                              <p className="text-xs text-muted-foreground">
                                The email will be sent with sample data filled in and marked as a test.
                              </p>
                            </div>
                            <Button 
                              onClick={handleSendTestEmail} 
                              disabled={sendingTestEmail}
                              className="w-full"
                            >
                              {sendingTestEmail ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 mr-2" />
                              )}
                              Send Test Email
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Merge Fields Panel */}
                  <div className="space-y-2">
                    <Label>Available Merge Fields</Label>
                    <Card className="bg-muted/50">
                      <ScrollArea className="h-[350px]">
                        <div className="p-3 space-y-2">
                          {config.mergeFields.map((field) => (
                            <div key={field.field} className="space-y-1">
                              <Badge variant="secondary" className="font-mono text-xs cursor-pointer hover:bg-secondary/80" onClick={() => navigator.clipboard.writeText(field.field)}>
                                {field.field}
                              </Badge>
                              <p className="text-xs text-muted-foreground">{field.description}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </Card>
                    <p className="text-xs text-muted-foreground">
                      Click a merge field to copy it to your clipboard.
                    </p>
                  </div>

                  {/* Preview Panel */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Live Preview
                    </Label>
                    <Card className="bg-white overflow-hidden">
                      <CardHeader className="py-2 px-3 border-b bg-muted/30">
                        <p className="text-sm font-medium truncate text-foreground">
                          {replaceTemplateVariables(activeEdited.subject, activeSampleData) || "Subject Preview"}
                        </p>
                      </CardHeader>
                      <div className="h-[310px] overflow-auto">
                        <iframe
                          srcDoc={(() => {
                            const replacedBody = replaceTemplateVariables(activeEdited.body, activeSampleData);
                            const replacedSubject = replaceTemplateVariables(activeEdited.subject, activeSampleData);
                            if (activeTab === "order_confirmation") {
                              const logoUrl = activeSampleData.company_logo || DEFAULT_LOGO_URL;
                              const companyName = activeSampleData.company_name || "WashGear";
                              const title = replacedSubject || `Order Confirmation — #${activeSampleData.order_number || ""}`;
                              return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f8;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f7f8;">
    <tr>
      <td align="center" style="padding: 24px;" class="email-container">
        <table width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.08);">
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #e6f3fb, #ffffff);">
                <tr>
                  <td style="padding: 32px 24px 24px 32px;">
                    <img src="${logoUrl}" alt="${companyName}" width="35" height="35" style="vertical-align: middle;" />
                    <span style="font-size: 22px; font-weight: 700; color: #0f172a; vertical-align: middle; padding-left: 12px;">${title}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-body" style="padding: 24px; color: #0f172a;">
              ${replacedBody}
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
</html>`;
                            }
                            return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 12px; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f2937; }
    a { color: #1e3a8a; }
    table { font-size: 13px; }
  </style>
</head>
<body>${replacedBody}</body>
</html>`;
                          })()}
                          sandbox="allow-same-origin"
                          className="w-full h-full border-0"
                          title="Email Preview"
                        />
                      </div>
                    </Card>
                    <p className="text-xs text-muted-foreground">
                      Preview shows template with sample data.
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
