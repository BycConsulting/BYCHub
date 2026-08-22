-- Widen the role CHECK constraint to allow 'hr'. The constraint's exact name
-- wasn't set explicitly in 0001_init.sql, so Postgres auto-generated it —
-- look it up rather than guessing, so this doesn't silently no-op if the
-- generated name differs from the Postgres default convention.
do $$
declare
  role_constraint_name text;
begin
  select conname into role_constraint_name
  from pg_constraint
  where conrelid = 'public.users'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';

  if role_constraint_name is not null then
    execute format('alter table public.users drop constraint %I', role_constraint_name);
  end if;
end $$;

alter table public.users add constraint users_role_check
  check (role in ('admin', 'hr', 'employee'));

create table if not exists public.role_module_access (
  role text not null check (role in ('hr', 'employee')),
  module text not null check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings')),
  enabled boolean not null default false,
  primary key (role, module)
);

-- No policies for `authenticated` on purpose: this table is read and written
-- exclusively through the service-role client (requireModule's lookup, the
-- nav's batched lookup, and the Admin permissions-editor action) — the same
-- pattern the `users` table already uses for writes. RLS enabled with zero
-- policies means the regular client gets zero rows either way; this is a
-- deliberate lockdown, not an oversight.
alter table public.role_module_access enable row level security;

insert into public.role_module_access (role, module, enabled) values
  ('hr', 'hr', true),
  ('employee', 'dashboard', true),
  ('employee', 'leads', true),
  ('employee', 'clients', true)
on conflict (role, module) do nothing;
-- Every other (role, module) pair is implicitly false (absent row).

-- Remove the employee change-request system — employees cannot edit
-- anything any more, so this table (and the pages/actions that used it) is
-- being deleted outright, not just hidden.
drop policy if exists "employee_profile_requests_select_own" on public.employee_profile_requests;
drop policy if exists "employee_profile_requests_insert_own" on public.employee_profile_requests;
drop table if exists public.employee_profile_requests;
