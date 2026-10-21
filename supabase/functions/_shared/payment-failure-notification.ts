import { createClient } from 'npm:@supabase/supabase-js@2';
import { queueContactNotification } from './notification-outbox.ts';
export async function queuePaymentFailure({ orderId, customerId, email, eventKey }: { orderId?: string; customerId?: string; email?: string; eventKey: string }) {
  const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  let companyId: string | undefined;
  if (orderId) {
    const { data: order, error } = await client.from('production_orders').select('customer_email,customer_id,customer_company_id').eq('id', orderId).maybeSingle();
    if (error) throw error;
    email ||= order?.customer_email; companyId = order?.customer_company_id || order?.customer_id;
  }
  let phone: string | undefined;
  if (!email && (companyId || customerId)) {
    let query = client.from('companies').select('email,phone');
    query = companyId ? query.eq('id', companyId) : query.eq('stripe_customer_id', customerId);
    const { data: company, error } = await query.maybeSingle();
    if (error) throw error;
    email = company?.email; phone = company?.phone;
  }
  const message = 'Your payment failed. Please update your payment method or contact us.';
  if (email) return queueContactNotification(email, 'email', 'Failed payment', `<table role="presentation"><tr><td>${message}</td></tr></table>`, 'failed_payment', eventKey);
  if (phone) return queueContactNotification(phone, 'text', 'Failed payment', message, 'failed_payment', eventKey);
  throw new Error('Failed payment recipient is unavailable');
}