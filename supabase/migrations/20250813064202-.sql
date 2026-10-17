-- Create pending_invites table to support user invitations
create table public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  company_id uuid references public.companies(id) on delete set null,
  intended_role app_role not null,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invite_message text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.pending_invites enable row level security;

-- Helpful indexes
create index idx_pending_invites_email on public.pending_invites (email);
create index idx_pending_invites_company on public.pending_invites (company_id);

-- Uniqueness for active (pending) invites; handle null company separately
create unique index pending_invites_unique_email_null_company_pending
  on public.pending_invites (email)
  where company_id is null and status = 'pending';

create unique index pending_invites_unique_email_company_pending
  on public.pending_invites (email, company_id)
  where company_id is not null and status = 'pending';

-- Policies
create policy "Admins and Sales Support can insert invites"
  on public.pending_invites
  for insert
  to authenticated
  with check (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'sales_support'::app_role));

create policy "Admins and Sales Support can view invites"
  on public.pending_invites
  for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'sales_support'::app_role));

create policy "Inviter or admin can update invites"
  on public.pending_invites
  for update
  to authenticated
  using (inviter_user_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))
  with check (inviter_user_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role));