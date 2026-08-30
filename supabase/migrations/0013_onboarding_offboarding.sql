-- supabase/migrations/0013_onboarding_offboarding.sql

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
  check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding'));

-- Only 'hr' gets these by default -- this module is HR-only end to end,
-- unlike leave_attendance which every role uses.
insert into public.role_module_access (role, module, enabled) values
  ('hr', 'onboarding', true),
  ('hr', 'offboarding', true)
on conflict (role, module) do nothing;

create table public.onboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  started_at timestamptz not null default now(),
  started_by uuid references public.users(id),
  step_offer_letter_signed boolean not null default false,
  step_id_proof_collected boolean not null default false,
  step_equipment_assigned boolean not null default false,
  step_accounts_provisioned boolean not null default false,
  step_orientation_completed boolean not null default false,
  step_documents_filed boolean not null default false,
  notes text not null default '',
  completed_at timestamptz
);

alter table public.onboarding_checklists enable row level security;

create table public.offboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  started_at timestamptz not null default now(),
  started_by uuid references public.users(id),
  step_resignation_recorded boolean not null default false,
  step_exit_interview_done boolean not null default false,
  step_assets_returned boolean not null default false,
  step_accounts_deprovisioned boolean not null default false,
  step_final_settlement_done boolean not null default false,
  notes text not null default '',
  completed_at timestamptz
);

alter table public.offboarding_checklists enable row level security;

create unique index onboarding_checklists_one_open_per_user
  on public.onboarding_checklists (user_id) where completed_at is null;

create unique index offboarding_checklists_one_open_per_user
  on public.offboarding_checklists (user_id) where completed_at is null;
