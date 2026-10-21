import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { TaxJurisdiction } from '@/lib/tax-engine';
import { Pencil, Plus, Save, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const blank = { name:'',kind:'state',state:'',rate:'',is_taxable:true,tax_shipping:false,shipment_fee:'0',active:true };
export function TaxSettings() {
  const { roles, rolesLoading } = useAuth();
  const permitted = roles.includes('admin') || roles.includes('accounting');
  const { toast } = useToast();
  const [rules,setRules] = useState<TaxJurisdiction[]>([]);
  const [draft,setDraft] = useState(blank);
  const [editing,setEditing] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [zip,setZip] = useState('');
  const [state,setState] = useState('');
  const [taxable,setTaxable] = useState(true);
  const [assigned,setAssigned] = useState<string[]>([]);
  const [changes,setChanges] = useState<Array<{ id:string;zip:string;state:string;change_type:string }>>([]);
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(0);
  const [total,setTotal] = useState(0);
  const [lastSync,setLastSync] = useState<string | null>(null);
  const [view,setView] = useState('rules');
  const [changeToResolve,setChangeToResolve] = useState<string | null>(null);
  const load = async () => {
    const [r,s] = await Promise.all([supabase.from('tax_jurisdictions').select('*').order('state').order('kind'),supabase.from('tax_zip_sync_runs').select('created_at').order('created_at',{ascending:false}).limit(1)]);
    if(r.error) {setError(r.error.message);return;} setRules(r.data || []); setLastSync(s.data?.[0]?.created_at || null);
  };
  useEffect(()=>{ if(permitted) void load(); },[permitted]);
  useEffect(()=>{
    if(!permitted) return;
    let cancelled=false;
    const timer=setTimeout(async()=>{
      let q=supabase.from('tax_zip_changes').select('id,zip,state,change_type',{count:'exact'}).is('resolved_at',null).order('detected_at',{ascending:false}).order('zip').range(page*50,page*50+49);
      if(search) q=q.or(`zip.ilike.${search.replace(/[^a-zA-Z0-9]/g,'')}%,state.ilike.${search.replace(/[^a-zA-Z0-9]/g,'')}%`);
      const {data,error,count}=await q;
      if(cancelled)return;
      if(error) setError(error.message); else {setChanges(data || []);setTotal(count || 0);}
    },200);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[permitted,search,page,busy]);
  const run = async (action:()=>Promise<void>) => {
    setBusy(true);setError('');try {await action();await load();toast({title:'Tax settings saved'});} catch(e) {setError(e instanceof Error ? e.message : String(e));} finally {setBusy(false);}
  };
  const saveRule = () => run(async()=>{
    const values={...draft,state:draft.state.toUpperCase().trim(),rate:draft.rate === '' ? null : Number(draft.rate),shipment_fee:Number(draft.shipment_fee)};
    const q=editing ? supabase.from('tax_jurisdictions').update(values).eq('id',editing) : supabase.from('tax_jurisdictions').insert(values);
    const {error}=await q;if(error)throw error;setDraft(blank);setEditing(null);
  });
  const loadZip = async (code=zip,region=state) => {
    const [z,a]=await Promise.all([supabase.from('tax_zip_codes').select('*').eq('zip',code).eq('state',region.toUpperCase()).maybeSingle(),supabase.from('tax_zip_jurisdictions').select('jurisdiction_id').eq('zip',code).eq('state',region.toUpperCase())]);
    if(z.error||a.error){setError(z.error?.message||a.error?.message||'Unable to load ZIP');return;}
    setZip(code);setState(region.toUpperCase());setTaxable(z.data?.is_taxable ?? true);setAssigned((a.data || []).map(x=>x.jurisdiction_id));
  };
  const saveZip = () => run(async()=>{
    const region=state.toUpperCase();
    const {error}=await supabase.rpc('save_tax_zip_assignment',{p_zip:zip,p_state:region,p_is_taxable:taxable,p_jurisdiction_ids:assigned,p_change_id:changeToResolve});
    if(error)throw error;setChangeToResolve(null);
  });
  if(rolesLoading) return <p>Loading tax settings…</p>;
  if(!permitted) return <p className="text-muted-foreground">Tax settings are restricted to Admin and Accounting.</p>;
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">Sales tax jurisdictions</h2><p className="text-sm text-muted-foreground">Monthly ZIP review · {lastSync ? `Last checked ${new Date(lastSync).toLocaleDateString()}` : 'No completed directory check'}</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Tabs value={view} onValueChange={setView}>
      <TabsList><TabsTrigger value="rules">Jurisdictions</TabsTrigger><TabsTrigger value="assign">ZIP assignments</TabsTrigger><TabsTrigger value="changes">New / unmatched ZIPs ({total})</TabsTrigger></TabsList>
      <TabsContent value="rules" className="space-y-5">
        <form className="space-y-4 border-b pb-5" onSubmit={e=>{e.preventDefault();void saveRule();}}>
          <h3 className="font-medium">{editing ? 'Edit jurisdiction' : 'Add jurisdiction'}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label htmlFor="tax-name">Name</Label><Input id="tax-name" required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></div>
            <div><Label>Jurisdiction</Label><Select value={draft.kind} onValueChange={kind=>setDraft({...draft,kind})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['state','county','city','special_district'].map(k=><SelectItem value={k} key={k}>{k.replace('_',' ')}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="tax-state">State</Label><Input id="tax-state" maxLength={2} minLength={2} required value={draft.state} onChange={e=>setDraft({...draft,state:e.target.value.toUpperCase()})}/></div>
            <div><Label htmlFor="tax-rate">Rate (%)</Label><Input id="tax-rate" type="number" step="0.0001" min="0" max="100" value={draft.rate} onChange={e=>setDraft({...draft,rate:e.target.value})}/></div>
            <div><Label htmlFor="tax-fee">Fee per shipment ($)</Label><Input id="tax-fee" type="number" step="0.01" min="0" value={draft.shipment_fee} onChange={e=>setDraft({...draft,shipment_fee:e.target.value})}/></div>
            {(['is_taxable','tax_shipping','active'] as const).map(key=><div key={key} className="flex gap-2 items-center"><Switch id={`rule-${key}`} checked={draft[key]} onCheckedChange={v=>setDraft({...draft,[key]:v})}/><Label htmlFor={`rule-${key}`}>{key==='is_taxable'?'Taxable':key==='tax_shipping'?'Tax shipping':'Active'}</Label></div>)}
          </div><div className="flex gap-2"><Button disabled={busy} type="submit"><Save className="h-4 w-4 mr-2"/>Save jurisdiction</Button>{editing && <Button type="button" variant="outline" onClick={()=>{setEditing(null);setDraft(blank);}}>Cancel</Button>}</div>
        </form>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">State</th><th>Name</th><th>Type</th><th>Rate</th><th>Shipment fee</th><th>Status</th><th/></tr></thead><tbody>{rules.map(r=><tr key={r.id} className="border-b"><td className="p-2">{r.state}</td><td>{r.name}</td><td>{r.kind.replace('_',' ')}</td><td>{r.rate === null ? 'Unconfigured' : `${r.rate}%`}</td><td>${r.shipment_fee.toFixed(2)}</td><td>{!r.active?'Inactive':!r.is_taxable?'Exempt':'Taxable'}</td><td><Button variant="ghost" size="icon" aria-label={`Edit ${r.name}`} onClick={()=>{setEditing(r.id);setDraft({...r,rate:r.rate === null?'':String(r.rate),shipment_fee:String(r.shipment_fee)});}}><Pencil className="h-4 w-4"/></Button></td></tr>)}</tbody></table></div>
      </TabsContent>
      <TabsContent value="assign" className="space-y-4">
        <div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="assign-zip">ZIP</Label><Input id="assign-zip" value={zip} maxLength={5} onChange={e=>{setZip(e.target.value);setChangeToResolve(null);}}/></div><div><Label htmlFor="assign-state">State</Label><Input id="assign-state" maxLength={2} value={state} onChange={e=>{setState(e.target.value.toUpperCase());setAssigned([]);setChangeToResolve(null);}}/></div><Button variant="outline" onClick={()=>void loadZip()}><Search className="h-4 w-4 mr-2"/>Load ZIP</Button></div>
        <div className="flex gap-2 items-center"><Switch id="zip-taxable" checked={taxable} onCheckedChange={setTaxable}/><Label htmlFor="zip-taxable">Taxable ship-to ZIP</Label></div>
        <div className="grid gap-3 sm:grid-cols-2">{rules.filter(r=>r.state===state).map(r=><Label key={r.id} className="flex items-center gap-2"><Checkbox checked={assigned.includes(r.id)} onCheckedChange={checked=>setAssigned(checked?[...assigned,r.id]:assigned.filter(id=>id!==r.id))}/>{r.name} · {r.kind.replace('_',' ')}</Label>)}</div>
        <Button disabled={busy || !/^\d{5}$/.test(zip) || !/^[A-Z]{2}$/.test(state)} onClick={()=>void saveZip()}><Save className="h-4 w-4 mr-2"/>Save assignments & mark reviewed</Button>
      </TabsContent>
      <TabsContent value="changes" className="space-y-4">
        <Label htmlFor="zip-search">Search ZIP or state</Label><Input id="zip-search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">ZIP</th><th>State</th><th>Change</th><th/></tr></thead><tbody>{changes.map(c=><tr key={c.id} className="border-b"><td className="p-2">{c.zip}</td><td>{c.state}</td><td>{c.change_type}</td><td className="text-right"><Button variant="outline" size="sm" onClick={()=>{void loadZip(c.zip,c.state);setChangeToResolve(c.id);setView('assign');}}><Plus className="h-4 w-4 mr-1"/>Review</Button>{c.change_type==='removed' && <Button variant="ghost" size="sm" disabled={busy} onClick={()=>void run(async()=>{const {error}=await supabase.from('tax_zip_changes').update({resolved_at:new Date().toISOString()}).eq('id',c.id);if(error)throw error;})}>Acknowledge removal</Button>}</td></tr>)}</tbody></table></div>
        {!changes.length && <p className="text-muted-foreground">No matching ZIP changes.</p>}
        <div className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Previous ZIP page" disabled={page===0} onClick={()=>setPage(page-1)}><ChevronLeft className="h-4 w-4"/></Button><span className="text-sm">Page {page+1} · {total} pending</span><Button variant="outline" size="icon" aria-label="Next ZIP page" disabled={(page+1)*50>=total} onClick={()=>setPage(page+1)}><ChevronRight className="h-4 w-4"/></Button></div>
      </TabsContent>
    </Tabs>
  </section>;
}