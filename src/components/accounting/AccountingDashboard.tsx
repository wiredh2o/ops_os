import { FinancialGuard } from '@/components/permissions/FinancialGuard';
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign, CreditCard, Building2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { FieldGuard } from "@/components/permissions/FieldGuard";
import { formatCurrency } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCheckPdf, openPdf, type CheckData } from "@/lib/check-pdf";

interface Account {
  id: string;
  name: string;
  account_type: string | null;
  account_subtype: string | null;
  account_number: string | null;
  description: string | null;
  current_balance: number | null;
  is_active: boolean;
  company_id?: string;
}

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  total_amount: number;
  transaction_type: string;
  is_reconciled: boolean;
  reference_number: string | null;
}

export const AccountingDashboard = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);

  useEffect(() => {
    if (user) {
      initializeAccountsAndFetchData();
    }
  }, [user]);

  const initializeAccountsAndFetchData = async () => {
    try {
      setLoading(true);
      
      // Check if accounts exist
      const { data: existingAccounts } = await supabase
        .from("accounts")
        .select("*");

      // If no accounts exist, create default ones
      if (!existingAccounts || existingAccounts.length === 0) {
        await createDefaultAccounts();
      }

      // Fetch all data
      await fetchData();
    } catch (error) {
      console.error('Error initializing accounts:', error);
      toast.error('Failed to initialize accounting system');
    } finally {
      setLoading(false);
    }
  };

  const createDefaultAccounts = async () => {
    const defaultAccounts = [
      { name: 'Checking Account', account_type: 'asset' as const, account_subtype: 'checking' as const, account_number: '1000', description: 'Primary checking account' },
      { name: 'Credit Card', account_type: 'liability' as const, account_subtype: 'credit_card' as const, account_number: '2000', description: 'Business credit card' },
      { name: 'Inventory', account_type: 'asset' as const, account_subtype: 'inventory' as const, account_number: '1200', description: 'Inventory asset account' },
      { name: 'Accounts Receivable', account_type: 'asset' as const, account_subtype: 'accounts_receivable' as const, account_number: '1100', description: 'Money owed by customers' },
      { name: 'Sales Revenue', account_type: 'income' as const, account_subtype: 'sales' as const, account_number: '4000', description: 'Sales income' },
      { name: 'Cost of Goods Sold', account_type: 'expense' as const, account_subtype: 'cost_of_goods_sold' as const, account_number: '5000', description: 'Direct costs of goods sold' },
      { name: 'Operating Expenses', account_type: 'expense' as const, account_subtype: 'operating_expenses' as const, account_number: '6000', description: 'General operating expenses' }
    ];

    for (const account of defaultAccounts) {
      await supabase
        .from("accounts")
        .insert({ ...account, created_by: user?.id || '' });
    }

    toast.success('Default accounts created successfully');
  };

  const fetchData = async () => {
    try {
      // Fetch accounts using secure view
      const { data: accountsData, error: accountsError } = await supabase
        .from("accounts_secure")
        .select("*")
        .order("name");

      if (accountsError) throw accountsError;
      setAccounts(accountsData || []);

      // Fetch recent transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .limit(50);

      if (transactionsError) throw transactionsError;
      setTransactions(transactionsData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch accounting data');
    }
  };


  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case 'asset': return 'bg-green-500/10 text-green-700 border-green-500/20';
      case 'liability': return 'bg-red-500/10 text-red-700 border-red-500/20';
      case 'equity': return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
      case 'income': return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
      case 'expense': return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-500/20';
    }
  };

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (account.account_type?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
    (account.account_subtype?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const filteredTransactions = transactions.filter(transaction =>
    transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.transaction_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate summary statistics
  const totalAssets = accounts
    .filter(acc => acc.account_type === 'asset')
    .reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

  const totalLiabilities = accounts
    .filter(acc => acc.account_type === 'liability')
    .reduce((sum, acc) => sum + (acc.current_balance || 0), 0);

  const netWorth = totalAssets - totalLiabilities;

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading accounting data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Accounting Dashboard</h2>
        <div className="flex gap-2">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Transaction
          </Button>
          <Button variant="outline" onClick={() => window.location.assign("/accounting/general-journal")}>
            <FileText className="w-4 h-4 mr-2" />
            General Journal
          </Button>
          <Button variant="outline" onClick={() => setCheckOpen(true)}>
            <FileText className="w-4 h-4 mr-2" />
            Pay with check
          </Button>
          <Button variant="outline">
            <Building2 className="w-4 h-4 mr-2" />
            Reconcile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600"><FinancialGuard kind="margin">{formatCurrency(totalAssets)}</FinancialGuard></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600"><FinancialGuard kind="margin">{formatCurrency(totalLiabilities)}</FinancialGuard></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              <FinancialGuard kind="margin">{formatCurrency(netWorth)}</FinancialGuard>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search accounts or transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      <Tabs defaultValue="accounts" className="w-full">
        <TabsList>
          <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Recent Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Chart of Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="account_number" 
                        targetCompanyId={account.company_id}
                        fallback={<div className="text-sm text-muted-foreground">•••</div>}
                      >
                        <div className="text-sm text-muted-foreground">
                          {account.account_number}
                        </div>
                      </FieldGuard>
                      <div>
                        <h3 className="font-medium">{account.name}</h3>
                        <p className="text-sm text-muted-foreground">{account.description}</p>
                      </div>
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="account_type" 
                        targetCompanyId={account.company_id}
                        fallback={<Badge variant="outline">Hidden</Badge>}
                      >
                        {account.account_type && (
                          <Badge className={getAccountTypeColor(account.account_type)}>
                            {account.account_type}
                          </Badge>
                        )}
                      </FieldGuard>
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="account_subtype" 
                        targetCompanyId={account.company_id}
                        fallback={<Badge variant="outline">Hidden</Badge>}
                      >
                        {account.account_subtype && (
                          <Badge variant="outline">
                            {account.account_subtype.replace('_', ' ')}
                          </Badge>
                        )}
                      </FieldGuard>
                    </div>
                    <div className="text-right">
                      <FieldGuard 
                        tableName="accounts" 
                        columnName="current_balance" 
                        targetCompanyId={account.company_id}
                        fallback={<div className="text-lg font-semibold text-muted-foreground">Hidden</div>}
                      >
                        <div className={`text-lg font-semibold ${
                          (account.current_balance || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          <FinancialGuard kind="revenue">{formatCurrency(account.current_balance || 0)}</FinancialGuard>
                        </div>
                      </FieldGuard>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="text-sm text-muted-foreground">
                        {new Date(transaction.transaction_date).toLocaleDateString()}
                      </div>
                      <div>
                        <h3 className="font-medium">{transaction.description}</h3>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">
                            {transaction.transaction_type.replace('_', ' ')}
                          </Badge>
                          {transaction.is_reconciled && (
                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                              Reconciled
                            </Badge>
                          )}
                          {transaction.reference_number && (
                            <span className="text-sm text-muted-foreground">
                              Ref: {transaction.reference_number}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      {transaction.transaction_type === 'vendor_payment' && transaction.reference_number?.startsWith('Check #') && !transaction.description.startsWith('VOID') && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => printIssuedCheck(transaction.id).catch(e => toast.error(e.message))}>Reprint</Button>
                          <Button size="sm" variant="outline" onClick={async () => {
                            if (!window.confirm(`Void ${transaction.reference_number}? The payment is reversed and the number stays used.`)) return;
                            const { error } = await (supabase as any).rpc('void_vendor_check', { p_transaction_id: transaction.id });
                            if (error) toast.error(error.message); else { toast.success('Check voided'); fetchData(); }
                          }}>Void</Button>
                        </>
                      )}
                      <div className={`text-lg font-semibold ${
                        transaction.total_amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        <FinancialGuard kind="revenue">{formatCurrency(transaction.total_amount)}</FinancialGuard>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredTransactions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No transactions found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PayWithCheckDialog open={checkOpen} onOpenChange={setCheckOpen} onIssued={fetchData} />
    </div>
  );
};
// ---------------- Vendor checks ----------------

const sdb = supabase as any;
const todayIso = () => new Date().toISOString().split('T')[0];
const usDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
};

/** Load an issued check (all payment rows sharing its transaction) and open the print-ready PDF. */
export async function printIssuedCheck(transactionId: string) {
  const { data: rows, error } = await sdb.from('vendor_payments')
    .select('amount, paid_at, check_number, payee_name, memo, account_id, receipt:po_receipts(bill_number, bill_date, bill_total), po:purchase_orders(purchase_order_number, supplier:suppliers(name, address, shipping_city, shipping_state, shipping_postal_code))')
    .eq('transaction_id', transactionId);
  if (error) throw error;
  const { data: tx } = await sdb.from('transactions').select('description, total_amount').eq('id', transactionId).maybeSingle();
  const voided = !rows?.length && /^VOID check #/.test(tx?.description || '');
  if (!rows?.length) throw new Error(voided ? 'This check was voided; it can no longer be printed.' : 'Check not found');
  const first = rows[0];
  if (!first.check_number) throw new Error('This payment was not made by printed check');
  const { data: acct, error: aErr } = await sdb.from('accounts').select('*').eq('id', first.account_id).single();
  if (aErr) throw aErr;
  const sup = first.po?.supplier;
  const payeeAddress = [sup?.address, [sup?.shipping_city, sup?.shipping_state, sup?.shipping_postal_code].filter(Boolean).join(' ')]
    .filter(Boolean).join('\n');
  const data: CheckData = {
    companyName: acct.check_company_name || '',
    companyAddress: acct.check_company_address || '',
    logoUrl: acct.check_logo_url,
    bankName: acct.bank_name || '',
    bankAddress: acct.bank_address || '',
    routingNumber: acct.routing_number,
    accountNumber: acct.check_account_number,
    checkNumber: first.check_number,
    date: usDate(first.paid_at),
    payee: first.payee_name || sup?.name || '',
    payeeAddress,
    amount: rows.reduce((s: number, r: any) => s + Number(r.amount), 0),
    memo: first.memo,
    stubLines: rows.map((r: any) => ({
      billNumber: r.receipt?.bill_number || '', poNumber: r.po?.purchase_order_number || '',
      billDate: usDate(r.receipt?.bill_date), billAmount: Number(r.receipt?.bill_total || 0), paid: Number(r.amount),
    })),
    offsetXIn: Number(acct.print_offset_x || 0),
    offsetYIn: Number(acct.print_offset_y || 0),
  };
  openPdf(await buildCheckPdf(data));
}

interface OpenBillOption { id: string; purchase_order_id: string; bill_number: string; bill_total: number; bill_amount_paid: number; po: { purchase_order_number: string; supplier: { name: string } | null } | null }

/** Issue a vendor check against a bill (or as an advance on a PO) and print it. */
export function PayWithCheckDialog({ open, onOpenChange, presetReceiptId, presetPoId, onIssued }: {
  open: boolean; onOpenChange: (o: boolean) => void; presetReceiptId?: string; presetPoId?: string; onIssued?: () => void;
}) {
  const [bills, setBills] = useState<OpenBillOption[]>([]);
  const [pos, setPos] = useState<Array<{ id: string; purchase_order_number: string; supplier: { name: string } | null }>>([]);
  const [checking, setChecking] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  // One key per dialog opening: retries or double-submits replay the same check server-side.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => { if (open) setRequestKey(crypto.randomUUID()); }, [open]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [b, p, a] = await Promise.all([
        sdb.from('po_receipts').select('id, purchase_order_id, bill_number, bill_total, bill_amount_paid, po:purchase_orders(purchase_order_number, supplier:suppliers(name))').eq('is_billed', true).order('bill_date'),
        sdb.from('purchase_orders').select('id, purchase_order_number, supplier:suppliers(name)').not('status', 'in', '(draft,cancelled)').order('created_at', { ascending: false }).limit(200),
        sdb.from('accounts').select('id, name, routing_number, check_account_number, next_check_number').eq('account_subtype', 'checking').eq('is_active', true).order('name'),
      ]);
      const open = (b.data || []).filter((r: OpenBillOption) => Number(r.bill_total) - Number(r.bill_amount_paid) > 0.004);
      setBills(open);
      setPos(p.data || []);
      setChecking(a.data || []);
      if (a.data?.length === 1) setAccountId(a.data[0].id);
      const preset = presetReceiptId ? `bill:${presetReceiptId}` : presetPoId ? `po:${presetPoId}` : '';
      setTarget(preset);
      setDate(todayIso());
      applyTarget(preset, open, p.data || []);
    })();
  }, [open, presetReceiptId, presetPoId]);

  const applyTarget = (t: string, billList = bills, poList = pos) => {
    setTarget(t);
    if (t.startsWith('bill:')) {
      const b = billList.find(x => x.id === t.slice(5));
      if (b) {
        setAmount((Number(b.bill_total) - Number(b.bill_amount_paid)).toFixed(2));
        setMemo(`PO ${b.po?.purchase_order_number || ''} / Inv ${b.bill_number}`);
      }
    } else if (t.startsWith('po:')) {
      const p = poList.find(x => x.id === t.slice(3));
      setAmount('');
      setMemo(p ? `Advance on PO ${p.purchase_order_number}` : '');
    }
  };

  const account = checking.find(a => a.id === accountId);
  const accountReady = account && account.routing_number && account.check_account_number;

  const issue = async () => {
    const amt = Number(amount);
    if (!target) return toast.error('Pick a bill or PO to pay');
    if (!accountReady) return toast.error('Add routing and account numbers for this checking account in Settings first');
    if (!(amt > 0)) return toast.error('Enter the check amount');
    const bill = target.startsWith('bill:') ? bills.find(b => b.id === target.slice(5)) : null;
    const poId = bill ? bill.purchase_order_id : target.slice(3);
    setBusy(true);
    try {
      const { data, error } = await sdb.rpc('issue_vendor_check', {
        p_account_id: accountId, p_po_id: poId, p_amount: amt, p_check_date: date, p_memo: memo || null,
        p_receipt_id: bill ? bill.id : null, p_request_key: requestKey,
      });
      if (error) throw error;
      toast.success(data.replayed ? `Check ${data.check_number} was already issued` : `Check ${data.check_number} issued`);
      onOpenChange(false);
      onIssued?.();
      await printIssuedCheck(data.transaction_id);
    } catch (e: any) {
      toast.error(e?.message || 'Check not issued');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pay with check</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Pay</Label>
            <Select value={target} onValueChange={v => applyTarget(v)}>
              <SelectTrigger><SelectValue placeholder="Pick an open bill or a PO" /></SelectTrigger>
              <SelectContent>
                {bills.map(b => (
                  <SelectItem key={b.id} value={`bill:${b.id}`}>
                    Bill {b.bill_number} · {b.po?.supplier?.name} · PO {b.po?.purchase_order_number} · owes {formatCurrency(Number(b.bill_total) - Number(b.bill_amount_paid))}
                  </SelectItem>
                ))}
                {pos.map(p => <SelectItem key={p.id} value={`po:${p.id}`}>Advance on PO {p.purchase_order_number} · {p.supplier?.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Checking account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Pick account" /></SelectTrigger>
              <SelectContent>{checking.map(a => <SelectItem key={a.id} value={a.id}>{a.name} · next check {a.next_check_number}</SelectItem>)}</SelectContent>
            </Select>
            {account && !accountReady && <p className="text-sm text-destructive mt-1">This account has no routing/account numbers yet. Add them in Settings → System → Check printing.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div><Label>Check date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <div><Label>Memo</Label><Input value={memo} maxLength={60} onChange={e => setMemo(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Prints on the top third of 8.5" × 11" check stock with two stubs below. Print at Actual size (100%). The signature is left blank.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={issue}>{busy ? 'Issuing…' : 'Issue & print check'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
