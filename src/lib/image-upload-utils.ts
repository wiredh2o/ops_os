import { supabase } from "@/integrations/supabase/client";
import { removeBackground, loadImage } from "@/lib/image/backgroundRemoval";
import { SelectedPhoto } from "@/components/repairs/PhotoUploader";

/**
 * Uploads images to Supabase storage for inventory items and assemblies
 */
export const uploadInventoryImages = async (
  photos: SelectedPhoto[],
  itemId: string,
  itemType: 'inventory-items' | 'assemblies'
): Promise<string[]> => {
  const uploadedUrls: string[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const timestamp = Date.now();
    const filename = `${itemType}/${itemId}/${timestamp}-${i}.${photo.file.name.split('.').pop()}`;

    try {
      let fileToUpload = photo.file;

      // Process background removal if requested
      if (photo.removeBg) {
        try {
          const imageElement = await loadImage(photo.file);
          const processedBlob = await removeBackground(imageElement);
          fileToUpload = new File([processedBlob], `processed-${photo.file.name}`, {
            type: 'image/png'
          });
        } catch (bgError) {
          console.warn('Background removal failed, uploading original:', bgError);
          // Continue with original file if background removal fails
        }
      }

      // Upload to inventory-images bucket
      const { data, error } = await supabase.storage
        .from('inventory-images')
        .upload(filename, fileToUpload, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('inventory-images')
        .getPublicUrl(filename);

      uploadedUrls.push(urlData.publicUrl);
    } catch (error) {
      console.error(`Failed to upload image ${i + 1}:`, error);
      throw new Error(`Failed to upload image ${i + 1}: ${error.message}`);
    }
  }

  return uploadedUrls;
};

/**
 * Formats existing image URLs for display
 */
export const formatExistingImages = (imageUrls: string[] | null | undefined) => {
  if (!imageUrls || imageUrls.length === 0) return [];
  
  return imageUrls.map((url, index) => ({
    id: `existing-${index}`,
    file_path: url,
    previewUrl: url,
    isExisting: true as const
  }));
};

/**
 * Combines existing and new image URLs
 */
export const combineImageUrls = (
  existingUrls: string[] = [],
  newUploadedUrls: string[] = []
): string[] => {
  return [...existingUrls, ...newUploadedUrls];
};