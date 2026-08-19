create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'prospect' check (status in ('prospect', 'active', 'paused', 'lost')),
  owner_user_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  source text,
  contact_name text not null,
  contact_email text,
  contact_company text,
  stage text not null default 'new' check (stage in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  fit_score integer,
  assigned_user_id uuid references public.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id),
  client_id uuid references public.clients(id),
  user_id uuid not null references public.users(id),
  type text not null check (type in ('note', 'call', 'email', 'stage_change')),
  body text,
  created_at timestamptz not null default now(),
  constraint activity_has_target check (lead_id is not null or client_id is not null)
);

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;

-- Any authenticated employee can read all profiles (needed for assignee dropdowns).
-- Writes to `users` go through the service-role key only (admin invite action) — no
-- insert/update policy here is intentional, not an oversight.
create policy "users_select_authenticated" on public.users
  for select using (auth.role() = 'authenticated');

-- CRM tables: employee membership, NOT merely "has a session".
--
-- These policies deliberately do NOT use `auth.role() = 'authenticated'`. That
-- predicate is true for ANY Supabase Auth session, not just employees. The anon
-- key is public (it ships in the browser bundle) and Supabase projects accept
-- email signup by default, so a stranger can self-register straight against the
-- Auth REST API — never touching this Next.js app or its requireUser/requireAdmin
-- checks — and then read and write every row through
-- https://<project>.supabase.co/rest/v1/... using the anon key plus their own
-- session. Verified exploitable against the live project before this change.
--
-- Requiring a matching public.users row closes that hole: rows in public.users
-- are only ever created by an admin's invite action through the service-role key
-- (see the comment above), so "has a profile row" means "is a real employee".
create policy "clients_all_employees" on public.clients
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid())));

create policy "leads_all_employees" on public.leads
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid())));

create policy "activities_all_employees" on public.activities
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid())));
