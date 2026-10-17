-- Create a public bucket for inventory images (idempotent)
insert into storage.buckets (id, name, public)
values ('inventory-images', 'inventory-images', true)
on conflict (id) do nothing;

-- Policies for the inventory-images bucket
-- Allow public read of objects in this bucket
create policy if not exists "Public read for inventory-images"
  on storage.objects for select
  using (bucket_id = 'inventory-images');

-- Allow authenticated users to insert into this bucket
create policy if not exists "Authenticated insert to inventory-images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'inventory-images');

-- Allow authenticated users to update objects in this bucket
create policy if not exists "Authenticated update inventory-images"
  on storage.objects for update to authenticated
  using (bucket_id = 'inventory-images')
  with check (bucket_id = 'inventory-images');

-- Allow authenticated users to delete objects in this bucket
create policy if not exists "Authenticated delete inventory-images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'inventory-images');