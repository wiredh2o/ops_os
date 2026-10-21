export interface TaxLine { jurisdiction_id: string; name: string; kind: string; rate: number; taxable_amount: number; amount: number; type: string }
export interface TaxJurisdiction { id: string; name: string; kind: string; state: string; rate: number | null; is_taxable: boolean; tax_shipping: boolean; shipment_fee: number; active: boolean }
export interface TaxModel { jurisdictions: TaxJurisdiction[]; zips: Array<{ zip: string; state: string; is_taxable: boolean; reviewed: boolean }>; assignments: Array<{ zip: string; state: string; jurisdiction_id: string }> }
export interface TaxInput { customerIsTaxable: boolean; distributor?: boolean; destination: { state?: string; zip?: string; is_taxable?: boolean } | null; items: Array<{ amount: number; item_type: string; is_taxable: boolean }>; shipping?: number; shipments?: number }
export const roundTax = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function calculateJurisdictionTax(model: TaxModel, input: TaxInput) {
  const taxLines: TaxLine[] = [];
  const empty = (reviewRequired = false) => ({ taxLines, taxAmount: 0, reviewRequired });
  if (!input.customerIsTaxable || input.distributor || input.destination?.is_taxable === false) return empty();
  const base = input.items.filter(i => i.is_taxable && i.item_type !== 'labor').reduce((n, i) => n + i.amount, 0);
  if (base <= 0) return empty();
  const state = input.destination?.state?.trim().toUpperCase();
  const zip = input.destination?.zip?.slice(0, 5);
  const stateRule = model.jurisdictions.find(j => j.active && j.kind === 'state' && j.state === state);
  if (!stateRule) return empty(true);
  if (!stateRule.is_taxable) return empty();
  const zipRule = model.zips.find(z => z.zip === zip && z.state === state);
  // State trumps ZIP: a non-taxable ZIP only removes local jurisdictions, never the state tax.
  const assigned = new Set(zipRule?.is_taxable === false ? [] : model.assignments.filter(a => a.zip === zip && a.state === state).map(a => a.jurisdiction_id));
  const rank = ['state', 'county', 'city', 'special_district'];
  for (const j of model.jurisdictions.filter(j => j.active && j.is_taxable && j.state === state && (j.id === stateRule.id || assigned.has(j.id))).sort((a,b) => rank.indexOf(a.kind)-rank.indexOf(b.kind))) {
    const taxable = base + (j.tax_shipping ? input.shipping || 0 : 0);
    const amount = roundTax(taxable * (j.rate || 0) / 100);
    if (amount) taxLines.push({ jurisdiction_id: j.id, name: j.name, kind: j.kind, rate: j.rate || 0, taxable_amount: taxable, amount, type: 'sales_tax' });
    const fee = roundTax(j.shipment_fee * Math.max(input.shipments ?? 1, 0));
    if (fee) taxLines.push({ jurisdiction_id: j.id, name: `${j.name} delivery fee`, kind: j.kind, rate: 0, taxable_amount: 0, amount: fee, type: 'shipment_fee' });
  }
  return { taxLines, taxAmount: roundTax(taxLines.reduce((n,l) => n+l.amount,0)), reviewRequired: stateRule.rate === null || !zipRule?.reviewed };
}
export function parseTaxLines(value: unknown): TaxLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((l): l is TaxLine => l !== null && typeof l === 'object' && typeof l.name === 'string' && typeof l.amount === 'number');
}