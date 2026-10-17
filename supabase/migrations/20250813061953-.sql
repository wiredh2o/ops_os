-- Create branding storage bucket and policies (idempotent)
-- Ensure bucket exists
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Recreate policies safely
drop policy if exists "Public read access to branding bucket" on storage.objects;
drop policy if exists "Authenticated users can upload to branding" on storage.objects;
drop policy if exists "Authenticated users can update branding" on storage.objects;
drop policy if exists "Authenticated users can delete branding" on storage.objects;

create policy "Public read access to branding bucket"
  on storage.objects for select
  using (bucket_id = 'branding');

create policy "Authenticated users can upload to branding"
  on storage.objects for insert
  with check (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  );

create policy "Authenticated users can update branding"
  on storage.objects for update
  using (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  )
  with check (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  );

create policy "Authenticated users can delete branding"
  on storage.objects for delete
  using (
    bucket_id = 'branding' and auth.role() = 'authenticated'
  );