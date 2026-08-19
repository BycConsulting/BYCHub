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

create policy "clients_all_authenticated" on public.clients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "leads_all_authenticated" on public.leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "activities_all_authenticated" on public.activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
