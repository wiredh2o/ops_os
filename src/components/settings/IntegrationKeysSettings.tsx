import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { PROVIDERS, type Provider, validateIntegration } from "../../../supabase/functions/_shared/integration-rules";

type Status = { configured: boolean; mode?: string; masked?: Record<string, string>; updated_at?: string };

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-integrations", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function ModeBadge({ s }: { s?: Status }) {
  if (!s?.configured) return <Badge variant="outline">Not configured</Badge>;
  if (s.mode === "sandbox") return <Badge variant="secondary">Sandbox</Badge>;
  if (s.mode === "live") return <Badge>Live</Badge>;
  return <Badge variant="secondary">Saved</Badge>;
}

function ProviderForm({ provider, status, onSaved }: { provider: Provider; status?: Status; onSaved: () => void }) {
  const def = PROVIDERS[provider];
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // When nothing is saved yet every field is required; afterwards blank fields keep their saved value.
    if (!status?.configured) {
      const err = validateIntegration(provider, values);
      if (err) return toast({ title: "Check the keys", description: err, variant: "destructive" });
    }
    setBusy(true);
    try {
      const res = await call({ action: "save", provider, values });
      setValues({});
      toast({ title: `${def.label} keys saved`, description: res?.mode === "sandbox" ? "Using sandbox." : res?.mode === "live" ? "Using live account." : undefined });
      onSaved();
    } catch (err) {
      toast({ title: "Could not save", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove saved ${def.label} keys? ${def.label} features will stop until new keys are saved.`)) return;
    setBusy(true);
    try { await call({ action: "remove", provider }); onSaved(); } catch (err) {
      toast({ title: "Could not remove", description: (err as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="space-y-3 border rounded-lg p-4" autoComplete="off">
      <div className="flex items-center justify-between">
        <h5 className="font-medium">{def.label}</h5>
        <ModeBadge s={status} />
      </div>
      {def.fields.map((f) => (
        <div key={f.name} className="grid gap-1.5 max-w-md">
          <Label htmlFor={`${provider}-${f.name}`}>{f.label}</Label>
          <Input
            id={`${provider}-${f.name}`}
            type={f.secret ? "password" : "text"}
            autoComplete="new-password"
            value={values[f.name] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            placeholder={status?.configured ? `Saved: ${status.masked?.[f.name] ?? "••••"} — paste to replace` : provider === "stripe" ? (f.secret ? "sk_test_… or sk_live_…" : "pk_test_… or pk_live_…") : ""}
          />
        </div>
      ))}
      <div className="flex gap-2 justify-end">
        {status?.configured && (
          <Button type="button" variant="outline" size="sm" onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4 mr-1" /> Remove
          </Button>
        )}
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
      </div>
    </form>
  );
}

export function IntegrationKeysSettings() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => call({ action: "status" }) as Promise<{ status: Record<Provider, Status> }>,
    enabled: open,
    retry: false,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["integration-status"] });
    qc.invalidateQueries({ queryKey: ["stripe-publishable-key"] });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">Integrations &amp; API Keys</CardTitle>
                  <CardDescription>Your company's own Stripe, carrier and supplier keys.</CardDescription>
                </div>
              </div>
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste sandbox keys to test, or live keys to go live — whichever you paste is what gets used.
              Saved keys are encrypted and never shown again; only the last 4 characters appear.
            </p>
            {isLoading && <p className="text-sm">Loading…</p>}
            {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
            {data?.status && (Object.keys(PROVIDERS) as Provider[]).map((p) => (
              <ProviderForm key={p} provider={p} status={data.status[p]} onSaved={refresh} />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
