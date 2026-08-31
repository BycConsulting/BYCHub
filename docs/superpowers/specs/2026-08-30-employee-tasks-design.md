# Employee Tasks — Design Spec

**Date:** 2026-08-30
**Status:** Approved for planning

## Context

There is no way today to assign work to an employee and track it through
to completion inside BYC Hub — that happens outside the app entirely
(Slack, verbal, spreadsheets). This sub-project adds a company-wide task
board: create a task, assign it to someone, watch it move through a
simple Kanban board, and see a history of who changed what.

This is explicitly a first sub-project, not a full Azure-Boards/Jira
clone. It ships the smallest version of "assign and track work" that is
useful on its own — a flat task list on a 3-column board with an activity
history — and leaves richer planning machinery (epics, sprints, comments,
time tracking, per-team boards) for later sub-projects built on top of it,
the same way Recruitment's pipeline was scoped down from a full ATS.

## Build vs. adopt an existing tool

Before designing this, two open-source options were evaluated at the
user's request: [Plane](https://github.com/makeplane/plane) (58.5k
stars, AGPL-3.0) and [Huly](https://github.com/hcengineering/platform)
(27.5k stars, EPL-2.0). Both are mature, full-featured project-management
platforms — and both are complete standalone applications with their own
backend, database, and login:

- **Plane:** Django + Node backend, PostgreSQL + Redis, Docker Compose/
  Kubernetes deployment.
- **Huly:** Svelte frontend, MongoDB + Elasticsearch + MinIO, ~35GB
  deployed footprint, Docker Compose deployment.

Neither runs on Vercel (BYC Hub's host) or against BYC Hub's existing
Supabase database. Adopting either means standing up and operating a
second application indefinitely: a second login employees would need
(bridged via SSO setup, itself a real integration project), a second
copy of "who works here" that has to be kept in sync with BYC Hub's
employee directory by hand or via a sync job, and separate hosting. That
is a different, ongoing kind of work than building a module here — not
less work, and it breaks the single-login "everything in one place"
pattern every other BYC Hub module follows.

**Decision: build natively**, using `dnd-kit` (a lightweight, unstyled
React drag-and-drop library — no backend, no data model, no auth) for the
board's drag-and-drop interaction, so the one genuinely fiddly UI piece
isn't hand-rolled. Everything else (schema, server actions, access
control) is necessarily custom either way, matching how every other BYC
Hub module is built.

## Scope of this sub-project

- `/hrm/tasks`: a 3-column Kanban board (To Do / In Progress / Done),
  drag a card to change its status, a filter (All / My tasks / a specific
  employee), and a compact form to create a new task.
- `/hrm/tasks/[id]`: edit a task's description, priority, assignee, due
  date, and status; view its activity history.
- One new module key (`tasks`), enabled by default for both `hr` and
  `employee` roles — this is company-wide, not HR-only.
- Two new tables: `tasks` and `task_events` (the activity history).

## Decisions from brainstorming

- **Flat tasks only, no epic/hierarchy.** One work-item type. Azure
  Boards' work-item types, parent/child links, and area/iteration paths
  are real complexity this sub-project doesn't need to prove the basic
  "assign and track work" loop is useful.
- **One shared board, filterable by assignee** — not per-team/per-project
  boards. No new Team/Project entity or membership model. Matches how
  `/clients` and `/leads` already work: one shared space, not siloed by
  group.
- **Activity tracking is status/assignment history only.** Every status
  change and reassignment is logged with who and when — an audit trail
  and a "what did X work on" view, scoped entirely to tasks. No comment
  threads, no time tracking — each of those is a real feature with its
  own data model and belongs in a later sub-project if wanted.
- **Sprints are a later sub-project.** v1's board has no time-boxing —
  just the three statuses. A Sprint entity (date range, sprint backlog,
  burndown) is real planning machinery that deserves its own design once
  the basic task/board loop is proven useful.
- **Company-wide by default**, unlike Onboarding/Offboarding/Recruitment
  (HR-only). `tasks` is granted to both `hr` and `employee` by default in
  the migration, the same pattern `leave_attendance` uses — everyone
  needs to see and act on their own tasks.

## Architecture

```
app/hrm/tasks/
  page.tsx                      board page: fetches tasks + active
                                 employees, renders the filter dropdown,
                                 the new-task form, and <TaskBoard>
  task-board.tsx                'use client' — dnd-kit DndContext, three
                                 droppable columns, calls updateTaskStatus
                                 on drop
  actions.ts                    createTask, updateTaskStatus
  [id]/
    page.tsx                    task detail: edit form + activity history
    actions.ts                  updateTask (description/priority/
                                 assignee/due date/status)
lib/task-events.ts               logTaskEvent(supabase, taskId, field,
                                 fromValue, toValue, changedBy) — shared
                                 by both actions.ts files so the two
                                 write paths can't drift
supabase/migrations/
  0016_tasks.sql                 widens role_module_access CHECK to add
                                 'tasks', grants it to 'hr' and 'employee'
                                 by default, creates tasks and
                                 task_events
```

`components/nav-links.tsx`'s `NAV_ITEMS` gains one new entry (`Tasks` →
`/hrm/tasks`, module `'tasks'`, icon `ListTodo` from `lucide-react`).

## Data model

```sql
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
```

Both tables use the `and u.is_active` all-employee RLS pattern from the
start — the pattern every table in this app is supposed to use, and the
one the Client Marketing Metrics module's final review caught missing
before it ever reached a live database.

`task_events.field = 'created'` records the task's creation (`from_value`
null, `to_value` the initial status/assignee — one row per task at
creation, capturing whichever fields were set). `status` and `assignee`
rows record every subsequent change; `priority` changes are logged too
since priority is part of what "tracking activity" means here, even
though the board itself doesn't visualize priority history.

## Access control

- `requireModule('tasks')` gates both routes — no extra role check, since
  `tasks` is enabled for both `hr` and `employee` by default and `admin`
  bypasses the module matrix entirely. Any employee can create a task,
  assign it to anyone, and move any task's status — matches how
  `clients`/`leads` already work (no per-record ownership gate).
- All reads/writes use the RLS-scoped client (`createClient()`), matching
  the `and u.is_active` policy above — no service-role client needed.

## Board mechanics

`TaskBoard` (client component) receives the fetched tasks grouped into
three arrays (`todo`, `in_progress`, `done`) and the employee list for
display (assignee name/avatar-initial on each card). `dnd-kit`'s
`DndContext` wraps three droppable columns; dropping a card into a
different column calls `updateTaskStatus(taskId, newStatus)` (a server
action), which updates `tasks.status` and inserts a `task_events` row
(`field: 'status'`) in the same request. The board optimistically moves
the card in local state on drop and reconciles on the server action's
response — matches this app's existing pattern of Server Actions driving
mutations, with the minimum client state needed for drag interactivity.

The filter dropdown is a plain `<select>` in a GET form (`?assignee=me`
or `?assignee=<uuid>` or omitted for all), read via `searchParams` on the
server component — the same no-JS-required filtering pattern used by the
Client Marketing Metrics month picker.

## Testing

Manual QA, consistent with the rest of this app (no automated test
suite): create a task, assign it to another employee, drag it from To Do
to In Progress to Done, confirm each move is logged in the task's
activity history with the correct from/to values and actor; reassign a
task and confirm that's logged too; filter the board to "My tasks" and
confirm it only shows tasks assigned to the current user; confirm a
different employee can also create/assign/move any task (no ownership
gate); confirm the module gate hides the nav link and redirects away when
`tasks` is disabled for a role (live-toggle test via `role_module_access`).

## Out of scope for this sub-project

- Epics/parent-child work-item hierarchy.
- Sprints/iterations, backlogs, burndown charts, capacity planning.
- Comment threads on tasks.
- Time tracking / logged hours.
- Per-team or per-project boards; a Team/Project entity.
- Linking a task to another BYC Hub entity (a client, a lead, a
  candidate).
- Adopting an external tool (Plane, Huly, or similar) — evaluated and
  declined above; each is a separate full-stack application with its own
  database and login.
