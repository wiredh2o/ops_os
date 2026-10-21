import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRequestRma, canReviewRma, canReceiveRma, canAddRmaTracking, RMA_LABEL_CARRIERS, rmaRequestSchema } from './rma';

for (const role of ['car_wash_admin', 'car_wash_employee', 'distributor_admin', 'distributor_employee']) {
  test(`${role} may request an RMA but cannot approve it`, () => { assert.equal(canRequestRma([role]), true); assert.equal(canReviewRma([role]), false); });
}
for (const role of ['admin', 'sales_support', 'tech_support']) {
  test(`${role} can review and receive an RMA`, () => { assert.equal(canReviewRma([role]), true); assert.equal(canReceiveRma([role]), true); });
}
test('unrelated roles cannot request or approve', () => { assert.equal(canRequestRma(['vendor_admin','marketing']), false); assert.equal(canReviewRma(['production']), false); });
test('combined roles retain requester and reviewer access', () => { assert.equal(canRequestRma(['car_wash_employee','tech_support']), true); assert.equal(canReviewRma(['car_wash_employee','tech_support']), true); });
test('tracking is only editable after issue and before receipt', () => { assert.equal(canAddRmaTracking('issued'), true); assert.equal(canAddRmaTracking('in_transit'), true); for (const status of ['requested','appointment_invited','received']) assert.equal(canAddRmaTracking(status), false); });
test('purchased return labels exclude USPS', () => { assert.deepEqual(RMA_LABEL_CARRIERS, ['ups','fedex']); });
test('staff-only tray is not required for an external request', () => { assert.equal(rmaRequestSchema.safeParse({items:[{item_name:'Controller',quantity:1}],problem:'Will not power on',returnAddress:'',customerPo:''}).success,true); });
test('invalid items cannot be submitted', () => { assert.equal(rmaRequestSchema.safeParse({items:[{item_name:'',quantity:0}],problem:'Power failure',returnAddress:'',customerPo:''}).success,false); });