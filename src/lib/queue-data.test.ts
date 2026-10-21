import { it } from 'node:test';
import { strictEqual, rejects } from 'node:assert/strict';
import { readQueuePages, readQueueRelations } from './queue-data';

it('loads unresolved items beyond the first page', async () => {
  const rows = await readQueuePages(async (from) => ({ data: from === 0 ? Array(1000).fill('shipped') : ['unresolved'], error: null }));
  strictEqual(rows.length, 1001);
  strictEqual(rows[1000], 'unresolved');
});
it('fails closed when a page cannot be read', async () => {
  await rejects(() => readQueuePages(async () => ({ data: null, error: new Error('denied') })), /denied/);
});
it('reads every related item across bounded batches', async () => {
  const rows = await readQueueRelations(Array.from({ length: 201 }, (_, i) => String(i)), async ids => ({ data: ids, error: null }));
  strictEqual(rows.length, 201);
  strictEqual(rows[200], '200');
});