import { createClient } from 'npm:@supabase/supabase-js@2';
export async function requireNotificationStaff(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in required');
  const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw new Error('Invalid session');
  const [{ data: profile }, { data: roles }] = await Promise.all([client.from('profiles').select('is_active').eq('id', user.id).single(), client.from('user_roles').select('role').eq('user_id', user.id)]);
  if (!profile?.is_active || !roles?.some(r => ['admin', 'sales_support', 'production', 'accounting', 'marketing', 'tech_support'].includes(r.role))) throw new Error('Staff access required');
}