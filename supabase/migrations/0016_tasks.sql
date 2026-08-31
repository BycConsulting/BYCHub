-- supabase/migrations/0016_tasks.sql

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
  check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment', 'tasks'));

insert into public.role_module_access (role, module, enabled) values
  ('hr', 'tasks', true),
  ('employee', 'tasks', true)
on conflict (role, module) do nothing;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid references public.users(id),
  due_date date,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks_all_employees" on public.tasks
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id),
  field text not null check (field in ('created', 'status', 'assignee', 'priority')),
  from_value text,
  to_value text,
  changed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.task_events enable row level security;

create policy "task_events_all_employees" on public.task_events
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));
