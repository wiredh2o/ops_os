/**
 * Serial Label Utilities
 * Generates and prints 2" x 1" serial number labels for Zebra thermal printers
 */

export interface SerialLabelData {
  serialNumber: string;
  sku: string;
  description?: string;
}

/**
 * Generates ZPL (Zebra Programming Language) for a 2" x 1" serial label
 * This can be sent directly to Zebra printers configured for raw mode
 */
export function generateSerialLabelZPL(data: SerialLabelData): string {
  const { serialNumber, sku } = data;
  
  // ZPL for 2" x 1" label (203 DPI: 2" = 406 dots, 1" = 203 dots)
  return `
^XA
^PW406
^LL203
^FO20,30^A0N,60,60^FD${serialNumber}^FS
^FO20,110^A0N,30,30^FD${sku}^FS
^XZ
`.trim();
}

/**
 * Generates HTML for browser-based printing of serial labels
 * Compatible with thermal printers set up as standard OS printers
 */
export function generateSerialLabelHTML(data: SerialLabelData): string {
  const { serialNumber, sku, description } = data;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Serial Label - ${serialNumber}</title>
  <style>
    @page {
      size: 2in 1in;
      margin: 0;
    }
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box; 
    }
    html, body {
      width: 2in;
      height: 1in;
      overflow: hidden;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: 2in;
      height: 1in;
      padding: 4px 6px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      font-family: 'Courier New', monospace;
    }
    .serial {
      font-size: 18px;
      font-weight: bold;
      line-height: 1.1;
      text-align: center;
      letter-spacing: 1px;
    }
    .sku {
      font-size: 10px;
      text-align: center;
      margin-top: 4px;
      color: #333;
    }
    .desc {
      font-size: 8px;
      text-align: center;
      margin-top: 2px;
      color: #666;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="serial">${serialNumber}</div>
    <div class="sku">${sku}</div>
    ${description ? `<div class="desc">${description}</div>` : ''}
  </div>
</body>
</html>
`.trim();
}

/**
 * Prints a serial label using browser print functionality
 * Uses hidden iframe approach for thermal printers
 */
export function printSerialLabel(data: SerialLabelData): void {
  const html = generateSerialLabelHTML(data);
  
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
  
  iframe.srcdoc = html.replace('</body>', `
    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 100);
      };
    </script>
  </body>`);
  
  setTimeout(cleanup, 5000);
}

/**
 * Prints multiple serial labels in batch
 */
export function printSerialLabelsBatch(labels: SerialLabelData[]): void {
  if (labels.length === 0) return;
  
  // Generate combined HTML with page breaks
  const labelsHtml = labels.map((data, index) => {
    const isLast = index === labels.length - 1;
    return `
      <div class="label" ${!isLast ? 'style="page-break-after: always;"' : ''}>
        <div class="serial">${data.serialNumber}</div>
        <div class="sku">${data.sku}</div>
        ${data.description ? `<div class="desc">${data.description}</div>` : ''}
      </div>
    `;
  }).join('');
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Serial Labels Batch</title>
  <style>
    @page {
      size: 2in 1in;
      margin: 0;
    }
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box; 
    }
    html, body {
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: 2in;
      height: 1in;
      padding: 4px 6px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      font-family: 'Courier New', monospace;
    }
    .serial {
      font-size: 18px;
      font-weight: bold;
      line-height: 1.1;
      text-align: center;
      letter-spacing: 1px;
    }
    .sku {
      font-size: 10px;
      text-align: center;
      margin-top: 4px;
      color: #333;
    }
    .desc {
      font-size: 8px;
      text-align: center;
      margin-top: 2px;
      color: #666;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @media print {
      .label {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${labelsHtml}
</body>
</html>
`.trim();
  
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
  
  iframe.srcdoc = html.replace('</body>', `
    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 100);
      };
    </script>
  </body>`);
  
  setTimeout(cleanup, 5000);
}

/**
 * Generates a serial number in auto date-sequential format
 * Format: {PREFIX} {YY-MMDD}{SEQ}{INITIALS}
 * Example: LCD 26-01291DW
 */
export function formatAutoSerial(
  prefix: string,
  date: Date,
  sequence: number,
  initials: string
): string {
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  
  return `${prefix} ${yy}-${mm}${dd}${sequence}${initials.toUpperCase()}`;
}
