import { describe, expect, it } from 'vitest';
import { carrierAllowedForDropShip, dropShipLabelRecipient, dropShipNotificationChannels, type DropShipAddress } from './drop-ship';

const base: DropShipAddress = { id: '1', recipient_name: 'Sparkle Car Wash', address: '1 Main', city: 'Denver', state: 'CO', zip: '80202', country: 'US', usps_eligible: false, signature_required: false, is_taxable: true, email: null, phone: null };

describe('drop-ship rules', () => {
  it('blocks USPS unless the address is USPS eligible', () => {
    expect(carrierAllowedForDropShip('usps', base)).toBe(false);
    expect(carrierAllowedForDropShip('usps', { usps_eligible: true })).toBe(true);
  });
  it('allows UPS and FedEx to any drop-ship address', () => {
    expect(carrierAllowedForDropShip('ups', base)).toBe(true);
    expect(carrierAllowedForDropShip('fedex', base)).toBe(true);
  });
  it('notifies whichever of email and phone are present', () => {
    expect(dropShipNotificationChannels(base)).toEqual([]);
    expect(dropShipNotificationChannels({ email: 'a@b.com', phone: null })).toEqual(['email']);
    expect(dropShipNotificationChannels({ email: null, phone: '3035551234' })).toEqual(['text']);
    expect(dropShipNotificationChannels({ email: 'a@b.com', phone: '3035551234' })).toEqual(['email', 'text']);
  });
  it('shows only the car wash name as the label recipient', () => {
    expect(dropShipLabelRecipient(base, '555')).toEqual({ name: '', company: 'Sparkle Car Wash', phone: '555' });
  });
});
