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

-- No INSERT policy either (in addition to no UPDATE policy) — the IP
-- allowlist and WFH-bypass gate can only be enforced in application code,
-- not expressed as an RLS check, so check-in must go through the
-- service-role client via the checkIn() Server Action, with an explicit
-- ownership check in code, same as check-out.

-- No UPDATE policy for `authenticated` — check-out and every HR manual
-- correction go through the service-role client via Server Actions, each
-- with an explicit ownership/authorization check in code.
