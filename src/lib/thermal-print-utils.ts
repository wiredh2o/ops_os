/**
 * Thermal Label Print Utilities
 * Generates optimized print HTML for 4" x 6.75" FedEx shipping labels
 * Uses iframe-based printing for images, window-based for PDFs
 */

const LABEL_WIDTH = '4in';
const LABEL_HEIGHT = '6.75in';

export interface PrintOptions {
  mimeType?: string;
}

export interface LabelToPrint {
  blobUrl: string;
  trackingNumber: string;
  packageNumber: number;
}

/**
 * Detects if content should be treated as a PDF based on mimeType or URL
 */
function isPdf(mimeType?: string, url?: string): boolean {
  if (mimeType) {
    return mimeType === 'application/pdf';
  }
  if (!url) return false;
  
  // Handle blob: URLs - can't determine from URL alone
  if (url.startsWith('blob:')) {
    return true; // Default assumption for blob without mimeType
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    const pathWithoutQuery = url.split('?')[0];
    return pathWithoutQuery.toLowerCase().endsWith('.pdf');
  }
}

/**
 * Downloads the label as a file (triggers browser download dialog)
 */
export function downloadLabel(blobUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads multiple labels as individual files
 */
export function downloadMultipleLabels(labels: LabelToPrint[]): void {
  labels.forEach((label, index) => {
    // Add a small delay between downloads to prevent browser blocking
    setTimeout(() => {
      const filename = `shipping-label-${label.packageNumber}-${label.trackingNumber}.png`;
      downloadLabel(label.blobUrl, filename);
    }, index * 200);
  });
}

/**
 * Prints a label using appropriate method based on content type
 * - PDFs: Opens in a new window with print dialog
 * - Images: Uses hidden iframe with proper thermal label styling
 * @param blobUrl - Blob URL of the label
 * @param options - Optional settings including mimeType
 */
export function printThermalLabel(blobUrl: string, options?: PrintOptions): void {
  const mimeType = options?.mimeType;
  const isPdfLabel = isPdf(mimeType, blobUrl);
  
  console.log('[printThermalLabel] Starting print:', { blobUrl, mimeType, isPdfLabel });
  
  if (isPdfLabel) {
    // For PDF: open in a visible window with print dialog
    // Hidden iframe PDF printing fails silently in many browsers
    const printWindow = window.open(blobUrl, '_blank', 'width=600,height=800');
    
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    } else {
      // If popup blocked, fall back to download
      console.warn('[printThermalLabel] Popup blocked, falling back to download');
      downloadLabel(blobUrl, 'shipping-label.pdf');
    }
    return;
  }
  
  // For images: use hidden iframe with proper print styling
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
  
  const printHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Shipping Label</title>
  <style>
    @page {
      size: ${LABEL_WIDTH} ${LABEL_HEIGHT};
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${LABEL_WIDTH};
      height: ${LABEL_HEIGHT};
      overflow: hidden;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: fill;
      display: block;
    }
  </style>
</head>
<body>
  <img 
    src="${blobUrl}" 
    alt="Shipping Label"
    onload="setTimeout(function() { window.print(); }, 100);"
    onerror="document.body.innerHTML='<p style=\\'padding:20px\\'>Failed to load label image</p>';"
  />
</body>
</html>`;
  
  iframe.srcdoc = printHtml;
  // Cleanup after print dialog closes (approximate)
  setTimeout(cleanup, 5000);
}

/**
 * Prints multiple thermal labels in a single print job with page breaks
 * Each label gets its own 4" x 6.75" page
 * @param labels - Array of labels to print
 * @param options - Optional settings including mimeType
 */
export function printMultipleThermalLabels(labels: LabelToPrint[], options?: PrintOptions): void {
  if (labels.length === 0) {
    console.warn('[printMultipleThermalLabels] No labels to print');
    return;
  }
  
  if (labels.length === 1) {
    // Single label, use existing function
    printThermalLabel(labels[0].blobUrl, options);
    return;
  }
  
  const mimeType = options?.mimeType;
  const isPdfLabel = isPdf(mimeType, labels[0].blobUrl);
  
  console.log('[printMultipleThermalLabels] Starting batch print:', { 
    labelCount: labels.length, 
    mimeType, 
    isPdfLabel 
  });
  
  if (isPdfLabel) {
    // For PDFs: print each in sequence
    // Most browsers can't combine PDFs, so we print them one at a time
    labels.forEach((label, index) => {
      setTimeout(() => {
        printThermalLabel(label.blobUrl, options);
      }, index * 1500); // 1.5s delay between each
    });
    return;
  }
  
  // For images: create a single document with multiple pages
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;';
  document.body.appendChild(iframe);
  
  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  };
  
  // Generate image tags for each label
  const imageTags = labels.map((label, index) => `
    <div class="label-page${index === labels.length - 1 ? ' last' : ''}">
      <img 
        src="${label.blobUrl}" 
        alt="Package ${label.packageNumber} - ${label.trackingNumber}"
        onerror="this.parentElement.innerHTML='<p style=\"padding:20px\">Failed to load label ${label.packageNumber}</p>';"
      />
    </div>
  `).join('\n');
  
  const printHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Shipping Labels (${labels.length})</title>
  <style>
    @page {
      size: ${LABEL_WIDTH} ${LABEL_HEIGHT};
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
    .label-page {
      width: ${LABEL_WIDTH};
      height: ${LABEL_HEIGHT};
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .label-page.last {
      page-break-after: auto;
      break-after: auto;
    }
    .label-page img {
      width: 100%;
      height: 100%;
      object-fit: fill;
      display: block;
    }
    @media screen {
      .label-page {
        margin-bottom: 10px;
        border: 1px solid #ccc;
      }
    }
  </style>
</head>
<body>
  ${imageTags}
  <script>
    // Wait for all images to load before printing
    var images = document.querySelectorAll('img');
    var loaded = 0;
    var total = images.length;
    
    function checkAllLoaded() {
      loaded++;
      if (loaded >= total) {
        setTimeout(function() { window.print(); }, 200);
      }
    }
    
    images.forEach(function(img) {
      if (img.complete) {
        checkAllLoaded();
      } else {
        img.onload = checkAllLoaded;
        img.onerror = checkAllLoaded;
      }
    });
    
    // Fallback if images take too long
    setTimeout(function() { window.print(); }, 3000);
  </script>
</body>
</html>`;
  
  iframe.srcdoc = printHtml;
  // Cleanup after print dialog closes (approximate)
  setTimeout(cleanup, 10000);
}
