-- Create a public bucket for inventory images (idempotent)
insert into storage.buckets (id, name, public)
values ('inventory-images', 'inventory-images', true)
on conflict (id) do nothing;

-- Create policies only if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read for inventory-images'
  ) THEN
    CREATE POLICY "Public read for inventory-images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'inventory-images');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated insert to inventory-images'
  ) THEN
    CREATE POLICY "Authenticated insert to inventory-images"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'inventory-images');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated update inventory-images'
  ) THEN
    CREATE POLICY "Authenticated update inventory-images"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'inventory-images')
      WITH CHECK (bucket_id = 'inventory-images');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated delete inventory-images'
  ) THEN
    CREATE POLICY "Authenticated delete inventory-images"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'inventory-images');
  END IF;
END$$;