-- supabase/migrations/0014_recruitment.sql

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
  check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment'));

insert into public.role_module_access (role, module, enabled) values
  ('hr', 'recruitment', true)
on conflict (role, module) do nothing;

create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

alter table public.job_openings enable row level security;

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references public.job_openings(id),
  name text not null,
  email text not null default '',
  phone text not null default '',
  resume_notes text not null default '',
  stage text not null default 'applied'
    check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  notes text not null default '',
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidates enable row level security;
