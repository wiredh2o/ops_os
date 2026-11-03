import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { formatCurrency } from '@/lib/utils';
import {
  BILL_STATUS_LABEL, billBalance, billStatus, billTotal, canManageVendorBills, canRecordReceipts,
  maxPayment, openQuantity, overShippedQuantity, receiptSubtotal,
} from '@/lib/vendor-bill-rules';

import { PayWithCheckDialog, printIssuedCheck } from '@/components/accounting/AccountingDashboard';

const db = supabase as any;
const today = () => new Date().toISOString().split('T')[0];

interface POItem {
  id: string; item_type: string; inventory_item_id: string | null; assembly_id: string | null;
  quantity: number; quantity_received: number | null; unit_cost: number;
  inventory_item?: { sku: string } | null; assembly?: { sku: string } | null;
}
interface ReceiptLine {
  id: string; inventory_item_id: string | null; assembly_id: string | null; quantity_received: number;
  quantity_ordered: number; quantity_previously_received: number; quantity_short_closed: number;
  variance: 'exact' | 'over' | 'under'; unit_cost: number;
}
interface Receipt {
  id: string; received_at: string; notes: string | null; is_billed: boolean; bill_number: string | null;
  bill_date: string | null; due_date: string | null; bill_subtotal: number | null; bill_tax: number | null;
  bill_shipping: number | null; bill_total: number | null; bill_amount_paid: number; created_at: string;
  po_receipt_lines: ReceiptLine[];
}
interface Payment {
  id: string; receipt_id: string | null; amount: number; paid_at: string; method: string;
  reference: string | null; is_advance: boolean; account?: { name: string } | null;
}

interface Props {
  purchaseOrderId: string;
  poStatus: string;
  poTotal: number;
  onChanged?: () => void;
}

const itemKey = (i: { inventory_item_id: string | null; assembly_id: string | null }) => i.inventory_item_id || i.assembly_id || '';

export function POReceiptsBillsPanel({ purchaseOrderId, poStatus, poTotal, onChanged }: Props) {
  const { roles } = useAuth();
  const { toast } = useToast();
  const manage = canManageVendorBills(roles);
  const canReceive = canRecordReceipts(roles) && !['draft', 'cancelled'].includes(poStatus);

  const [items, setItems] = useState<POItem[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; account_subtype: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [checkFor, setCheckFor] = useState<{ receiptId?: string } | null>(null);

  // New receipt
  const [qty, setQty] = useState<Record<string, string>>({});
  const [shortClose, setShortClose] = useState<Record<string, boolean>>({});
  const [receivedAt, setReceivedAt] = useState(today());
  const [receiptNotes, setReceiptNotes] = useState('');

  // Bill dialog
  const [billFor, setBillFor] = useState<Receipt | null>(null);
  const [bill, setBill] = useState({ number: '', date: today(), due: '', subtotal: '', tax: '0', shipping: '0' });

  // Payment form
  const [pay, setPay] = useState({ amount: '', date: today(), method: 'check', account: '', reference: '', target: 'auto' });

  const load = useCallback(async () => {
    const [it, rc, pm, ac] = await Promise.all([
      db.from('purchase_order_items').select('id, item_type, inventory_item_id, assembly_id, quantity, quantity_received, unit_cost, inventory_item:inventory_items(sku), assembly:assemblies(sku)').eq('purchase_order_id', purchaseOrderId).order('created_at'),
      db.from('po_receipts').select('*, po_receipt_lines(*)').eq('purchase_order_id', purchaseOrderId).order('received_at').order('created_at'),
      manage ? db.from('vendor_payments').select('*, account:accounts(name)').eq('purchase_order_id', purchaseOrderId).order('paid_at').order('created_at') : Promise.resolve({ data: [] }),
      manage ? db.from('accounts').select('id, name, account_subtype').in('account_subtype', ['checking', 'credit_card']).eq('is_active', true).order('name') : Promise.resolve({ data: [] }),
    ]);
    if (it.error || rc.error) {
      toast({ title: 'Could not load receipts', description: (it.error || rc.error).message, variant: 'destructive' });
    }
    setItems(it.data || []);
    setReceipts(rc.data || []);
    setPayments(pm.data || []);
    setAccounts(ac.data || []);
  }, [purchaseOrderId, manage, toast]);

  useEffect(() => { load(); }, [load]);

  const shortByItem = useMemo(() => {
    const m: Record<string, number> = {};
    receipts.forEach(r => r.po_receipt_lines.forEach(l => { m[itemKey(l)] = (m[itemKey(l)] || 0) + (l.quantity_short_closed || 0); }));
    return m;
  }, [receipts]);

  const sku = (k: string) => {
    const i = items.find(x => itemKey(x) === k);
    return i?.inventory_item?.sku || i?.assembly?.sku || 'Item';
  };

  const fail = (title: string, e: any) => toast({ title, description: e?.message || String(e), variant: 'destructive' });
  const done = async (title: string) => { toast({ title }); await load(); onChanged?.(); };

  const submitReceipt = async () => {
    const lines = items.map(i => ({
      item_type: i.item_type, inventory_item_id: i.inventory_item_id, assembly_id: i.assembly_id,
      quantity: parseInt(qty[i.id] || '0', 10) || 0, short_close: !!shortClose[i.id],
    })).filter(l => l.quantity > 0 || l.short_close);
    if (lines.length === 0) return toast({ title: 'Enter at least one received quantity', variant: 'destructive' });
    setBusy(true);
    const { error } = await db.rpc('record_po_receipt', { p_po_id: purchaseOrderId, p_lines: lines, p_received_at: receivedAt, p_notes: receiptNotes || null });
    setBusy(false);
    if (error) return fail('Receipt not saved', error);
    setQty({}); setShortClose({}); setReceiptNotes('');
    done('Item receipt recorded');
  };

  const openBill = (r: Receipt) => {
    setBillFor(r);
    setBill({ number: '', date: today(), due: '', subtotal: receiptSubtotal(r.po_receipt_lines).toFixed(2), tax: '0', shipping: '0' });
  };

  const submitBill = async () => {
    if (!billFor) return;
    setBusy(true);
    const { error } = await db.rpc('convert_receipt_to_bill', {
      p_receipt_id: billFor.id, p_bill_number: bill.number, p_bill_date: bill.date, p_due_date: bill.due || null,
      p_subtotal: Number(bill.subtotal) || 0, p_tax: Number(bill.tax) || 0, p_shipping: Number(bill.shipping) || 0,
    });
    setBusy(false);
    if (error) return fail('Bill not saved', error);
    setBillFor(null);
    done('Receipt turned into a bill');
  };

  const unbill = async (r: Receipt) => {
    if (!window.confirm(`Turn bill ${r.bill_number} back into a plain receipt?`)) return;
    setBusy(true);
    const { error } = await db.rpc('unbill_receipt', { p_receipt_id: r.id });
    setBusy(false);
    if (error) return fail('Could not change bill', error);
    done('Bill removed; the receipt is kept');
  };

  const billedTotal = receipts.filter(r => r.is_billed).reduce((s, r) => s + Number(r.bill_total || 0), 0);
  const paidTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const unappliedAdvance = payments.filter(p => !p.receipt_id).reduce((s, p) => s + Number(p.amount), 0);
  const maxPay = maxPayment(poTotal, billedTotal, paidTotal);
  const openBills = receipts.filter(r => r.is_billed && billBalance(Number(r.bill_total || 0), Number(r.bill_amount_paid || 0)) > 0);

  const submitPayment = async () => {
    const amount = Number(pay.amount);
    if (!(amount > 0)) return toast({ title: 'Enter a payment amount', variant: 'destructive' });
    if (amount > maxPay + 0.004) return toast({ title: `Payment is more than the ${formatCurrency(maxPay)} still owed`, variant: 'destructive' });
    if (!pay.account) return toast({ title: 'Pick the account it was paid from', variant: 'destructive' });
    setBusy(true);
    const { error } = await db.rpc('record_vendor_payment', {
      p_po_id: purchaseOrderId, p_amount: amount, p_paid_at: pay.date, p_method: pay.method, p_account_id: pay.account,
      p_reference: pay.reference || null, p_receipt_id: pay.target === 'auto' ? null : pay.target,
    });
    setBusy(false);
    if (error) return fail('Payment not saved', error);
    setPay(p => ({ ...p, amount: '', reference: '', target: 'auto' }));
    done('Payment recorded');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Item receipts &amp; bills</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {receipts.length === 0 && <p className="text-sm text-muted-foreground">Nothing received on this PO yet.</p>}
          {receipts.map((r, idx) => {
            const st = billStatus(r);
            return (
              <div key={r.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Receipt {idx + 1}</span>
                    <span className="text-sm text-muted-foreground">{r.received_at}</span>
                    <Badge variant={st === 'paid' ? 'default' : st === 'none' ? 'outline' : 'secondary'}>{BILL_STATUS_LABEL[st]}</Badge>
                  </div>
                  {manage && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`bill-${r.id}`} className="text-sm">Bill received</Label>
                      <Switch id={`bill-${r.id}`} checked={r.is_billed} disabled={busy}
                        onCheckedChange={on => (on ? openBill(r) : unbill(r))} />
                    </div>
                  )}
                </div>
                <ul className="text-sm space-y-1">
                  {r.po_receipt_lines.map(l => {
                    const total = l.quantity_previously_received + l.quantity_received;
                    return (
                      <li key={l.id} className="flex flex-wrap items-center gap-2">
                        <span>{sku(itemKey(l))}: {l.quantity_received} received</span>
                        <span className="text-muted-foreground">({total} of {l.quantity_ordered} ordered)</span>
                        {l.variance === 'over' && <Badge variant="secondary">Over-shipped +{overShippedQuantity(l.quantity_ordered, total)}</Badge>}
                        {l.variance === 'under' && l.quantity_short_closed === 0 && <Badge variant="outline">Under-shipped</Badge>}
                        {l.quantity_short_closed > 0 && <Badge variant="outline">Short-closed {l.quantity_short_closed}</Badge>}
                      </li>
                    );
                  })}
                </ul>
                {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
                {manage && r.is_billed && st !== 'paid' && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setCheckFor({ receiptId: r.id })}>Pay with check</Button>
                )}
                {r.is_billed && (
                  <p className="text-sm">
                    Bill {r.bill_number} · {r.bill_date}{r.due_date ? ` · due ${r.due_date}` : ''} · Total{' '}
                    <FinancialGuard kind="supplier_price">{formatCurrency(Number(r.bill_total))}</FinancialGuard>{' '}
                    · Balance <FinancialGuard kind="supplier_price">{formatCurrency(billBalance(Number(r.bill_total || 0), Number(r.bill_amount_paid || 0)))}</FinancialGuard>
                  </p>
                )}
              </div>
            );
          })}

          {canReceive && items.length > 0 && (
            <div className="border rounded-lg p-3 space-y-3">
              <p className="font-medium">Record a shipment received</p>
              <div className="grid grid-cols-[1fr_70px_70px_70px_90px_auto] gap-2 text-xs text-muted-foreground">
                <span>Item</span><span>Ordered</span><span>Received</span><span>Open</span><span>This shipment</span><span>Short-close rest</span>
              </div>
              {items.map(i => {
                const received = i.quantity_received || 0;
                const open = openQuantity(i.quantity, received, shortByItem[itemKey(i)] || 0);
                return (
                  <div key={i.id} className="grid grid-cols-[1fr_70px_70px_70px_90px_auto] gap-2 items-center text-sm">
                    <span className="truncate">{i.inventory_item?.sku || i.assembly?.sku}</span>
                    <span>{i.quantity}</span><span>{received}</span><span>{open}</span>
                    <Input type="number" min="0" className="h-8" value={qty[i.id] || ''} aria-label={`Quantity received for ${i.inventory_item?.sku || i.assembly?.sku}`}
                      onChange={e => setQty(q => ({ ...q, [i.id]: e.target.value }))} />
                    <Checkbox checked={!!shortClose[i.id]} disabled={open === 0} aria-label="Short-close remaining pieces"
                      onCheckedChange={v => setShortClose(s => ({ ...s, [i.id]: v === true }))} />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">You can enter more than ordered (over-shipment) or fewer. Tick short-close if the vendor won't send the missing pieces.</p>
              <div className="flex flex-wrap items-end gap-2">
                <div><Label className="text-xs">Received on</Label><Input type="date" className="h-8" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} /></div>
                <div className="flex-1 min-w-[160px]"><Label className="text-xs">Notes</Label><Input className="h-8" value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} /></div>
                <Button type="button" size="sm" disabled={busy} onClick={submitReceipt}>Save receipt</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {manage && (
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            {payments.map(p => {
              const r = receipts.find(x => x.id === p.receipt_id);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{p.paid_at}</span>
                  <span className="font-medium">{formatCurrency(Number(p.amount))}</span>
                  <span className="text-muted-foreground">{p.method.toUpperCase()}{p.account?.name ? ` · ${p.account.name}` : ''}{p.reference ? ` · ${p.reference}` : ''}</span>
                  {p.is_advance && <Badge variant="outline">Advance</Badge>}
                  {(p as any).check_number && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => printIssuedCheck((p as any).transaction_id).catch(e => fail('Could not print', e))}>
                      Reprint check {(p as any).check_number}
                    </Button>
                  )}
                  <span className="text-muted-foreground">{r ? `→ bill ${r.bill_number}` : 'not yet applied'}</span>
                </div>
              );
            })}
            <div className="text-sm space-y-0.5">
              <p>Paid so far: <strong>{formatCurrency(paidTotal)}</strong>{unappliedAdvance > 0 && <> · Unapplied advance: <strong>{formatCurrency(unappliedAdvance)}</strong></>}</p>
              <p>Balance due on bills: <strong>{formatCurrency(openBills.reduce((s, r) => s + billBalance(Number(r.bill_total || 0), Number(r.bill_amount_paid || 0)), 0))}</strong> · Most you can still pay: <strong>{formatCurrency(maxPay)}</strong></p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border rounded-lg p-3">
              <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" min="0" className="h-8" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} /></div>
              <div><Label className="text-xs">Date</Label><Input type="date" className="h-8" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} /></div>
              <div><Label className="text-xs">Method</Label>
                <Select value={pay.method} onValueChange={v => setPay(p => ({ ...p, method: v }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="check">Check</SelectItem><SelectItem value="ach">ACH</SelectItem>
                    <SelectItem value="card">Card</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Paid from</Label>
                <Select value={pay.account} onValueChange={v => setPay(p => ({ ...p, account: v }))}>
                  <SelectTrigger className="h-8"><SelectValue placeholder={accounts.length ? 'Pick account' : 'No bank/card accounts'} /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.account_subtype === 'credit_card' ? ' (card)' : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Reference</Label><Input className="h-8" placeholder="Check # / confirmation" value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} /></div>
              <div><Label className="text-xs">Apply to</Label>
                <Select value={pay.target} onValueChange={v => setPay(p => ({ ...p, target: v }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{openBills.length ? 'Oldest open bill first' : 'Advance (no bill yet)'}</SelectItem>
                    {openBills.map(r => <SelectItem key={r.id} value={r.id}>Bill {r.bill_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-full flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={maxPay <= 0} onClick={() => setCheckFor({})}>Pay with check</Button>
                <Button type="button" size="sm" disabled={busy || maxPay <= 0} onClick={submitPayment}>Record payment</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <PayWithCheckDialog
        open={!!checkFor}
        onOpenChange={o => { if (!o) setCheckFor(null); }}
        presetReceiptId={checkFor?.receiptId}
        presetPoId={checkFor && !checkFor.receiptId ? purchaseOrderId : undefined}
        onIssued={() => done('Check issued')}
      />

      <Dialog open={!!billFor} onOpenChange={o => { if (!o) setBillFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enter vendor bill</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Vendor invoice number *</Label><Input value={bill.number} onChange={e => setBill(b => ({ ...b, number: e.target.value }))} /></div>
            <div><Label>Bill date</Label><Input type="date" value={bill.date} onChange={e => setBill(b => ({ ...b, date: e.target.value }))} /></div>
            <div><Label>Due date</Label><Input type="date" value={bill.due} onChange={e => setBill(b => ({ ...b, due: e.target.value }))} /></div>
            <div><Label>Items subtotal</Label><Input type="number" step="0.01" value={bill.subtotal} onChange={e => setBill(b => ({ ...b, subtotal: e.target.value }))} /></div>
            <div><Label>Tax</Label><Input type="number" step="0.01" value={bill.tax} onChange={e => setBill(b => ({ ...b, tax: e.target.value }))} /></div>
            <div><Label>Shipping</Label><Input type="number" step="0.01" value={bill.shipping} onChange={e => setBill(b => ({ ...b, shipping: e.target.value }))} /></div>
            <div className="flex items-end"><p className="font-semibold">Total {formatCurrency(billTotal(Number(bill.subtotal) || 0, Number(bill.tax) || 0, Number(bill.shipping) || 0))}</p></div>
          </div>
          <p className="text-xs text-muted-foreground">Subtotal starts at this receipt's received quantities times PO cost; change it to match the vendor's bill. Any advance on this PO is applied automatically.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillFor(null)}>Cancel</Button>
            <Button disabled={busy || !bill.number.trim()} onClick={submitBill}>Save bill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
