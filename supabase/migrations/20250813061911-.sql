-- Create branding storage bucket and policies
-- Create the bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Public read access for branding bucket
create policy if not exists "Public read access to branding bucket"
  on storage.objects for select
  using (bucket_id = 'branding');

-- Allow authenticated users to upload their logos to branding bucket
create policy if not exists "Authenticated users can upload to branding"
  on storage.objects for insert
  with check (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  );

-- Allow authenticated users to update objects in branding bucket
create policy if not exists "Authenticated users can update branding"
  on storage.objects for update
  using (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  )
  with check (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  );

-- Allow authenticated users to delete objects in branding bucket
create policy if not exists "Authenticated users can delete branding"
  on storage.objects for delete
  using (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  );