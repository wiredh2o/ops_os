import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type AccountType = Database["public"]["Enums"]["account_type"];
type AccountSubtype = Database["public"]["Enums"]["account_subtype"];

/** Subtypes that fit each account type, so a new account can't be filed under the wrong side. */
export const SUBTYPES_BY_TYPE: Record<AccountType, AccountSubtype[]> = {
  asset: ["checking", "inventory", "accounts_receivable"],
  liability: ["credit_card", "accounts_payable"],
  equity: [],
  income: ["sales", "other_income"],
  expense: ["cost_of_goods_sold", "operating_expenses", "other_expenses"],
};
const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export interface EditableAccount {
  id: string; name: string; account_number: string | null; description: string | null;
  account_type: string | null; account_subtype: string | null; is_active: boolean;
}

export function AccountEditDialog({ account, userId, onClose, onSaved }: {
  account: EditableAccount | null; userId: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(account?.name || "");
  const [number, setNumber] = useState(account?.account_number || "");
  const [description, setDescription] = useState(account?.description || "");
  const [type, setType] = useState<AccountType>((account?.account_type as AccountType) || "expense");
  const [subtype, setSubtype] = useState<string>(account?.account_subtype || SUBTYPES_BY_TYPE.expense[1]);
  const [active, setActive] = useState(account?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const subtypes = SUBTYPES_BY_TYPE[type];

  const save = async () => {
    if (!name.trim()) return toast.error("Enter an account name");
    if (!subtype) return toast.error("Pick a detail type");
    setSaving(true);
    const row = {
      name: name.trim(), account_number: number.trim() || null, description: description.trim() || null,
      account_type: type, account_subtype: subtype as AccountSubtype, is_active: active,
    };
    const { error } = account
      ? await supabase.from("accounts").update(row).eq("id", account.id)
      : await supabase.from("accounts").insert({ ...row, created_by: userId });
    setSaving(false);
    if (error) {
      return toast.error(error.code === "23505" ? "That account number is already used" : error.message);
    }
    toast.success(account ? "Account updated" : "Account added");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Number</Label><Input value={number} onChange={e => setNumber(e.target.value)} /></div>
            <div className="col-span-2"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={v => { const t = v as AccountType; setType(t); if (!SUBTYPES_BY_TYPE[t].includes(subtype as AccountSubtype)) setSubtype(SUBTYPES_BY_TYPE[t][0] || ""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(SUBTYPES_BY_TYPE) as AccountType[]).filter(t => SUBTYPES_BY_TYPE[t].length).map(t => <SelectItem key={t} value={t}>{label(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Detail type</Label>
              <Select value={subtype} onValueChange={setSubtype}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>{subtypes.map(s => <SelectItem key={s} value={s}>{label(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} />Active</label>
          {!active && <p className="text-xs text-muted-foreground">Inactive accounts stay in past entries but can't be picked for new ones.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
