alter table public.hr_config
  add column if not exists office_ip_allowlist text not null default '';

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  date date not null,
  checked_in_at timestamptz,
  checked_in_ip text,
  checked_out_at timestamptz,
  checked_out_ip text,
  created_at timestamptz not null default now(),
  -- One check-in/out session per employee per day, enforced structurally —
  -- a second same-day check-in fails at the database level even if the
  -- application-code check in checkIn() is ever bypassed.
  unique (user_id, date)
);

alter table public.attendance_records enable row level security;

-- Employee can read only their own records (needed for their own
-- /attendance history and for the "already checked in today" check).
drop policy if exists "attendance_records_select_own" on public.attendance_records;
create policy "attendance_records_select_own" on public.attendance_records
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- Check-in inserts the day's row directly via the regular client (no
-- service-role needed for check-in itself). `with check` pins user_id to
-- the caller and requires a fresh, not-yet-checked-out shape (checked_out_at
-- and checked_out_ip both null), so a row can't be inserted via REST already
-- showing a checkout — same anti-forgery shape as leave_requests' insert-own
-- policy in migration 0009.
drop policy if exists "attendance_records_insert_own" on public.attendance_records;
create policy "attendance_records_insert_own" on public.attendance_records
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and checked_out_at is null
    and checked_out_ip is null
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- No UPDATE policy for `authenticated` — check-out and every HR manual
-- correction go through the service-role client via Server Actions, each
-- with an explicit ownership/authorization check in code.
