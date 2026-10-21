import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { carrierAllowedForDropShip, dropShipLabelRecipient, dropShipNotificationChannels, type DropShipAddress } from './drop-ship';

const base: DropShipAddress = { id: '1', recipient_name: 'Sparkle Car Wash', address: '1 Main', city: 'Denver', state: 'CO', zip: '80202', country: 'US', usps_eligible: false, signature_required: false, is_taxable: true, email: null, phone: null };

test('USPS is blocked unless the drop-ship address is USPS eligible', () => {
  assert.equal(carrierAllowedForDropShip('usps', base), false);
  assert.equal(carrierAllowedForDropShip('USPS', base), false);
  assert.equal(carrierAllowedForDropShip('usps', { usps_eligible: true }), true);
});

test('UPS and FedEx may ship to any drop-ship address', () => {
  assert.equal(carrierAllowedForDropShip('ups', base), true);
  assert.equal(carrierAllowedForDropShip('fedex', base), true);
});

test('drop-ship notices go to whichever of email and phone are present', () => {
  assert.deepEqual(dropShipNotificationChannels(base), []);
  assert.deepEqual(dropShipNotificationChannels({ email: 'a@b.com', phone: null }), ['email']);
  assert.deepEqual(dropShipNotificationChannels({ email: null, phone: '3035551234' }), ['text']);
  assert.deepEqual(dropShipNotificationChannels({ email: 'a@b.com', phone: '3035551234' }), ['email', 'text']);
});

test('label recipient is only the car wash name', () => {
  assert.deepEqual(dropShipLabelRecipient(base, '555'), { name: '', company: 'Sparkle Car Wash', phone: '555' });
});
