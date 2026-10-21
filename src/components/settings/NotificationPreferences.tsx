import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock } from 'lucide-react';
import type { NotificationMethod } from '@/lib/notification-rules';

export function NotificationPreferences({ targetId, allowLock = false }: { targetId?: string; allowLock?: boolean }) {
  const { user } = useAuth();
  const id = targetId || user?.id;
  const { toast } = useToast();
  const [value, setValue] = useState({ account: true, marketing: false, method: 'email' as NotificationMethod, locked: false });
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!id) return;
    setLoading(true);
    supabase.from('profiles').select('account_notifications,offers_marketing,notification_method,notification_preferences_locked,phone,email').eq('id', id).single().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      if (data) {
        setValue({ account: data.account_notifications, marketing: data.offers_marketing, method: data.notification_method as NotificationMethod, locked: data.notification_preferences_locked });
        setPhone(data.phone || ''); setEmail(data.email);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [id]);
  const disabled = loading || saving || Boolean(error) || (value.locked && !allowLock);
  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('save_notification_preferences', { p_target: id, p_account: value.account, p_marketing: value.marketing, p_method: value.method, ...(allowLock ? { p_locked: value.locked } : {}) });
      if (error) throw error;
      toast({ title: 'Notification preferences saved' });
    } catch (error) { toast({ title: 'Unable to save preferences', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const saveContact = async () => {
    if (!id || id !== user?.id) return;
    if (phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone)) { toast({ title: 'Enter a valid phone number', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('save_notification_phone', { p_phone: phone });
      if (error) throw error;
      toast({ title: 'Phone updated' });
    } catch (error) { toast({ title: 'Unable to update contact', description: error instanceof Error ? error.message : 'Please try again', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  return <section className="space-y-4 py-4">
    <h3 className="font-semibold">Notification preferences</h3>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {loading && <p className="text-muted-foreground">Loading preferences…</p>}
    {value.locked && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> Preferences locked by your company administrator</p>}
    <div className="flex items-center justify-between gap-4"><Label htmlFor={`account-${id}`}>Account notifications</Label><Switch id={`account-${id}`} checked={value.account} disabled={disabled} onCheckedChange={account => setValue(v => ({ ...v, account }))} /></div>
    <div className="flex items-center justify-between gap-4"><Label htmlFor={`offers-${id}`}>Offers / marketing</Label><Switch id={`offers-${id}`} checked={value.marketing} disabled={disabled} onCheckedChange={marketing => setValue(v => ({ ...v, marketing }))} /></div>
    <Label htmlFor={`method-${id}`}>Preferred method</Label>
    <Select value={value.method} disabled={disabled} onValueChange={method => setValue(v => ({ ...v, method: method as NotificationMethod }))}><SelectTrigger id={`method-${id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="text">Text</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select>
    {allowLock && <div className="flex items-center justify-between gap-4"><Label htmlFor={`lock-${id}`}>Lock employee preferences</Label><Switch id={`lock-${id}`} checked={value.locked} disabled={loading || saving} onCheckedChange={locked => setValue(v => ({ ...v, locked }))} /></div>}
    <Button disabled={disabled} onClick={save}>{saving ? 'Saving…' : 'Save preferences'}</Button>
    {!targetId && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Contact information</h3><p className="text-sm text-muted-foreground">{email}</p><Label htmlFor="notification-phone">Phone</Label><Input id="notification-phone" type="tel" value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} /><Button disabled={saving || loading} variant="outline" onClick={saveContact}>Update phone</Button><Button variant="outline" onClick={async () => { const next = window.prompt('New email address'); if (!next) return; const { error } = await supabase.auth.updateUser({ email: next }); toast({ title: error ? 'Unable to update email' : 'Check your email to confirm the change', description: error?.message, variant: error ? 'destructive' : 'default' }); }}>Change email</Button></div>}
  </section>;
}