create table public.employee_profiles (
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

create table public.employee_profile_requests (
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
create policy "employee_profiles_select_own" on public.employee_profiles
  for select to authenticated
  using (auth.uid() = user_id);

-- Employee can read and create their own change requests (submitting a
-- request is a normal self-service action). No UPDATE policy — approving or
-- rejecting a request is an admin action via the service-role client.
create policy "employee_profile_requests_select_own" on public.employee_profile_requests
  for select to authenticated
  using (auth.uid() = user_id);

create policy "employee_profile_requests_insert_own" on public.employee_profile_requests
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Every existing employee gets a blank profile row so no page ever needs to
-- lazily create one. Safe to re-run.
insert into public.employee_profiles (user_id)
select id from public.users
on conflict (user_id) do nothing;
