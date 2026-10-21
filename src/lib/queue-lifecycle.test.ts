import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { isShippingArchived, isRepairItemResolved, isRepairPackageArchived, matchesArchiveFilter } from './queue-lifecycle';
import { filterRepairQueuePackages } from './repair-queue-filter';

describe('shipping archive handoff', () => {
  it('archives carrier possession even with an unpaid balance', () => {
    strictEqual(isShippingArchived({ status: 'awaiting_pickup', picked_up_at: '2026-10-21T03:10:00Z', payment_status: 'unpaid' }), true);
  });
  it('archives customer pickup even when unpaid', () => {
    strictEqual(isShippingArchived({ status: 'picked_up', payment_status: 'unpaid' }), true);
  });
  for (const status of ['shipped', 'in_transit', 'delivered']) {
    it(`archives physical shipment status ${status}`, () => strictEqual(isShippingArchived({ status, payment_status: 'pending' }), true));
  }
  for (const status of ['completed', 'label_created', 'label_staged', 'awaiting_pickup', 'ready_for_pickup', 'awaiting_payment']) {
    it(`keeps ${status} open without a handoff`, () => strictEqual(isShippingArchived({ status, payment_status: 'paid' }), false));
  }
});

describe('repair package resolution', () => {
  for (const status of ['logged', 'diagnosed', 'in_repair', 'completed', 'queued_for_shipping', 'label_created', 'label_staged', 'awaiting_pickup', 'ready_for_pickup', 'unknown']) {
    it(`keeps ${status} unresolved`, () => strictEqual(isRepairItemResolved({ status }), false));
  }
  it('keeps a package open while any item is unresolved', () => {
    strictEqual(isRepairPackageArchived({ item_count: 3 }, [{ status: 'shipped' }, { completion_outcome: 'customer_declined_scrapped' }, { status: 'label_staged' }]), false);
  });
  it('archives only when every item is shipped or scrapped', () => {
    strictEqual(isRepairPackageArchived({ item_count: 3 }, [{ status: 'in_transit' }, { completion_outcome: 'unrepairable_scrapped' }, { completion_outcome: 'customer_declined_scrapped' }]), true);
  });
  it('does not archive empty packages', () => strictEqual(isRepairPackageArchived({ item_count: 0 }, []), false));
  it('does not archive when declared items have not all been linked', () => strictEqual(isRepairPackageArchived({ item_count: 2 }, [{ status: 'delivered' }]), false));
  it('keeps shipping-queued packages in existing queue entry points', () => {
    deepStrictEqual(filterRepairQueuePackages([{ id: 'p', status: 'opened', item_count: 1 }], { p: [{ status: 'queued_for_shipping' }] }).map(p => p.id), ['p']);
  });
  it('removes fully resolved packages from active queues', () => {
    deepStrictEqual(filterRepairQueuePackages([{ id: 'p', status: 'opened', item_count: 1 }], { p: [{ status: 'shipped' }] }), []);
  });
});

describe('archive search and customer filter', () => {
  it('matches customer and case-insensitive tracking or item text', () => strictEqual(matchesArchiveFilter('c1', 'c1', ' SN-42 ', ['Customer', 'sn-42']), true));
  it('excludes another customer even when text matches', () => strictEqual(matchesArchiveFilter('c2', 'c1', 'SN-42', ['SN-42']), false));
  it('excludes nonmatching searches', () => strictEqual(matchesArchiveFilter('c1', 'all', 'missing', ['SN-42']), false));
});