-- supabase/migrations/0018_tasks_v2.sql
-- Tasks v2: client/project, expected output, support, effort, dependencies,
-- start date, blocker reason, completion timestamp, and a comments thread.
-- client_id null = BYC internal work. due_date is the task's End date.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects_all_employees" on public.projects
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

-- Statuses: todo -> started, plus a blocked/waiting state.
alter table public.tasks drop constraint if exists tasks_status_check;
update public.tasks set status = 'started' where status = 'todo';
alter table public.tasks alter column status set default 'started';
alter table public.tasks add constraint tasks_status_check
  check (status in ('started', 'in_progress', 'blocked', 'done'));

-- Existing rows keep nulls here; the app enforces required fields on save.
alter table public.tasks
  add column client_id uuid references public.clients(id),
  add column project_id uuid references public.projects(id),
  add column expected_output text not null default '',
  add column support_ids uuid[] not null default '{}',
  add column no_support_needed boolean not null default false,
  add column estimated_hours numeric(6,2) check (estimated_hours is null or estimated_hours > 0),
  add column dependency_task_ids uuid[] not null default '{}',
  add column dependency_note text not null default '',
  add column start_date date,
  add column blocker_reason text not null default '',
  add column completed_at timestamptz;

update public.tasks set completed_at = updated_at where status = 'done' and completed_at is null;

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id),
  body text not null,
  is_final boolean not null default false,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.task_comments enable row level security;

create policy "task_comments_all_employees" on public.task_comments
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

create index task_comments_task_id_idx on public.task_comments (task_id, created_at);
create index tasks_project_id_idx on public.tasks (project_id);
