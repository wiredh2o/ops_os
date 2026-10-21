import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { deliverResendEmail } from '../_shared/resend-email.ts';
import { notificationAllowed, notificationMethods, type NotificationMethod } from '../_shared/notification-rules.ts';
const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const DAY = 86400000;
const response = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return response(200, {});
  if (req.method !== 'POST') return response(405, { error: 'POST required' });
  // Public wake signal: no payload, recipient, notification id or early retry accepted.
  // All work is selected by a service-only, deadline-checked lease RPC.
  try {
    const { data: jobs, error } = await client.rpc('notification_claim');
    if (error) throw error;
    for (const job of jobs || []) {
      try {
        const { data: p, error: profileError } = await client.from('profiles').select('email,phone,notification_method,account_notifications,offers_marketing').eq('id', job.user_id).single();
        if (profileError || !p) throw profileError || new Error('Recipient unavailable');
        if (!notificationAllowed(job.kind, p.account_notifications, p.offers_marketing)) {
          await client.from('notification_outbox').update({ status: 'skipped', lease_until: null, next_attempt_at: null }).eq('id', job.id); continue;
        }
        const channels = notificationMethods(p.notification_method as NotificationMethod);
        let success = false, completed = 0, attempted = false, missing = false, blocked = false, lastError = '';
        for (const channel of channels) {
          const contact = channel === 'email' ? (p.email || '').trim().toLowerCase() : (p.phone || '').replace(/[^+0-9]/g, '');
          if (!contact) { blocked = true; lastError = `${channel} contact is missing`; continue; }
          const { data: previous } = await client.from('notification_deliveries').select('status').eq('notification_id', job.id).eq('channel', channel).eq('contact', contact).maybeSingle();
          if (previous?.status === 'sent') { success = true; completed++; continue; }
          const configured = channel === 'email' ? Boolean(Deno.env.get('RESEND_API_KEY')) : Boolean(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && Deno.env.get('TWILIO_PHONE_NUMBER'));
          if (!configured) { missing = true; lastError = 'Delivery credentials are not configured'; continue; }
          const { data: claimed, error: claimError } = await client.rpc('notification_contact_claim', { p_channel: channel, p_contact: contact });
          if (claimError) throw claimError;
          if (!claimed) {
            const { data: c } = await client.from('notification_contacts').select('failures').eq('channel', channel).eq('contact', contact).single();
            blocked = (c?.failures || 0) >= 5; lastError = blocked ? 'Contact blocked after five failures; update contact before retrying' : 'Contact is being processed'; continue;
          }
          attempted = true;
          let result: { success: boolean; id?: string; error?: string };
          try {
            if (channel === 'email') result = await deliverResendEmail({ to: contact, subject: job.subject, html: job.html });
            else {
              const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
              const token = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
              const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ From: Deno.env.get('TWILIO_PHONE_NUMBER') || '', To: contact, Body: job.sms }), signal: AbortSignal.timeout(30000) });
              const data = await res.json();
              result = { success: res.ok, id: data.sid, error: res.ok ? undefined : `Text delivery failed (${res.status})` };
            }
          } catch { result = { success: false, error: 'Delivery request failed' }; }
          const { error: resultError } = await client.rpc('notification_contact_result', { p_channel: channel, p_contact: contact, p_success: result.success });
          if (resultError) throw resultError;
          const { data: delivery } = await client.from('notification_deliveries').select('attempts').eq('notification_id', job.id).eq('channel', channel).eq('contact', contact).maybeSingle();
          const { error: deliveryError } = await client.from('notification_deliveries').upsert({ notification_id: job.id, channel, contact, status: result.success ? 'sent' : 'failed', attempts: (delivery?.attempts || 0) + 1, last_error: result.error || null, provider_id: result.id || null }, { onConflict: 'notification_id,channel,contact' });
          if (deliveryError) throw deliveryError;
          success ||= result.success; if (result.success) completed++; lastError = result.error || lastError;
        }
        const tries = job.automatic_tries + (attempted && !job.manual_retry ? 1 : 0);
        const complete = completed === channels.length;
        const status = complete ? 'sent' : success ? 'partial' : missing ? 'awaiting_credentials' : blocked ? 'blocked' : 'failed';
        const { error: updateError } = await client.from('notification_outbox').update({ status, automatic_tries: tries, manual_retry: false, last_error: success ? null : lastError, lease_until: null, next_attempt_at: complete || blocked || tries >= 3 ? null : new Date(Date.now() + DAY).toISOString() }).eq('id', job.id);
        if (updateError) throw updateError;
      } catch {
        await client.from('notification_outbox').update({ lease_until: null, next_attempt_at: new Date(Date.now() + DAY).toISOString(), last_error: 'Notification processing failed' }).eq('id', job.id);
      }
    }
    await client.rpc('notification_schedule_next');
    return response(200, { processed: true });
  } catch { return response(500, { error: 'Notification processor unavailable' }); }
});