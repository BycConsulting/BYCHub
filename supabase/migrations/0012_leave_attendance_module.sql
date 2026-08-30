-- supabase/migrations/0012_leave_attendance_module.sql

-- Widen role_module_access.module's CHECK constraint to add
-- 'leave_attendance', without removing any existing module values from
-- the same shared table (same lookup-by-definition pattern as every
-- prior module-key migration, since the constraint's name was never set
-- explicitly).
do $$
declare
  module_constraint_name text;
begin
  select conname into module_constraint_name
  from pg_constraint
  where conrelid = 'public.role_module_access'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%module%';

  if module_constraint_name is not null then
    execute format('alter table public.role_module_access drop constraint %I', module_constraint_name);
  end if;
end $$;

alter table public.role_module_access add constraint role_module_access_module_check
  check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance'));

-- Enabled by default for both roles, matching today's always-visible
-- /leave and /attendance -- no regression for anyone who can see them now.
insert into public.role_module_access (role, module, enabled) values
  ('hr', 'leave_attendance', true),
  ('employee', 'leave_attendance', true)
on conflict (role, module) do nothing;

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- No RLS policies for `authenticated` on purpose, same pattern as
-- role_module_access -- read and written exclusively through the
-- service-role client (requireModule-gated Server Components/Actions).
alter table public.holidays enable row level security;

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  working_monday boolean not null default true,
  working_tuesday boolean not null default true,
  working_wednesday boolean not null default true,
  working_thursday boolean not null default true,
  working_friday boolean not null default true,
  working_saturday boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shifts enable row level security;

alter table public.employee_profiles
  add column shift_id uuid references public.shifts(id) on delete set null;
