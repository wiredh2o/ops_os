-- Create the repairs-intake storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('repairs-intake', 'repairs-intake', false);

-- Create RLS policies for the repairs-intake bucket
CREATE POLICY "Authenticated users can upload repair photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND bucket_id = 'repairs-intake'
);

CREATE POLICY "Authenticated users can view repair photos" 
ON storage.objects 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND bucket_id = 'repairs-intake'
);

CREATE POLICY "Authenticated users can update repair photos" 
ON storage.objects 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL 
  AND bucket_id = 'repairs-intake'
);

CREATE POLICY "Authenticated users can delete repair photos" 
ON storage.objects 
FOR DELETE 
USING (
  auth.uid() IS NOT NULL 
  AND bucket_id = 'repairs-intake'
);

-- Create the repair_item_photos table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.repair_item_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_item_id UUID NOT NULL REFERENCES public.repair_items(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID DEFAULT auth.uid()
);

-- Enable RLS on repair_item_photos table
ALTER TABLE public.repair_item_photos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for repair_item_photos
CREATE POLICY "Authenticated users can view repair item photos" 
ON public.repair_item_photos 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create repair item photos" 
ON public.repair_item_photos 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update repair item photos" 
ON public.repair_item_photos 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete repair item photos" 
ON public.repair_item_photos 
FOR DELETE 
USING (auth.uid() IS NOT NULL);