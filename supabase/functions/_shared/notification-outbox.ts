import { createClient } from 'npm:@supabase/supabase-js@2';

// Trusted feature functions only; browser callers cannot choose recipients here.
export async function queueContactNotification(contact: string, channel: 'email' | 'text', subject: string, message: string, kind = 'account', eventKey?: string) {
  const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const normalized = channel === 'email' ? contact.trim().toLowerCase() : contact.replace(/[^+0-9]/g, '');
  const { data: profiles, error } = await client.from('profiles').select('id,email,phone').eq(channel === 'email' ? 'email' : 'phone', contact);
  if (error) throw error;
  // Normalize a second lookup for email; phone matching is handled by the RPC below.
  const { data: ids, error: matchError } = await client.rpc('notification_match_contact', { p_channel: channel, p_contact: normalized });
  if (matchError) throw matchError;
  const matches = ids || profiles || [];
  for (const profile of matches) {
    const text = channel === 'text' ? message : message.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 1600);
    const { error: enqueueError } = await client.rpc('enqueue_notification', { p_user: profile.id, p_kind: kind, p_subject: subject, p_html: channel === 'email' ? message : `<table role="presentation"><tr><td>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr></table>`, p_sms: text, p_key: eventKey ? `${eventKey}:${profile.id}` : null });
    if (enqueueError) throw enqueueError;
  }
  return { matched: matches.length > 0, success: true, queued: true };
}