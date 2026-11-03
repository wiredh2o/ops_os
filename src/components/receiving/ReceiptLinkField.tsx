import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';

const db = supabase as any;

export interface ReceiptLink { purchaseOrderId: string | null; transactionId: string | null }
export const EMPTY_RECEIPT_LINK: ReceiptLink = { purchaseOrderId: null, transactionId: null };

interface Option { id: string; label: string }

/**
 * Optional link from a manual receipt to an existing PO or a credit-card transaction.
 * With packageId the link saves straight away; without it the parent saves it with the new receipt.
 */
export function ReceiptLinkField({ value, onChange, packageId }: {
  value: ReceiptLink; onChange: (v: ReceiptLink) => void; packageId?: string;
}) {
  const { toast } = useToast();
  const kind = value.purchaseOrderId ? 'po' : value.transactionId ? 'card' : 'none';
  const [mode, setMode] = useState<'none' | 'po' | 'card'>(kind);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [current, setCurrent] = useState<string>('');

  useEffect(() => { setMode(kind); }, [kind]);

  // Label for the currently linked record
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (value.purchaseOrderId) {
        const { data } = await db.from('purchase_orders').select('purchase_order_number, supplier:suppliers(name)').eq('id', value.purchaseOrderId).maybeSingle();
        if (!cancelled) setCurrent(data ? `PO ${data.purchase_order_number}${data.supplier?.name ? ` · ${data.supplier.name}` : ''}` : 'Linked PO');
      } else if (value.transactionId) {
        const { data } = await db.from('transactions').select('transaction_date, description, total_amount').eq('id', value.transactionId).maybeSingle();
        if (!cancelled) setCurrent(data ? `${data.transaction_date} · ${data.description || 'Card charge'} · ${formatCurrency(Number(data.total_amount))}` : 'Linked card transaction');
      } else if (!cancelled) setCurrent('');
    })();
    return () => { cancelled = true; };
  }, [value.purchaseOrderId, value.transactionId]);

  // Search options
  useEffect(() => {
    if (mode === 'none') { setOptions([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      if (mode === 'po') {
        let q = db.from('purchase_orders').select('id, purchase_order_number, status, supplier:suppliers(name)').not('status', 'in', '(draft,cancelled)').order('created_at', { ascending: false }).limit(50);
        if (search.trim()) q = q.ilike('purchase_order_number', `%${search.trim()}%`);
        const { data } = await q;
        if (!cancelled) setOptions((data || []).map((p: any) => ({ id: p.id, label: `PO ${p.purchase_order_number}${p.supplier?.name ? ` · ${p.supplier.name}` : ''} (${p.status})` })));
      } else {
        const { data } = await db.rpc('search_card_transactions', { p_search: search.trim() || null });
        if (!cancelled) setOptions((data || []).map((t: any) => ({ id: t.id, label: `${t.transaction_date} · ${t.description || t.reference_number || 'Card charge'} · ${formatCurrency(Number(t.total_amount))} · ${t.account_name}` })));
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode, search]);

  const apply = async (next: ReceiptLink) => {
    if (packageId) {
      const { error } = await db.from('inbound_packages')
        .update({ linked_purchase_order_id: next.purchaseOrderId, linked_transaction_id: next.transactionId })
        .eq('id', packageId);
      if (error) { toast({ title: 'Link not saved', description: error.message, variant: 'destructive' }); return; }
      toast({ title: next.purchaseOrderId || next.transactionId ? 'Receipt linked' : 'Link removed' });
      window.dispatchEvent(new CustomEvent('package-updated', { detail: { packageId } }));
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label>Link to (optional)</Label>
      {current && (
        <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
          <span className="truncate">{current}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => apply(EMPTY_RECEIPT_LINK)}>Remove</Button>
        </div>
      )}
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <Select value={mode} onValueChange={v => { setMode(v as any); setSearch(''); }}>
          <SelectTrigger aria-label="Link type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nothing</SelectItem>
            <SelectItem value="po">Purchase order</SelectItem>
            <SelectItem value="card">Card transaction</SelectItem>
          </SelectContent>
        </Select>
        {mode !== 'none' && (
          <Input placeholder={mode === 'po' ? 'Search PO number' : 'Search description, reference or amount'} value={search} onChange={e => setSearch(e.target.value)} />
        )}
      </div>
      {mode !== 'none' && (
        <Select value="" onValueChange={id => apply(mode === 'po' ? { purchaseOrderId: id, transactionId: null } : { purchaseOrderId: null, transactionId: id })}>
          <SelectTrigger aria-label="Pick record to link"><SelectValue placeholder={options.length ? 'Pick one to link' : 'No matches'} /></SelectTrigger>
          <SelectContent>{options.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}
