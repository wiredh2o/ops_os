import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRmaRequests } from '@/hooks/useRmaRequests';
import { supabase } from '@/integrations/supabase/client';
import { canRequestRma, canReviewRma, canReceiveRma, canAddRmaTracking, getRmaItems, rmaRequestSchema, rmaStatusLabel, type RmaItem, type RmaRequest } from '@/lib/rma';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ClipboardCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { RepairStatusLookup } from '@/components/customer-service/RepairStatusLookup';

export default function RmaRequests() {
  const { roles, rolesLoading, rolesError, user } = useAuth();
  const requests = useRmaRequests();
  const [items, setItems] = useState<RmaItem[]>([{ item_name: '', quantity: 1, serial_number: '', mac_address: '' }]);
  const [problem, setProblem] = useState('');
  const [returnAddress, setReturnAddress] = useState('');
  const [customerPo, setCustomerPo] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  if (rolesLoading) return <div className="container p-6" role="status">Loading…</div>;
  if (rolesError) return <div className="container p-6" role="alert">Unable to load your access.</div>;
  if (!canRequestRma(roles) && !canReceiveRma(roles)) return <Navigate to="/" replace />;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = rmaRequestSchema.safeParse({ items, problem, returnAddress, customerPo });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || 'Check the request details'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('submit_rma', { p_items: parsed.data.items, p_problem: parsed.data.problem, p_return_address: returnAddress, p_customer_po: customerPo });
      if (error) throw error;
      toast.success('RMA request submitted'); setProblem(''); setItems([{item_name:'',quantity:1,serial_number:'',mac_address:''}]);
      await requests.refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to submit request'); }
    finally { setBusy(false); }
  };
  return <div className="container py-8 space-y-8">
    <header className="flex items-center justify-between gap-4"><h1 className="text-3xl font-bold flex items-center gap-3"><ClipboardCheck className="h-7 w-7 text-primary" />RMA Requests</h1><Button variant="outline" size="icon" aria-label="Refresh RMAs" onClick={() => requests.refetch()}><RefreshCw className="h-4 w-4" /></Button></header>
    {canRequestRma(roles) && <form onSubmit={submit} className="space-y-4 border-b pb-8">
      <h2 className="text-xl font-semibold">Request a return</h2>
      {items.map((item, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_80px_1fr_1fr_40px] gap-3 items-end">
        {(['item_name','quantity','serial_number','mac_address'] as const).map(field => <div key={field} className="space-y-1"><Label htmlFor={`rma-${index}-${field}`}>{({item_name:'Item',quantity:'Qty',serial_number:'Serial number',mac_address:'MAC address'})[field]}</Label><Input id={`rma-${index}-${field}`} type={field==='quantity'?'number':'text'} min={field==='quantity'?1:undefined} max={field==='quantity'?1000:undefined} required={field==='item_name'||field==='quantity'} value={item[field] || ''} onChange={event => setItems(current => current.map((entry,i) => i===index ? {...entry,[field]:field==='quantity'?Number(event.target.value):event.target.value}:entry))} /></div>)}
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove item ${index+1}`} disabled={items.length===1} onClick={() => setItems(current=>current.filter((_,i)=>i!==index))}><Trash2 className="h-4 w-4" /></Button>
      </div>)}
      <Button type="button" variant="outline" disabled={items.length>=100} onClick={()=>setItems(current=>[...current,{item_name:'',quantity:1,serial_number:'',mac_address:''}])}><Plus className="h-4 w-4 mr-2" />Add item</Button>
      <div className="space-y-1"><Label htmlFor="rma-problem">Reported problem</Label><Textarea id="rma-problem" value={problem} onChange={event=>setProblem(event.target.value)} required maxLength={10000} /></div>
      <div className="grid sm:grid-cols-2 gap-4"><div className="space-y-1"><Label htmlFor="rma-return-address">Return shipping address (optional)</Label><Textarea id="rma-return-address" value={returnAddress} onChange={event=>setReturnAddress(event.target.value)} maxLength={2000} /></div><div className="space-y-1"><Label htmlFor="rma-po">Customer PO (optional)</Label><Input id="rma-po" value={customerPo} onChange={event=>setCustomerPo(event.target.value)} maxLength={255} /></div></div>
      <Button disabled={busy}>{busy?'Submitting…':'Submit request'}</Button>
    </form>}
    <section className="space-y-4"><h2 className="text-xl font-semibold">{canReceiveRma(roles)?'Requests and approvals':'My RMAs'}</h2><Input aria-label="Search RMAs" placeholder="Search RMA, tracking or item…" value={search} onChange={event=>setSearch(event.target.value)} />
      {requests.isLoading && <p role="status">Loading RMAs…</p>}{requests.error && <p role="alert" className="text-destructive">Unable to load RMAs. Please refresh.</p>}
      {(requests.data || []).filter(rma=>[rma.rma_number,rma.tracking_number,rma.problem_reported,JSON.stringify(rma.items)].join(' ').toLowerCase().includes(search.toLowerCase())).map(rma=><RmaEntry key={rma.id} rma={rma} reviewer={canReviewRma(roles)} owner={rma.requester_id===user?.id} onChange={()=>requests.refetch()} />)}
      {!requests.isLoading && !requests.error && requests.data?.length===0 && <p className="text-muted-foreground">No RMA requests yet.</p>}
    </section>
  </div>;
}

function RmaEntry({rma, reviewer, owner, onChange}:{rma:RmaRequest;reviewer:boolean;owner:boolean;onChange:()=>unknown}) {
  const [tracking,setTracking]=useState(rma.tracking_number || '');
  const [carrier,setCarrier]=useState(rma.carrier || 'ups');
  const [notes,setNotes]=useState('');
  const [appointment,setAppointment]=useState('');
  const [meeting,setMeeting]=useState('');
  const [busy,setBusy]=useState(false);
  const [showStatus,setShowStatus]=useState(false);
  const act = async (action: 'issue'|'appointment'|'tracking') => {
    setBusy(true);
    try {
      const {error}=action==='tracking' ? await supabase.rpc('set_rma_tracking',{p_id:rma.id,p_tracking:tracking,p_carrier:carrier}) : await supabase.rpc('review_rma',{p_id:rma.id,p_action:action,p_notes:notes,p_appointment_at:appointment?new Date(appointment).toISOString():undefined,p_appointment_url:meeting});
      if(error) throw error;
      toast.success(action==='issue'?'RMA issued':action==='appointment'?'Appointment invitation saved':'Tracking saved');
      window.dispatchEvent(new CustomEvent('package-updated')); onChange();
    } catch(error) { toast.error(error instanceof Error?error.message:'Unable to update RMA'); }
    finally {setBusy(false);}
  };
  return <article className="border rounded-md p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{rma.rma_number}</h3><Badge variant="secondary">{rmaStatusLabel(rma.status)}</Badge></div>
    {reviewer && <p className="text-xs text-muted-foreground">Company account: {rma.company_id}</p>}
    <p className="whitespace-pre-wrap">{rma.problem_reported}</p>
    <ul className="text-sm space-y-1">{getRmaItems(rma.items).map((item,index)=><li key={index}>{item.quantity} × {item.item_name}{item.serial_number?` · Serial ${item.serial_number}`:''}{item.mac_address?` · MAC ${item.mac_address}`:''}</li>)}</ul>
    {rma.tracking_number && <p className="text-sm">{rma.carrier?.toUpperCase()} · {rma.tracking_number}</p>}
    {rma.review_notes && <p className="text-sm whitespace-pre-wrap">{rma.review_notes}</p>}
    {rma.appointment_at && <p className="text-sm">Appointment: {new Date(rma.appointment_at).toLocaleString()} {rma.appointment_url?.startsWith('https://') && <a className="text-primary underline" href={rma.appointment_url} target="_blank" rel="noopener noreferrer">Join appointment</a>}</p>}
    {reviewer && ['requested','appointment_invited'].includes(rma.status) && <div className="space-y-3 border-t pt-4"><Label htmlFor={`review-${rma.id}`}>Reviewer notes</Label><Textarea id={`review-${rma.id}`} value={notes} onChange={event=>setNotes(event.target.value)} /><div className="flex flex-wrap gap-3"><Input aria-label="Tech-support appointment date" type="datetime-local" value={appointment} onChange={event=>setAppointment(event.target.value)} className="sm:w-auto" /><Input aria-label="Tech-support meeting link" type="url" placeholder="https://…" value={meeting} onChange={event=>setMeeting(event.target.value)} className="sm:w-auto" /></div><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>act('issue')}>Issue RMA</Button><Button variant="outline" disabled={busy || !appointment || !meeting} onClick={()=>act('appointment')}>Invite tech-support appointment</Button></div></div>}
    {owner && canAddRmaTracking(rma.status) && <div className="border-t pt-4 space-y-3"><div className="flex flex-wrap gap-2"><Select value={carrier} onValueChange={setCarrier}><SelectTrigger className="w-36" aria-label="Return carrier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ups">UPS</SelectItem><SelectItem value="fedex">FedEx</SelectItem><SelectItem value="other">Other carrier</SelectItem></SelectContent></Select><Input className="sm:w-72" aria-label="Return tracking number" value={tracking} onChange={event=>setTracking(event.target.value)} /><Button disabled={busy || tracking.trim().length<5} onClick={()=>act('tracking')}>Save tracking</Button></div><p className="text-sm text-muted-foreground">UPS/FedEx label purchasing is unavailable until payment and carrier services are connected.</p></div>}
    {rma.inbound_package_id && <><Button variant="outline" onClick={()=>setShowStatus(value=>!value)}>{showStatus?'Hide repair status':'View repair status'}</Button>{showStatus && <RepairStatusLookup rmaId={rma.id} />}</>}
  </article>;
}