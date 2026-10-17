-- Create a storage bucket for package images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('package-images', 'package-images', true);

-- Create RLS policies for package images
CREATE POLICY "Package images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'package-images');

CREATE POLICY "Authenticated users can upload package images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'package-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update their package images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'package-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete package images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'package-images' AND auth.uid() IS NOT NULL);

-- Create a table to store package image metadata
CREATE TABLE IF NOT EXISTS public.package_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.inbound_packages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  content_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on package_images table
ALTER TABLE public.package_images ENABLE ROW LEVEL SECURITY;

-- RLS policies for package_images table
CREATE POLICY "Package images viewable by authenticated users" 
ON public.package_images 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Package images manageable by authenticated users" 
ON public.package_images 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.update_package_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_package_images_updated_at
  BEFORE UPDATE ON public.package_images
  FOR EACH ROW
  EXECUTE FUNCTION public.update_package_images_updated_at();