create table if not exists public.employee_profiles (
  user_id uuid primary key references public.users(id),
  phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  date_of_birth date,
  designation text,
  department text,
  employment_start_date date,
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_profile_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  field text not null check (
    field in ('phone', 'address', 'emergency_contact_name', 'emergency_contact_phone', 'date_of_birth')
  ),
  proposed_value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.employee_profiles enable row level security;
alter table public.employee_profile_requests enable row level security;

-- Employee can read only their own profile row. No INSERT/UPDATE policy here
-- is intentional — all writes (including admin edits) go through the
-- service-role client, exactly matching the `users` table's existing pattern.
--
-- Matches 0005_rls_active_employees.sql's invariant: a deactivated employee
-- keeps their public.users row (for activity-authorship integrity) but must
-- lose data access, so every membership check here also requires is_active.
drop policy if exists "employee_profiles_select_own" on public.employee_profiles;
create policy "employee_profiles_select_own" on public.employee_profiles
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- Employee can read and create their own change requests (submitting a
-- request is a normal self-service action). No UPDATE policy — approving or
-- rejecting a request is an admin action via the service-role client.
drop policy if exists "employee_profile_requests_select_own" on public.employee_profile_requests;
create policy "employee_profile_requests_select_own" on public.employee_profile_requests
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- with check also pins status/reviewed_by/reviewed_at to a fresh, unreviewed
-- submission shape, so an employee can't insert a row via REST that forges
-- an already-approved/rejected request (e.g. status='approved',
-- reviewed_by=<some admin>).
drop policy if exists "employee_profile_requests_insert_own" on public.employee_profile_requests;
create policy "employee_profile_requests_insert_own" on public.employee_profile_requests
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- Enforce at the DB level that a user can't have two pending requests for the
-- same field — the app layer already blocks this, but without this index two
-- concurrent submissions could both pass the app-layer check.
create unique index if not exists employee_profile_requests_one_pending
  on public.employee_profile_requests (user_id, field)
  where status = 'pending';

-- Every existing employee gets a blank profile row so no page ever needs to
-- lazily create one. Safe to re-run.
insert into public.employee_profiles (user_id)
select id from public.users
on conflict (user_id) do nothing;
