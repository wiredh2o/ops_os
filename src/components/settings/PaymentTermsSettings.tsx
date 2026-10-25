import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePaymentTerms, PAYMENT_TERMS_KEY } from '@/hooks/usePaymentTerms';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { CUSTOMER_CREDIT_KEY } from '@/hooks/useCustomerCredit';
import type { PaymentTerm } from '@/lib/credit-rules';

const blank = { code: '', label: '', net_days: 30, deposit_percent: 0, uses_credit: true };

/** Admin-only list of standard payment terms plus the credit accounting basis. */
export function PaymentTermsSettings() {
  const { roles } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: terms = [] } = usePaymentTerms();
  const { data: basis } = useSystemSetting('credit_accounting_basis');
  const updateSetting = useUpdateSystemSetting();
  const [draft, setDraft] = useState(blank);

  if (!roles.includes('admin')) return null;

  const save = async (code: string, patch: Partial<PaymentTerm>) => {
    const { error } = await (supabase as any).from('payment_terms').update(patch).eq('code', code);
    if (error) return toast({ title: 'Could not save term', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: PAYMENT_TERMS_KEY });
    qc.invalidateQueries({ queryKey: [CUSTOMER_CREDIT_KEY] });
  };

  const add = async () => {
    const code = draft.code.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (!code || !draft.label.trim()) return toast({ title: 'Enter a code and a name', variant: 'destructive' });
    const { error } = await (supabase as any).from('payment_terms').insert({
      ...draft, code, label: draft.label.trim(), sort_order: (terms.at(-1)?.sort_order ?? 0) + 1,
    });
    if (error) return toast({ title: 'Could not add term', description: error.message, variant: 'destructive' });
    setDraft(blank);
    qc.invalidateQueries({ queryKey: PAYMENT_TERMS_KEY });
  };

  const num = (v: string) => Math.max(0, Number(v) || 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Payment Terms &amp; Credit</CardTitle>
        <CardDescription>
          The standard terms customers can be given. Terms that use credit count against the customer's credit limit.
          Turn a term off to stop offering it; customers already on it keep it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-sm space-y-1">
          <Label>Credit accounting basis</Label>
          <Select
            value={basis?.setting_value || 'cash'}
            onValueChange={(v) => updateSetting.mutate(
              { settingKey: 'credit_accounting_basis', settingValue: v },
              { onSuccess: () => qc.invalidateQueries({ queryKey: [CUSTOMER_CREDIT_KEY] }) },
            )}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash basis: unpaid invoices + open orders</SelectItem>
              <SelectItem value="accrual">Accrual basis: unpaid invoices only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Days to pay</TableHead>
              <TableHead className="w-28">Deposit %</TableHead>
              <TableHead className="w-28">Uses credit</TableHead>
              <TableHead className="w-24">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.map((t) => (
              <TableRow key={t.code}>
                <TableCell>
                  <Input defaultValue={t.label} onBlur={(e) => e.target.value.trim() && e.target.value !== t.label && save(t.code, { label: e.target.value.trim() })} />
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{t.code}</p>
                </TableCell>
                <TableCell><Input type="number" min={0} defaultValue={t.net_days} onBlur={(e) => num(e.target.value) !== t.net_days && save(t.code, { net_days: num(e.target.value) })} /></TableCell>
                <TableCell><Input type="number" min={0} max={100} defaultValue={t.deposit_percent} onBlur={(e) => num(e.target.value) !== Number(t.deposit_percent) && save(t.code, { deposit_percent: Math.min(100, num(e.target.value)) })} /></TableCell>
                <TableCell><Switch checked={t.uses_credit} onCheckedChange={(v) => save(t.code, { uses_credit: v })} /></TableCell>
                <TableCell><Switch checked={t.active} onCheckedChange={(v) => save(t.code, { active: v })} /></TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="space-y-1">
                <Input placeholder="Name, e.g. Net 45" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                <Input placeholder="Code, e.g. net_45" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
              </TableCell>
              <TableCell><Input type="number" min={0} value={draft.net_days} onChange={(e) => setDraft({ ...draft, net_days: num(e.target.value) })} /></TableCell>
              <TableCell><Input type="number" min={0} max={100} value={draft.deposit_percent} onChange={(e) => setDraft({ ...draft, deposit_percent: Math.min(100, num(e.target.value)) })} /></TableCell>
              <TableCell><Switch checked={draft.uses_credit} onCheckedChange={(v) => setDraft({ ...draft, uses_credit: v })} /></TableCell>
              <TableCell><Button size="sm" onClick={add}>Add</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
