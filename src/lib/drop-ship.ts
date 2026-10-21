/** Drop-ship addresses are owned by a distributor and never linked to a car-wash account. */
export interface DropShipAddress {
  id: string;
  owner_company_id?: string;
  recipient_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  usps_eligible: boolean;
  signature_required: boolean;
  is_taxable: boolean;
  email: string | null;
  phone: string | null;
}

/** Shape saved on orders/invoices; `name` mirrors recipient_name so address displays work unchanged. */
export interface DropShipSnapshot extends DropShipAddress {
  drop_ship: true;
  name: string;
}

export function isDropShipSnapshot(value: unknown): value is DropShipSnapshot {
  return !!value && typeof value === 'object' && (value as { drop_ship?: unknown }).drop_ship === true;
}

export function toDropShipSnapshot(address: DropShipAddress): DropShipSnapshot {
  return { ...address, drop_ship: true, name: address.recipient_name };
}

/** USPS may only be used for a drop-ship once the address is flagged USPS eligible. */
export function carrierAllowedForDropShip(carrier: string, dropShip: Pick<DropShipAddress, 'usps_eligible'> | null | undefined) {
  if (!dropShip) return true;
  return carrier.toLowerCase() !== 'usps' || dropShip.usps_eligible === true;
}

/** Optional email/phone on the address are a request to notify whichever are present. */
export function dropShipNotificationChannels(dropShip: Pick<DropShipAddress, 'email' | 'phone'>): ('email' | 'text')[] {
  const channels: ('email' | 'text')[] = [];
  if (dropShip.email?.trim()) channels.push('email');
  if (dropShip.phone?.trim()) channels.push('text');
  return channels;
}

/** Carrier label recipient: only the car wash name, never the distributor or a contact person. */
export function dropShipLabelRecipient(dropShip: DropShipAddress, fallbackPhone?: string | null) {
  return { name: '', company: dropShip.recipient_name, phone: dropShip.phone || fallbackPhone || undefined };
}
