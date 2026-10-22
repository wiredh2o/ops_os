import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildPackingSlipHtml, packingSlipDestination, shipmentPackingSlipItems, type PackingSlipData } from './packing-slip';

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

test('partial shipment prints allocated quantity, not the requested quantity', () => {
  const allocatedLines = [
    { item_name: 'Pump', item_sku: 'PUMP-1', item_type: 'inventory_item', quantity: 2, quantity_ordered: 10 },
  ];
  const items = shipmentPackingSlipItems(allocatedLines);
  assert.deepEqual(items, [{ sku: 'PUMP-1', description: 'Pump', quantity: 2 }]);
});

test('shipment contents exclude labor and zero-quantity lines', () => {
  assert.deepEqual(shipmentPackingSlipItems([
    { item_name: 'Labor', item_type: 'labor', quantity: 3 },
    { item_name: 'Backorder', item_type: 'assembly', quantity: 0 },
    { item_name: 'Valve', item_type: 'inventory_item', quantity: 4 },
  ]), [{ sku: 'Valve', description: 'Valve', quantity: 4 }]);
});

test('saved drop-ship destination overrides company default and uses car wash recipient', () => {
  assert.deepEqual(packingSlipDestination(
    { recipient_name: 'Mountain Wash', address: '1 Pine Rd', city: 'Boulder', state: 'CO', zip: '80301' },
    [{ id: 'default', address: 'Distributor warehouse' }], 'default', 'Distributor Inc'
  ), { name: 'Mountain Wash', address: '1 Pine Rd', city: 'Boulder', state: 'CO', zip: '80301' });
});

test('uses company default and refuses an ambiguous destination', () => {
  const addresses = [{ id: 'a', address: '12 Main St' }, { id: 'b', address: '90 West St' }];
  assert.equal(packingSlipDestination(null, JSON.stringify(addresses), 'b', 'Wash')?.address, '90 West St');
  assert.equal(packingSlipDestination(null, addresses, null, 'Wash'), null);
});

test('lists SKUs, descriptions and quantities with a packed checkbox column', () => {
  const html = buildPackingSlipHtml(base);
  assert.ok(html.includes('PUMP-1'));
  assert.ok(html.includes('High pressure pump'));
  assert.ok(html.includes('<td class="qty">4</td>'));
  assert.ok(html.includes('Packed'));
});

test('never renders prices or currency amounts', () => {
  const html = buildPackingSlipHtml(base);
  assert.ok(!html.includes('$'));
  assert.ok(!html.toLowerCase().includes('price'));
  assert.ok(!html.toLowerCase().includes('total'));
});

test('shows the order number, customer PO and ship-to address', () => {
  const html = buildPackingSlipHtml(base);
  assert.ok(html.includes('CO-1001'));
  assert.ok(html.includes('PO-55'));
  assert.ok(html.includes('12 Main St'));
  assert.ok(html.includes('Denver'));
});

test('marks drop-ship slips and shows only the car wash name as recipient', () => {
  const html = buildPackingSlipHtml({
    ...base,
    isDropShip: true,
    shipTo: { name: 'Mountain Wash', address: '1 Pine Rd', city: 'Boulder', state: 'CO', zip: '80301' },
  });
  assert.ok(html.includes('Drop-ship'));
  assert.ok(html.includes('Mountain Wash'));
  assert.ok(!html.includes('Distributor Inc'));
});
