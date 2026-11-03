import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canManageVendorBills } from "@/lib/vendor-bill-rules";
import { computeAdjustment, netChange } from "@/lib/inventory-adjustment-rules";
import { AdjustableItem, today, useOffsetAccounts } from "@/components/inventory/InventoryAdjustmentDialog";
import { toast } from "sonner";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function InventoryPhysicalCount() {
  const { roles, rolesLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AdjustableItem[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(today());
  const [offset, setOffset] = useState("");
  const [posting, setPosting] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const accounts = useOffsetAccounts();
  useEffect(() => { if (!offset && accounts[0]) setOffset(accounts[0].id); }, [accounts, offset]);

  const load = async () => {
    const all: AdjustableItem[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("inventory_items")
        .select("id,sku,sales_description,purchase_description,quantity_on_hand,unit_cost")
        .eq("is_active", true).order("sku").range(from, from + 999);
      if (error) { toast.error(error.message); break; }
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    setItems(all);
  };
  useEffect(() => { load(); }, []);

  const results = useMemo(() => Object.fromEntries(items.map(i => [i.id,
    computeAdjustment(i.quantity_on_hand, i.unit_cost || 0, counts[i.id] ? Number(counts[i.id]) : null, null)])), [items, counts]);
  const changed = items.filter(i => results[i.id]?.changed);
  const errors = changed.filter(i => results[i.id].error);
  const inc = changed.reduce((s, i) => s + Math.max(0, results[i.id].valueChange), 0);
  const dec = changed.reduce((s, i) => s + Math.min(0, results[i.id].valueChange), 0);
  const net = netChange(changed.map(i => results[i.id]));
  const shown = items.filter(i => !search || `${i.sku} ${i.sales_description || ""} ${i.purchase_description || ""}`.toLowerCase().includes(search.toLowerCase()));

  if (rolesLoading) return <div className="p-6">Loading…</div>;
  if (!canManageVendorBills(roles)) return <Navigate to="/staff/inventory" replace />;

  const post = async () => {
    setPosting(true);
    const { data, error } = await supabase.rpc("post_inventory_adjustments", {
      p_date: date, p_offset_account_id: offset || null, p_request_key: requestKey.current,
      p_lines: changed.map(i => ({ item_id: i.id, new_quantity: Number(counts[i.id]) })),
    });
    setPosting(false);
    if (error) return toast.error(error.message);
    toast.success(`Adjusted ${(data as { items?: number })?.items ?? changed.length} items`);
    requestKey.current = crypto.randomUUID();
    setCounts({});
    load();
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Physical Inventory Worksheet</h1>
        <Button variant="outline" onClick={() => navigate("/staff/inventory")}>Back to Inventory</Button>
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        <div><Label>Adjustment date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="w-64">
          <Label>Adjustment account</Label>
          <Select value={offset} onValueChange={setOffset}>
            <SelectTrigger><SelectValue placeholder="Cost of goods sold" /></SelectTrigger>
            <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-48"><Label>Search</Label><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="SKU or description" /></div>
      </div>
      <div className="flex flex-wrap gap-6 rounded-md border p-3 text-sm items-center">
        <span>Items changed: <b>{changed.length}</b></span>
        <span>Increase: <b>{money(inc)}</b></span>
        <span>Decrease: <b>{money(dec)}</b></span>
        <span>Net: <b>{money(net)}</b></span>
        <Button className="ml-auto" disabled={posting || !changed.length || !!errors.length || !date} onClick={post}>
          {posting ? "Posting…" : "Post adjustments"}
        </Button>
      </div>
      {errors.length > 0 && <p className="text-sm text-destructive">Quantity on hand can't go below 0 ({errors.map(i => i.sku).join(", ")}).</p>}
      <Table>
        <TableHeader><TableRow>
          <TableHead>Item</TableHead><TableHead className="text-right">Current qty</TableHead>
          <TableHead className="text-right">Current value</TableHead><TableHead className="text-right w-32">Counted qty</TableHead>
          <TableHead className="text-right">Counted value</TableHead><TableHead className="text-right">Change</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {shown.map(i => { const r = results[i.id]; return (
            <TableRow key={i.id}>
              <TableCell><div className="font-medium">{i.sku}</div><div className="text-xs text-muted-foreground">{i.sales_description || i.purchase_description}</div></TableCell>
              <TableCell className="text-right">{i.quantity_on_hand}</TableCell>
              <TableCell className="text-right">{money(r.oldValue)}</TableCell>
              <TableCell className="text-right"><Input type="number" min={0} className="text-right h-8" value={counts[i.id] ?? ""}
                onChange={e => setCounts(c => ({ ...c, [i.id]: e.target.value }))} /></TableCell>
              <TableCell className="text-right">{counts[i.id] ? money(r.newValue) : ""}</TableCell>
              <TableCell className={`text-right ${r.error ? "text-destructive" : ""}`}>{r.changed ? money(r.valueChange) : ""}</TableCell>
            </TableRow>); })}
        </TableBody>
      </Table>
    </div>
  );
}
