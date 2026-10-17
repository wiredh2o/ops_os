-- Add image_urls field to assemblies table to match inventory_items
ALTER TABLE public.assemblies 
ADD COLUMN image_urls text[] DEFAULT '{}';

-- Add comment for clarity
COMMENT ON COLUMN public.assemblies.image_urls IS 'Array of image URLs for assembly photos (up to 10 images)';