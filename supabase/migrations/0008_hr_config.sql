-- `id boolean primary key default true check (id)` is the standard Postgres
-- singleton-table idiom: a boolean primary key can only ever hold one
-- distinct value, so a second row is structurally impossible, not merely
-- a convention this app has to uphold in application code.
create table if not exists public.hr_config (
  id boolean primary key default true check (id),
  working_monday boolean not null default true,
  working_tuesday boolean not null default true,
  working_wednesday boolean not null default true,
  working_thursday boolean not null default true,
  working_friday boolean not null default true,
  working_saturday boolean not null default true,
  working_sunday boolean not null default false,
  casual_leave_days integer not null default 12,
  sick_leave_days integer not null default 12,
  earned_leave_days integer not null default 15,
  maternity_leave_days integer not null default 182,
  paternity_leave_days integer not null default 15,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

-- No policies for `authenticated` on purpose: read and written exclusively
-- through the service-role client (the config page's read, the update
-- action's write) — same lockdown pattern as `role_module_access`.
alter table public.hr_config enable row level security;

insert into public.hr_config (id) values (true)
on conflict (id) do nothing;
