import { describe, expect, it } from 'vitest';
import { buildTestLabelZpl, buildWritePayload } from './zebra-browser-print';

describe('zebra-browser-print', () => {
  it('test label is a complete ZPL document sized for 4x6.75 stock', () => {
    const zpl = buildTestLabelZpl();
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
    expect(zpl).toMatch(/\^PW812/); // 4 inch print width at 203 DPI
    expect(zpl).toMatch(/\^LL1350/); // 6.75 inch label length at 203 DPI
    expect(zpl).toMatch(/\^BCN/); // scannable Code-128 barcode
  });

  it('write payload targets the chosen printer with the raw label data', () => {
    const payload = JSON.parse(buildWritePayload({ name: 'ZP 500', uid: 'u1' }, '^XA^XZ'));
    expect(payload.device.name).toBe('ZP 500');
    expect(payload.device.uid).toBe('u1');
    expect(payload.data).toBe('^XA^XZ');
  });
});
