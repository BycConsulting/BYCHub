-- supabase/migrations/0019_meta_reports.sql
-- Meta Ads reports: client ad account mapping, report layouts, and the last
-- fetched Meta data per widget query (only changes when someone presses Refresh).

create table public.client_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]+$'),
  label text not null default '',
  created_at timestamptz not null default now(),
  unique (client_id, ad_account_id)
);

create table public.report_layouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null,
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]+$'),
  orientation text not null default 'landscape' check (orientation in ('landscape', 'portrait')),
  pages jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_data_cache (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.report_layouts(id) on delete cascade,
  query_key text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (layout_id, query_key)
);

alter table public.client_ad_accounts enable row level security;
alter table public.report_layouts enable row level security;
alter table public.report_data_cache enable row level security;

create policy "client_ad_accounts_all_employees" on public.client_ad_accounts
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

create policy "report_layouts_all_employees" on public.report_layouts
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

create policy "report_data_cache_all_employees" on public.report_data_cache
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

create index client_ad_accounts_client_id_idx on public.client_ad_accounts (client_id);
create index report_layouts_client_id_idx on public.report_layouts (client_id);
