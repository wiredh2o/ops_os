import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, RotateCcw } from 'lucide-react';

export function NotificationFailureList() {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const query = useQuery({ queryKey: ['notification-failures'], queryFn: async () => {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await supabase.from('notification_outbox').select('id,subject,status,last_error,created_at,automatic_tries,recipient_email,recipient_phone,profiles(email,first_name,last_name,phone),notification_deliveries(channel,status,last_error,contact)').in('status', ['failed', 'blocked', 'awaiting_credentials']).order('created_at', { ascending: false }).range(start, start + 499);
      if (error) throw error;
      rows.push(...data); if (data.length < 500) break;
    }
    return rows;
  } });
  return <section className="space-y-4 py-4"><div className="flex items-center justify-between gap-4"><h3 className="text-lg font-semibold">Notification failures</h3><Button variant="outline" size="icon" aria-label="Refresh notification failures" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /></Button></div>
    <Input aria-label="Search notification failures" placeholder="Search recipient or message" value={search} onChange={e => setSearch(e.target.value)} />
    {query.isPending && <p>Loading notifications…</p>}{query.error && <p role="alert" className="text-destructive">Unable to load failures: {query.error.message}</p>}
    {query.data?.length === 0 && <p className="text-muted-foreground">No notification failures.</p>}
    {query.data?.filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())).map(row => <article key={row.id} className="border-b py-4 space-y-2"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">{row.subject}</h4><Badge variant="secondary">{row.status === 'awaiting_credentials' ? 'Awaiting delivery setup' : row.status}</Badge></div><p className="text-sm">{row.profiles ? <>{row.profiles.first_name} {row.profiles.last_name} · {row.profiles.email}</> : <>Drop-ship recipient · {[row.recipient_email, row.recipient_phone].filter(Boolean).join(' · ')}</>}</p><p className="text-sm text-muted-foreground">{row.last_error} · {row.automatic_tries} automatic attempts</p>{row.notification_deliveries.map(delivery => <p key={`${delivery.channel}-${delivery.contact}`} className="text-sm">{delivery.channel}: {delivery.status} {delivery.last_error}</p>)}<Button variant="outline" disabled={busy === row.id} onClick={async () => { setBusy(row.id); const { error } = await supabase.rpc('retry_notification', { p_id: row.id }); toast({ title: error ? 'Cannot retry notification' : 'Retry queued', description: error?.message, variant: error ? 'destructive' : 'default' }); await query.refetch(); setBusy(null); }}><RotateCcw className="h-4 w-4 mr-2" />Retry</Button></article>)}
  </section>;
}