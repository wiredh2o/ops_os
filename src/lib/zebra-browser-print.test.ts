import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildTestLabelZpl, buildWritePayload } from './zebra-browser-print';

test('test label is a complete ZPL document sized for 4x6.75 stock', () => {
  const zpl = buildTestLabelZpl();
  assert.ok(zpl.startsWith('^XA'), 'must open with ^XA');
  assert.ok(zpl.trimEnd().endsWith('^XZ'), 'must close with ^XZ');
  assert.match(zpl, /\^PW812/, '4 inch print width at 203 DPI');
  assert.match(zpl, /\^LL1350/, '6.75 inch label length at 203 DPI');
  assert.match(zpl, /\^BCN/, 'includes a scannable Code-128 barcode');
});

test('test label prints right-side up, matching the FedEx labels', () => {
  const zpl = buildTestLabelZpl();
  assert.match(zpl, /\^PON/, 'explicitly resets to normal 0 degree orientation');
  assert.ok(!zpl.includes('^POI'), 'must not invert orientation — that flips the test label upside down');
});

test('write payload targets the chosen printer with the raw label data', () => {
  const payload = JSON.parse(buildWritePayload({ name: 'ZP 500', uid: 'u1' }, '^XA^XZ'));
  assert.equal(payload.device.name, 'ZP 500');
  assert.equal(payload.device.uid, 'u1');
  assert.equal(payload.data, '^XA^XZ');
});

test('write payload always includes the version Zebra requires', () => {
  const payload = JSON.parse(buildWritePayload({ name: 'ZP 500' }, '^XA^XZ'));
  assert.equal(payload.device.version, 2);
});
