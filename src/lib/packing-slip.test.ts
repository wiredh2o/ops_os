import { describe, it, expect } from 'vitest';
import { buildPackingSlipHtml, type PackingSlipData } from './packing-slip';

const base: PackingSlipData = {
  orderNumber: 'CO-1001',
  customerPo: 'PO-55',
  companyName: 'Suds & Shine',
  orderDate: 'Oct 21, 2026',
  shipTo: { name: 'Suds & Shine', address: '12 Main St', city: 'Denver', state: 'CO', zip: '80202' },
  items: [
    { sku: 'PUMP-1', description: 'High pressure pump', quantity: 2 },
    { sku: 'HOSE-9', description: '9ft hose', quantity: 4 },
  ],
  notes: 'Fragile',
};

describe('buildPackingSlipHtml', () => {
  it('lists SKUs, descriptions and quantities with a packed checkbox column', () => {
    const html = buildPackingSlipHtml(base);
    expect(html).toContain('PUMP-1');
    expect(html).toContain('High pressure pump');
    expect(html).toContain('<td class="qty">4</td>');
    expect(html).toContain('Packed');
  });

  it('never renders prices or currency amounts', () => {
    const html = buildPackingSlipHtml(base);
    expect(html).not.toContain('$');
    expect(html.toLowerCase()).not.toContain('price');
    expect(html.toLowerCase()).not.toContain('total');
  });

  it('shows the order number, customer PO and ship-to address', () => {
    const html = buildPackingSlipHtml(base);
    expect(html).toContain('CO-1001');
    expect(html).toContain('PO-55');
    expect(html).toContain('12 Main St');
    expect(html).toContain('Denver');
  });

  it('marks drop-ship slips and shows only the car wash name as recipient', () => {
    const html = buildPackingSlipHtml({
      ...base,
      isDropShip: true,
      shipTo: { name: 'Mountain Wash', address: '1 Pine Rd', city: 'Boulder', state: 'CO', zip: '80301' },
    });
    expect(html).toContain('Drop-ship');
    expect(html).toContain('Mountain Wash');
    expect(html).not.toContain('Distributor Inc');
  });
});
