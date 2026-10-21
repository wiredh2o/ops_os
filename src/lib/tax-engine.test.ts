import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateJurisdictionTax, type TaxInput, type TaxModel } from './tax-engine';
const model: TaxModel = { jurisdictions: [
  { id:'s', name:'Colorado', kind:'state', state:'CO', rate:2, is_taxable:true, tax_shipping:false, shipment_fee:0.29, active:true },
  ...['county','city','special_district'].map((kind,i) => ({ id:kind, name:kind, kind, state:'CO', rate:i+1, is_taxable:true, tax_shipping:false, shipment_fee:0, active:true })),
  { id:'n', name:'Exempt state', kind:'state', state:'OR', rate:0, is_taxable:false, tax_shipping:false, shipment_fee:0, active:true }
], zips:[{ zip:'80202',state:'CO',is_taxable:true,reviewed:true }], assignments:['county','city','special_district'].map(jurisdiction_id => ({ zip:'80202',state:'CO',jurisdiction_id })) };
const input: TaxInput = { customerIsTaxable:true, destination:{ state:'CO',zip:'80202',is_taxable:true }, items:[{ amount:100,item_type:'inventory_item',is_taxable:true },{ amount:50,item_type:'labor',is_taxable:true },{ amount:25,item_type:'assembly',is_taxable:false }],shipping:20,shipments:1 };
test('taxable customer is required',()=>assert.equal(calculateJurisdictionTax(model,{...input,customerIsTaxable:false}).taxAmount,0));
test('distributors are exempt',()=>assert.equal(calculateJurisdictionTax(model,{...input,distributor:true}).taxAmount,0));
test('ship-to must be taxable',()=>assert.equal(calculateJurisdictionTax(model,{...input,destination:{...input.destination,is_taxable:false}}).taxAmount,0));
test('labor is never taxable even when marked taxable',()=>assert.equal(calculateJurisdictionTax(model,{...input,items:[input.items[1]]}).taxAmount,0));
test('nontaxable lines are excluded',()=>assert.equal(calculateJurisdictionTax(model,{...input,items:[input.items[2]]}).taxAmount,0));
test('separate state county city district lines plus $0.29 Colorado shipment fee',()=>{ const result=calculateJurisdictionTax(model,input); assert.equal(result.taxAmount,8.29); assert.deepEqual(result.taxLines.map(l=>l.amount),[2,0.29,1,2,3]); });
test('state trumps mismatched ZIP assignments',()=>assert.equal(calculateJurisdictionTax(model,{...input,destination:{state:'OR',zip:'80202'}}).taxAmount,0));
test('state exemption overrides taxable ZIP',()=>assert.equal(calculateJurisdictionTax({...model,jurisdictions:model.jurisdictions.map(j=>j.id==='s'?{...j,is_taxable:false}:j)},input).taxAmount,0));
test('shipping is untaxed unless a rule requires it',()=>{ const next={...model,jurisdictions:model.jurisdictions.map(j=>j.id==='s'?{...j,tax_shipping:true}:j)}; assert.equal(calculateJurisdictionTax(next,input).taxAmount,8.69); });
test('fee is per shipment, not per package or item',()=>assert.equal(calculateJurisdictionTax(model,{...input,shipments:2}).taxAmount,8.58));
test('pickup has no shipment fee',()=>assert.equal(calculateJurisdictionTax(model,{...input,shipments:0}).taxAmount,8));
test('unmatched ZIP requires review without inventing local rates',()=>{ const r=calculateJurisdictionTax(model,{...input,destination:{state:'CO',zip:'99999'}}); assert.equal(r.taxAmount,2.29); assert.equal(r.reviewRequired,true); });
test('unset state rate requires review',()=>assert.equal(calculateJurisdictionTax({...model,jurisdictions:model.jurisdictions.map(j=>j.id==='s'?{...j,rate:null}:j)},input).reviewRequired,true));