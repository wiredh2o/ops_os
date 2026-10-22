/**
 * Packing Slip Utilities
 * Builds and prints a price-free packing slip (letter size) via a hidden iframe.
 * Packing slips never show prices — they are for the person packing the box.
 */

export interface PackingSlipItem {
  sku: string;
  description: string;
  quantity: number;
}

/** Only allocated invoice quantities belong on a shipment packing slip. */
export function shipmentPackingSlipItems(items: {
  item_name: string;
  item_sku?: string | null;
  item_type: string;
  quantity: number;
}[]): PackingSlipItem[] {
  return items.filter(item => item.item_type !== 'labor' && item.quantity > 0)
    .map(item => ({ sku: item.item_sku || item.item_name, description: item.item_name, quantity: item.quantity }));
}

/** Use a saved destination, otherwise the same default selected by the shipping screen. */
export function packingSlipDestination(saved: unknown, addresses: unknown, defaultId: string | null, name: string): PackingSlipShipTo | null {
  let candidates = addresses;
  if (typeof candidates === 'string') {
    try { candidates = JSON.parse(candidates); } catch { candidates = []; }
  }
  const list: unknown[] = Array.isArray(candidates) ? candidates : [];
  const selected = saved || (defaultId
    ? list.find(value => value && typeof value === 'object' && 'id' in value && value.id === defaultId)
    : list.length === 1 ? list[0] : null);
  if (!selected || typeof selected !== 'object') return null;
  const address = selected as Record<string, unknown>;
  if (typeof address.address !== 'string' || !address.address.trim()) return null;
  return {
    name: typeof address.recipient_name === 'string' ? address.recipient_name : name,
    address: address.address,
    city: typeof address.city === 'string' ? address.city : undefined,
    state: typeof address.state === 'string' ? address.state : undefined,
    zip: typeof address.zip === 'string' ? address.zip : undefined,
  };
}

export interface PackingSlipShipTo {
  /** Recipient name — for drop-ship orders this is the car wash name only. */
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface PackingSlipData {
  orderNumber: string;
  customerPo?: string | null;
  companyName: string;
  orderDate?: string | null;
  shipTo: PackingSlipShipTo;
  isDropShip?: boolean;
  items: PackingSlipItem[];
  notes?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Builds the printable packing slip HTML document. Exposed for testing. */
export function buildPackingSlipHtml(data: PackingSlipData): string {
  const shipToLines = [
    data.shipTo.name,
    data.shipTo.address,
    [data.shipTo.city, data.shipTo.state, data.shipTo.zip].filter(Boolean).join(', ').replace(', ', data.shipTo.city && data.shipTo.state ? ', ' : ' '),
  ]
    .filter((line): line is string => typeof line === 'string' && !!line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        <td class="sku">${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="qty">${item.quantity}</td>
        <td class="check"></td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Packing Slip - ${escapeHtml(data.orderNumber)}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 12px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #444; margin-bottom: 16px; }
    .meta p { margin: 2px 0; }
    .addresses { display: table; width: 100%; margin-bottom: 16px; }
    .addr-col { display: table-cell; width: 50%; vertical-align: top; }
    .addr-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 4px; }
    .addr-col p { margin: 1px 0; }
    .dropship { display: inline-block; border: 1px solid #000; padding: 1px 6px; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    table.items th { text-align: left; border-bottom: 2px solid #000; padding: 6px 8px; font-size: 11px; text-transform: uppercase; }
    table.items td { border-bottom: 1px solid #ccc; padding: 6px 8px; }
    td.qty, th.qty { text-align: center; width: 60px; }
    td.check, th.check { width: 50px; }
    td.check { border: 1px solid #999; height: 18px; }
    .notes { border: 1px solid #ccc; padding: 8px; font-size: 11px; }
    .notes .addr-label { margin-bottom: 2px; }
  </style>
</head>
<body>
  <h1>Packing Slip</h1>
  <div class="meta">
    <p><strong>Order:</strong> ${escapeHtml(data.orderNumber)}${data.customerPo ? ` &nbsp; <strong>Customer PO:</strong> ${escapeHtml(data.customerPo)}` : ''}</p>
    ${data.orderDate ? `<p><strong>Order date:</strong> ${escapeHtml(data.orderDate)}</p>` : ''}
  </div>
  <div class="addresses">
    <div class="addr-col">
      <p class="addr-label">Customer</p>
      <p>${escapeHtml(data.companyName)}</p>
    </div>
    <div class="addr-col">
      <p class="addr-label">Ship To</p>
      ${data.isDropShip ? '<span class="dropship">Drop-ship</span>' : ''}
      ${shipToLines}
    </div>
  </div>
  <table class="items">
    <thead>
      <tr><th>SKU</th><th>Item</th><th class="qty">Qty</th><th class="check">Packed</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  ${data.notes ? `<div class="notes"><p class="addr-label">Notes</p><p>${escapeHtml(data.notes)}</p></div>` : ''}
</body>
</html>`;
}

/**
 * Prints the packing slip through a hidden iframe (same pattern as thermal label printing).
 */
export function printPackingSlip(data: PackingSlipData): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;';
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    }, 1000);
  };

  const html = buildPackingSlipHtml(data).replace(
    '</body>',
    `<script>window.onload = function() { setTimeout(function() { window.print(); }, 200); };</script></body>`
  );

  iframe.srcdoc = html;
  setTimeout(cleanup, 10000);
}
