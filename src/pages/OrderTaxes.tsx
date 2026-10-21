import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { TaxLines } from '@/components/production/TaxLines';
export default function OrderTaxes() {
  const [orders,setOrders] = useState<Array<{order_id:string;order_number:string;order_kind:string;tax_lines:unknown;tax_amount:number;tax_review_required:boolean}>>([]);
  const [search,setSearch] = useState('');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(()=>{ let cancelled=false;
    (async()=>{
      const rows:typeof orders=[];
      for(let from=0;;from+=1000){const {data,error}=await supabase.rpc('get_company_order_tax_summaries').order('created_at',{ascending:false}).order('order_id').range(from,from+999);if(error)throw error;rows.push(...(data || []));if((data || []).length<1000)break;}
      if(!cancelled)setOrders(rows);
    })().catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[]);
  return <main className="container py-6 space-y-5"><h1 className="text-2xl font-semibold">Order tax details</h1><Input aria-label="Search order number" placeholder="Search order number" value={search} onChange={e=>setSearch(e.target.value)}/>{error && <p role="alert" className="text-destructive">{error}</p>}{loading && <p>Loading orders…</p>}<div className="divide-y">{orders.filter(o=>o.order_number.toLowerCase().includes(search.toLowerCase())).map(o=><section key={`${o.order_kind}-${o.order_id}`} className="py-4 grid gap-3 sm:grid-cols-2"><div><h2 className="font-medium">{o.order_number}</h2><span className="text-sm text-muted-foreground">{o.order_kind==='invoice'?'Invoice':'Customer order'}</span></div><TaxLines lines={o.tax_lines} legacyAmount={o.tax_amount} reviewRequired={o.tax_review_required}/></section>)}</div>{!loading && !error && !orders.length && <p className="text-muted-foreground">No company orders.</p>}</main>;
}