import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { computeAdjustment } from "@/lib/inventory-adjustment-rules";

export interface AdjustableItem {
  id: string;
  sku: string;
  sales_description?: string | null;
  purchase_description?: string | null;
  quantity_on_hand: number;
  unit_cost: number | null;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const today = () => new Date().toLocaleDateString("en-CA");

export function useOffsetAccounts() {
  const [accounts, setAccounts] = useState<{ id: string; name: string; account_subtype: string }[]>([]);
  useEffect(() => {
    supabase.from("accounts").select("id,name,account_subtype,account_type").eq("is_active", true)
      .in("account_type", ["expense", "income"]).order("name")
      .then(({ data }) => setAccounts((data || []).sort((a, b) =>
        (a.account_subtype === "cost_of_goods_sold" ? -1 : 0) - (b.account_subtype === "cost_of_goods_sold" ? -1 : 0))));
  }, []);
  return accounts;
}

export function InventoryAdjustmentDialog({ item, onClose, onSaved }: {
  item: AdjustableItem; onClose: () => void; onSaved: () => void;
}) {
  const [date, setDate] = useState(today());
  const [qty, setQty] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [offset, setOffset] = useState("");
  const [saving, setSaving] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const accounts = useOffsetAccounts();
  useEffect(() => { if (!offset && accounts[0]) setOffset(accounts[0].id); }, [accounts, offset]);

  const r = useMemo(() => computeAdjustment(
    item.quantity_on_hand, item.unit_cost || 0,
    qty === "" ? null : Number(qty), value === "" ? null : Number(value),
  ), [item, qty, value]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("post_inventory_adjustments", {
      p_date: date, p_offset_account_id: offset || null, p_request_key: requestKey.current,
      p_memo: reason || null,
      p_lines: [{ item_id: item.id, new_quantity: qty === "" ? null : Number(qty), new_value: value === "" ? null : Number(value), reason: reason || null }],
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Inventory adjusted");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Adjust Quantity/Value on Hand — {item.sku}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{item.sales_description || item.purchase_description}</p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><div className="text-muted-foreground">On hand</div>{item.quantity_on_hand}</div>
            <div><div className="text-muted-foreground">Per-item cost</div>{money(item.unit_cost || 0)}</div>
            <div><div className="text-muted-foreground">Total value</div>{money(r.oldValue)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Adjustment date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div>
              <Label>Adjustment account</Label>
              <Select value={offset} onValueChange={setOffset}>
                <SelectTrigger><SelectValue placeholder="Cost of goods sold" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>New quantity</Label><Input type="number" min={0} value={qty} placeholder={String(item.quantity_on_hand)} onChange={e => setQty(e.target.value)} /></div>
            <div><Label>New total value</Label><Input type="number" min={0} step="0.01" value={value} placeholder={r.oldValue.toFixed(2)} onChange={e => setValue(e.target.value)} /></div>
          </div>
          <div><Label>Reason (optional)</Label><Input value={reason} onChange={e => setReason(e.target.value)} /></div>
          <div className="rounded-md border p-3 text-sm grid grid-cols-3 gap-2">
            <div><div className="text-muted-foreground">Qty change</div>{r.newQuantity - item.quantity_on_hand}</div>
            <div><div className="text-muted-foreground">Value change</div>{money(r.valueChange)}</div>
            <div><div className="text-muted-foreground">New per-item cost</div>{money(r.newUnitCost)}</div>
          </div>
          {r.error && <p className="text-sm text-destructive">{r.error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !!r.error || !r.changed || !date}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
