import { loadImage } from './backgroundRemoval';

const PADDING_PERCENT = 0.12; // 12% padding on each side
const OUTPUT_SIZE = 400;      // Square output canvas

/**
 * Processes a box image by centering it on a white canvas with padding.
 * @param file - The uploaded image file
 * @returns A processed image blob with white background and consistent sizing
 */
export async function processBoxImage(file: File): Promise<Blob> {
  // 1. Load original image
  const imageElement = await loadImage(file);
  
  // 2. Create white canvas with padding
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }
  
  // Fill with white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  
  // 3. Calculate centered position with padding
  const padding = OUTPUT_SIZE * PADDING_PERCENT;
  const availableSize = OUTPUT_SIZE - (padding * 2);
  
  const scale = Math.min(
    availableSize / imageElement.naturalWidth,
    availableSize / imageElement.naturalHeight
  );
  
  const scaledWidth = imageElement.naturalWidth * scale;
  const scaledHeight = imageElement.naturalHeight * scale;
  const x = (OUTPUT_SIZE - scaledWidth) / 2;
  const y = (OUTPUT_SIZE - scaledHeight) / 2;
  
  // 4. Draw centered image on white canvas
  ctx.drawImage(imageElement, x, y, scaledWidth, scaledHeight);
  
  // 5. Export as PNG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/png',
      1.0
    );
  });
}
