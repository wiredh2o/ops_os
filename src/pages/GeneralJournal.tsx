import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canManageVendorBills } from "@/lib/vendor-bill-rules";
import { balancingLine, journalTotals } from "@/lib/inventory-adjustment-rules";
import { toast } from "sonner";

type Line = { account_id: string; debit: string; credit: string; memo: string };
type Entry = { id: string; entry_number: string | null; transaction_date: string; description: string; is_adjusting: boolean; transaction_type: string; total_amount: number };
const blank = (): Line => ({ account_id: "", debit: "", credit: "", memo: "" });
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const today = () => new Date().toLocaleDateString("en-CA");

export default function GeneralJournal() {
  const { roles, rolesLoading } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<{ id: string; name: string; account_number: string | null }[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [viewIndex, setViewIndex] = useState<number | null>(null); // null = new entry
  const [viewLines, setViewLines] = useState<Line[]>([]);
  const [showList, setShowList] = useState(false);
  const [date, setDate] = useState(today());
  const [entryNo, setEntryNo] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const requestKey = useRef(crypto.randomUUID());

  const loadEntries = async () => {
    const { data } = await supabase.from("transactions")
      .select("id,entry_number,transaction_date,description,is_adjusting,transaction_type,total_amount")
      .in("transaction_type", ["general_journal", "inventory_adjustment"])
      .order("transaction_date", { ascending: true }).order("created_at", { ascending: true }).limit(1000);
    setEntries((data || []) as Entry[]);
  };
  const resetNew = async () => {
    setViewIndex(null); setLines([blank(), blank()]); setAdjusting(false); setDate(today());
    requestKey.current = crypto.randomUUID();
    const { data } = await supabase.rpc("next_journal_entry_number");
    setEntryNo((data as string) || "");
  };
  useEffect(() => {
    supabase.from("accounts").select("id,name,account_number").eq("is_active", true).order("name").then(({ data }) => setAccounts(data || []));
    loadEntries(); resetNew();
  }, []);

  const viewing = viewIndex != null ? entries[viewIndex] : null;
  useEffect(() => {
    if (!viewing) return;
    supabase.from("transaction_lines").select("account_id,debit_amount,credit_amount,description").eq("transaction_id", viewing.id)
      .then(({ data }) => setViewLines((data || []).map(l => ({ account_id: l.account_id, debit: l.debit_amount ? String(l.debit_amount) : "", credit: l.credit_amount ? String(l.credit_amount) : "", memo: l.description || "" }))));
  }, [viewing]);

  const shownLines = viewing ? viewLines : lines;
  const totals = useMemo(() => journalTotals(shownLines.map(l => ({ debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }))), [shownLines]);

  if (rolesLoading) return <div className="p-6">Loading…</div>;
  if (!canManageVendorBills(roles)) return <Navigate to="/staff/accounting" replace />;

  const update = (i: number, patch: Partial<Line>) => setLines(prev => {
    const next = prev.map((l, j) => (j === i ? { ...l, ...patch } : l));
    if (patch.debit) next[i].credit = ""; if (patch.credit) next[i].debit = "";
    // Like QuickBooks: when the last row gets used, add a row pre-filled with the balancing amount.
    if (i === next.length - 1 && (next[i].account_id || next[i].debit || next[i].credit)) {
      const b = balancingLine(next.map(l => ({ debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })));
      next.push({ ...blank(), debit: b.debit ? String(b.debit) : "", credit: b.credit ? String(b.credit) : "", memo: next[i].memo });
    }
    return next;
  });

  const save = async (andNew: boolean) => {
    setSaving(true);
    const { error } = await supabase.rpc("post_journal_entry", {
      p_date: date, p_entry_number: entryNo, p_is_adjusting: adjusting, p_memo: lines.find(l => l.memo)?.memo || null,
      p_request_key: requestKey.current,
      p_lines: lines.filter(l => l.account_id && (Number(l.debit) || Number(l.credit)))
        .map(l => ({ account_id: l.account_id, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo })),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Entry ${entryNo} saved`);
    await loadEntries();
    if (andNew) resetNew(); else navigate("/staff/accounting");
  };

  const go = (dir: -1 | 1) => {
    const cur = viewIndex ?? entries.length;
    const n = cur + dir;
    if (n >= entries.length) return resetNew();
    if (n >= 0) setViewIndex(n);
  };
  const ro = !!viewing;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Make General Journal Entries</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={(viewIndex ?? entries.length) === 0}><ChevronLeft className="w-4 h-4" />Previous</Button>
          <Button variant="outline" size="sm" onClick={() => go(1)} disabled={viewIndex == null}>Next<ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setShowList(s => !s)}>{showList ? "Hide List of Entries" : "List of Selected General Journal Entries"}</Button>
        </div>
      </div>

      {showList && (
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Entry No.</TableHead><TableHead>Memo</TableHead><TableHead>Adj</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>{[...entries].reverse().slice(0, 50).map(e => (
            <TableRow key={e.id} className="cursor-pointer" onClick={() => setViewIndex(entries.indexOf(e))}>
              <TableCell>{e.transaction_date}</TableCell><TableCell>{e.entry_number}</TableCell><TableCell>{e.description}</TableCell>
              <TableCell>{e.is_adjusting ? "✓" : ""}</TableCell><TableCell className="text-right">{money(Number(e.total_amount))}</TableCell>
            </TableRow>))}</TableBody>
        </Table>
      )}

      <div className="flex flex-wrap gap-4 items-end">
        <div><Label>Date</Label><Input type="date" value={viewing ? viewing.transaction_date : date} disabled={ro} onChange={e => setDate(e.target.value)} /></div>
        <div><Label>Entry No.</Label><Input className="w-32" value={viewing ? viewing.entry_number || "" : entryNo} disabled={ro} onChange={e => setEntryNo(e.target.value)} /></div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={viewing ? viewing.is_adjusting : adjusting} disabled={ro} onCheckedChange={v => setAdjusting(!!v)} />Adjusting Entry
        </label>
        {viewing?.transaction_type === "inventory_adjustment" && (
          <div className="pb-2 flex gap-2 items-center">
            <Badge variant="secondary">Inventory adjustment</Badge>
            <Button variant="link" size="sm" onClick={() => navigate("/inventory/physical-count")}>Adjust inventory instead</Button>
          </div>
        )}
      </div>

      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-72">Account</TableHead><TableHead className="text-right w-36">Debit</TableHead>
          <TableHead className="text-right w-36">Credit</TableHead><TableHead>Memo</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {shownLines.map((l, i) => (
            <TableRow key={i}>
              <TableCell>
                <Select value={l.account_id} disabled={ro} onValueChange={v => update(i, { account_id: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Account" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_number ? `${a.account_number} · ` : ""}{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell><Input className="h-8 text-right" type="number" step="0.01" min={0} disabled={ro} value={l.debit} onChange={e => update(i, { debit: e.target.value })} /></TableCell>
              <TableCell><Input className="h-8 text-right" type="number" step="0.01" min={0} disabled={ro} value={l.credit} onChange={e => update(i, { credit: e.target.value })} /></TableCell>
              <TableCell><Input className="h-8" disabled={ro} value={l.memo} onChange={e => update(i, { memo: e.target.value })} /></TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell className="font-medium text-right">Totals</TableCell>
            <TableCell className="text-right font-medium">{money(totals.debit)}</TableCell>
            <TableCell className="text-right font-medium">{money(totals.credit)}</TableCell>
            <TableCell className={totals.difference ? "text-destructive text-sm" : "text-sm text-muted-foreground"}>
              {totals.difference ? `Out of balance by ${money(Math.abs(totals.difference))}` : ""}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {!ro ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setLines([blank(), blank()])}>Clear</Button>
          <Button variant="outline" disabled={saving || !totals.balanced} onClick={() => save(false)}>Save &amp; Close</Button>
          <Button disabled={saving || !totals.balanced} onClick={() => save(true)}>Save &amp; New</Button>
        </div>
      ) : (
        <div className="flex justify-end"><Button onClick={resetNew}>New Entry</Button></div>
      )}
    </div>
  );
}
