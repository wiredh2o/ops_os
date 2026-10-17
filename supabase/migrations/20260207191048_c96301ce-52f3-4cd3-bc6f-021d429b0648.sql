-- Add image_url column to box_sizes table for visual identification in tooltips
ALTER TABLE public.box_sizes
ADD COLUMN image_url TEXT;