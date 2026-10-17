-- Create public storage bucket for repairs intake images
insert into storage.buckets (id, name, public)
values ('repairs-intake', 'repairs-intake', true)
on conflict (id) do nothing;

-- Storage policies for the bucket
-- Public read
create policy if not exists "Public read for repairs-intake"
  on storage.objects for select
  using (bucket_id = 'repairs-intake');

-- Authenticated users can insert/update/delete within repairs-intake
create policy if not exists "Authenticated write for repairs-intake"
  on storage.objects for insert
  with check (bucket_id = 'repairs-intake' and auth.uid() is not null);

create policy if not exists "Authenticated update for repairs-intake"
  on storage.objects for update
  using (bucket_id = 'repairs-intake' and auth.uid() is not null)
  with check (bucket_id = 'repairs-intake' and auth.uid() is not null);

create policy if not exists "Authenticated delete for repairs-intake"
  on storage.objects for delete
  using (bucket_id = 'repairs-intake' and auth.uid() is not null);

-- Step 3: Unbox tables
-- Tray assignments ensure only one active assignment per tray (1-40)
create table if not exists public.tray_assignments (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  tray_number integer not null check (tray_number between 1 and 40),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz null,
  assigned_by uuid not null default auth.uid(),
  notes text null,
  created_at timestamptz not null default now()
);

-- Optional FK referencing inbound_packages for data integrity (no cascade)
alter table public.tray_assignments
  add constraint tray_assignments_package_fk
  foreign key (package_id) references public.inbound_packages(id) on delete restrict;

-- Unique active tray constraint: one active assignment per tray
create unique index if not exists idx_tray_assignments_unique_active
  on public.tray_assignments (tray_number)
  where unassigned_at is null;

-- RLS
alter table public.tray_assignments enable row level security;
create policy if not exists "Tray assignments manageable by authenticated users"
  on public.tray_assignments for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Unboxing events table
create table if not exists public.unboxing_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  total_item_count integer not null check (total_item_count >= 0),
  photo_paths text[] not null default '{}',
  notes text null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.unboxing_events
  add constraint unboxing_events_package_fk
  foreign key (package_id) references public.inbound_packages(id) on delete restrict;

alter table public.unboxing_events enable row level security;
create policy if not exists "Unboxing events manageable by authenticated users"
  on public.unboxing_events for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
