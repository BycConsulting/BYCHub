create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  type text not null check (type in ('casual', 'sick', 'earned', 'maternity', 'paternity', 'wfh')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- A request cannot span two different calendar years — keeps the
  -- balance math (computed per-year from `start_date`) from ever needing
  -- to split one request's days across two years' allocations.
  constraint leave_requests_same_year check (extract(year from start_date) = extract(year from end_date))
);

alter table public.leave_requests enable row level security;

-- Employee can read only their own requests (needed for their own /leave
-- page's request list and for the overlap check in the submit action).
drop policy if exists "leave_requests_select_own" on public.leave_requests;
create policy "leave_requests_select_own" on public.leave_requests
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- Employee can create their own requests (submitting is a normal
-- self-service action, unlike the profile data the HR Portal roles
-- sub-project locked down). `with check` pins status/reviewed_by/
-- reviewed_at to a fresh, unreviewed shape, so a request can't be
-- inserted via REST already marked approved/rejected with a forged
-- reviewer — same anti-forgery shape as `employee_profile_requests` in
-- migration 0006.
drop policy if exists "leave_requests_insert_own" on public.leave_requests;
create policy "leave_requests_insert_own" on public.leave_requests
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

-- No UPDATE policy for `authenticated` — approve, reject, and cancel all
-- go through the service-role client via Server Actions, each with an
-- explicit ownership/role check in code.
