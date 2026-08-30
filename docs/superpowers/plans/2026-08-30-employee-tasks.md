# Employee Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A company-wide task board — create a task, assign it, drag it
across a 3-column Kanban board (To Do / In Progress / Done), and see who
changed what and when.

**Architecture:** One new module key (`tasks`, enabled for both `hr` and
`employee` by default) with two new tables (`tasks`, `task_events`). A
board page at `/hrm/tasks` renders a `dnd-kit`-powered client component
for drag-and-drop status changes; a detail page at `/hrm/tasks/[id]`
handles editing and shows the activity history.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (`@supabase/ssr`,
RLS-scoped client only — no service-role client needed), Tailwind CSS v4,
zod, `@dnd-kit/core` (new dependency, added in Task 2).

**Spec:** `docs/superpowers/specs/2026-08-30-employee-tasks-design.md`

## Global Constraints

- No automated test suite in this repo — `npm run build` succeeding with
  zero TypeScript errors is the acceptance bar for every task.
- Every single-row Supabase lookup (`.single()`) must capture the `error`
  and check `error.code !== 'PGRST116'` (throwing/redirecting on a real
  error) before treating the row as genuinely missing — never discard the
  error.
- RLS policies on both new tables MUST include `and u.is_active` in their
  `using`/`with check` predicates (`exists (select 1 from public.users u
  where u.id = (select auth.uid()) and u.is_active)`) — a deactivated
  employee's Auth password still authenticates, so omitting `is_active`
  gives them full REST-level access via the anon key. This exact class of
  bug reached a final review once already (Client Marketing Metrics); it
  does not get a second chance here — write it correctly in Task 1's
  migration from the start.
- `updateTaskStatus` (Task 2) is a deliberate, necessary exception to this
  codebase's usual "action takes `FormData`, ends in `redirect()`"
  pattern. It is invoked directly from a client component's drag handler
  (`updateTaskStatus(taskId, newStatus)`, plain arguments, not a
  `<form action={...}>` submission), so it cannot `redirect()` — that
  would force a full navigation on every card drag, breaking the board's
  interactivity. It returns `Promise<{ error: string | null }>` instead,
  and the client component reverts its optimistic UI state on a non-null
  error. This is correct as designed — do not "fix" it back to the
  `FormData`/`redirect()` shape, and do not flag the inconsistency with
  `createTask`/`updateTask` in the same or a sibling file as a defect.
- `task_events.field` is exactly one of `'created' | 'status' | 'assignee'
  | 'priority'` — matches the database CHECK constraint. Any other value
  is a bug.

---

### Task 1: Migration, types, validation, and event-logging helper

**Files:**
- Create: `supabase/migrations/0016_tasks.sql`
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`
- Create: `lib/task-events.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this plan).
- Produces:
  - DB tables `tasks` (columns: `id`, `title`, `description`, `status`,
    `priority`, `assignee_id`, `due_date`, `created_by`, `created_at`,
    `updated_at`) and `task_events` (columns: `id`, `task_id`, `field`,
    `from_value`, `to_value`, `changed_by`, `created_at`), both typed in
    `Database['public']['Tables']` so `supabase.from('tasks')` /
    `.from('task_events')` are fully typed in later tasks. `Module` type
    gains `'tasks'`.
  - `lib/validation.ts`: `taskStatuses = ['todo', 'in_progress', 'done']
    as const`, `taskPriorities = ['low', 'medium', 'high', 'urgent'] as
    const`, `createTaskSchema` (fields: `title`, `description`,
    `priority`, `assigneeId`, `dueDate`), `updateTaskStatusSchema`
    (fields: `taskId`, `status`), `updateTaskSchema` (fields: `taskId`,
    `title`, `description`, `status`, `priority`, `assigneeId`,
    `dueDate`) — exact zod shapes below. `moduleKeys` gains `'tasks'`.
  - `lib/task-events.ts`: `export function logTaskEvent(supabase:
    Awaited<ReturnType<typeof createClient>>, taskId: string, field:
    'created' | 'status' | 'assignee' | 'priority', fromValue: string |
    null, toValue: string | null, changedBy: string)` — returns the
    Supabase insert result directly (`{ data, error }`), so a caller does
    `const { error } = await logTaskEvent(...)`. Tasks 2 and 3 both
    import and call this — it is the single place a `task_events` row
    gets written, so the two write paths can't drift out of sync.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0016_tasks.sql`:

```sql
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
```

This migration is NOT run automatically — this repo has no migration
runner. It is run by hand later, in the Supabase SQL editor, by the human
operator.

- [ ] **Step 2: Add `'tasks'` to the `Module` type and the new tables to `types/database.ts`**

In `types/database.ts`, find this line near the top of the file:

```typescript
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory' | 'leave_attendance' | 'onboarding' | 'offboarding' | 'recruitment'
```

Change it to:

```typescript
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory' | 'leave_attendance' | 'onboarding' | 'offboarding' | 'recruitment' | 'tasks'
```

Then add these two entries inside `Database['public']['Tables']`, after
the last existing entry (`candidates`, or `client_metrics` — whichever is
last in the file when you open it; both are fine, this only needs to be
somewhere inside the `Tables` object) and before the closing `}` of
`Tables`:

```typescript
      tasks: {
        Row: {
          id: string
          title: string
          description: string
          status: TaskStatus
          priority: TaskPriority
          assignee_id: string | null
          due_date: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          title: string
          description?: string
          status?: TaskStatus
          priority?: TaskPriority
          assignee_id?: string | null
          due_date?: string | null
          created_by?: string | null
        }
        Update: Partial<{
          title: string
          description: string
          status: TaskStatus
          priority: TaskPriority
          assignee_id: string | null
          due_date: string | null
          updated_at: string
        }>
        Relationships: []
      }
      task_events: {
        Row: {
          id: string
          task_id: string
          field: TaskEventField
          from_value: string | null
          to_value: string | null
          changed_by: string | null
          created_at: string
        }
        Insert: {
          task_id: string
          field: TaskEventField
          from_value?: string | null
          to_value?: string | null
          changed_by?: string | null
        }
        Update: never
        Relationships: []
      }
```

Also add these three type aliases near the top of the file, next to the
other type aliases (e.g. right after the `Module` line you just edited):

```typescript
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskEventField = 'created' | 'status' | 'assignee' | 'priority'
```

- [ ] **Step 3: Add the validation schemas to `lib/validation.ts`**

Find this line:

```typescript
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment'] as const
```

Change it to:

```typescript
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment', 'tasks'] as const
```

Then append to the end of `lib/validation.ts`:

```typescript
export const taskStatuses = ['todo', 'in_progress', 'done'] as const

export const taskPriorities = ['low', 'medium', 'high', 'urgent'] as const

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  priority: z.enum(taskPriorities),
  assigneeId: z.string().uuid().optional().or(z.literal('')),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional().or(z.literal('')),
})

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(taskStatuses),
})

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  assigneeId: z.string().uuid().optional().or(z.literal('')),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional().or(z.literal('')),
})
```

- [ ] **Step 4: Write the event-logging helper**

Create `lib/task-events.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'

export function logTaskEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  field: 'created' | 'status' | 'assignee' | 'priority',
  fromValue: string | null,
  toValue: string | null,
  changedBy: string
) {
  return supabase.from('task_events').insert({
    task_id: taskId,
    field,
    from_value: fromValue,
    to_value: toValue,
    changed_by: changedBy,
  })
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds with zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0016_tasks.sql types/database.ts lib/validation.ts lib/task-events.ts
git commit -m "Add tasks schema, types, validation, and event-logging helper"
```

---

### Task 2: Task board — create, drag-and-drop status, filter

**Files:**
- Create: `app/hrm/tasks/actions.ts`
- Create: `app/hrm/tasks/task-board.tsx`
- Create: `app/hrm/tasks/page.tsx`

**Interfaces:**
- Consumes: `createTaskSchema`, `updateTaskStatusSchema` from
  `lib/validation.ts` (Task 1); `logTaskEvent` from `lib/task-events.ts`
  (Task 1); DB tables `tasks`/`task_events`/`users` (Task 1 for
  `tasks`/`task_events`; `users` already exists).
- Produces: server actions `createTask(formData: FormData)` — the usual
  `FormData` + `redirect()` shape — and `updateTaskStatus(taskId: string,
  status: 'todo' | 'in_progress' | 'done'): Promise<{ error: string |
  null }>` — the deliberate exception described in Global Constraints,
  both from `app/hrm/tasks/actions.ts`; the client component `TaskBoard`
  from `app/hrm/tasks/task-board.tsx`. Task 3 does not import from this
  task.

- [ ] **Step 1: Install `@dnd-kit/core`**

Run: `npm install @dnd-kit/core`
Expected: `package.json` gains a `@dnd-kit/core` dependency; `npm
install` exits 0. (Only `@dnd-kit/core` is needed — not
`@dnd-kit/sortable` — since v1 only needs cross-column drag, not
in-column reordering.)

- [ ] **Step 2: Write the board actions**

Create `app/hrm/tasks/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createTaskSchema, updateTaskStatusSchema } from '@/lib/validation'
import { logTaskEvent } from '@/lib/task-events'
import type { TaskStatus } from '@/types/database'

export async function createTask(formData: FormData) {
  const user = await requireModule('tasks')

  const parsed = createTaskSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    priority: formData.get('priority'),
    assigneeId: formData.get('assigneeId'),
    dueDate: formData.get('dueDate'),
  })

  if (!parsed.success) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { title, description, priority, assigneeId, dueDate } = parsed.data

  const supabase = await createClient()
  const { data: created, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description: description || '',
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !created) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(error?.message ?? 'Failed to create task'))
  }

  const { error: eventError } = await logTaskEvent(supabase, created.id, 'created', null, 'todo', user.id)

  if (eventError) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(eventError.message))
  }

  revalidatePath('/hrm/tasks')
  redirect('/hrm/tasks')
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<{ error: string | null }> {
  const user = await requireModule('tasks')

  const parsed = updateTaskStatusSchema.safeParse({ taskId, status })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: current, error: currentError } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', parsed.data.taskId)
    .single()

  if (currentError && currentError.code !== 'PGRST116') {
    return { error: currentError.message }
  }

  if (!current) {
    return { error: 'Task not found' }
  }

  const previousStatus = current.status

  const { data: updated, error } = await supabase
    .from('tasks')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.taskId)
    .select('id')
    .single()

  if (!updated) {
    return { error: !error || error.code === 'PGRST116' ? 'Task not found' : error.message }
  }

  if (previousStatus !== parsed.data.status) {
    const { error: eventError } = await logTaskEvent(
      supabase,
      parsed.data.taskId,
      'status',
      previousStatus,
      parsed.data.status,
      user.id
    )

    if (eventError) {
      return { error: eventError.message }
    }
  }

  revalidatePath('/hrm/tasks')
  return { error: null }
}
```

- [ ] **Step 3: Write the board client component**

Create `app/hrm/tasks/task-board.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import type { TaskPriority, TaskStatus } from '@/types/database'

interface BoardTask {
  id: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  assignee_id: string | null
  due_date: string | null
}

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
]

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

function TaskCard({ task, assigneeName }: { task: BoardTask; assigneeName: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
    >
      <Link href={`/hrm/tasks/${task.id}`} className="font-medium text-slate-800 hover:underline">
        {task.title}
      </Link>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span className={`rounded-full px-2 py-0.5 ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
        <span>{assigneeName}</span>
      </div>
      {task.due_date && <div className="mt-1 text-xs text-slate-400">Due {task.due_date}</div>}
    </div>
  )
}

function Column({
  status,
  label,
  tasks,
  employeeNames,
}: {
  status: TaskStatus
  label: string
  tasks: BoardTask[]
  employeeNames: Record<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] flex-1 rounded-xl border border-slate-200 p-3 ${
        isOver ? 'bg-slate-50' : 'bg-slate-100/50'
      }`}
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-600">
        {label} <span className="text-slate-400">({tasks.length})</span>
      </h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assigneeName={task.assignee_id ? (employeeNames[task.assignee_id] ?? 'Unknown') : 'Unassigned'}
          />
        ))}
      </div>
    </div>
  )
}

export function TaskBoard({
  tasks,
  employeeNames,
  updateTaskStatus,
}: {
  tasks: BoardTask[]
  employeeNames: Record<string, string>
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<{ error: string | null }>
}) {
  const [localTasks, setLocalTasks] = useState(tasks)
  const [, startTransition] = useTransition()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const taskId = String(active.id)
    const newStatus = over.id as TaskStatus

    const task = localTasks.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return

    const previousStatus = task.status
    setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))

    startTransition(() => {
      updateTaskStatus(taskId, newStatus).then((result) => {
        if (result.error) {
          setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t)))
        }
      })
    })
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.status}
            status={column.status}
            label={column.label}
            tasks={localTasks.filter((task) => task.status === column.status)}
            employeeNames={employeeNames}
          />
        ))}
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 4: Write the board page**

Create `app/hrm/tasks/page.tsx`:

```tsx
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createTask, updateTaskStatus } from './actions'
import { TaskBoard } from './task-board'

export default async function TasksBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; assignee?: string }>
}) {
  const user = await requireModule('tasks')
  const { error, assignee } = await searchParams
  const supabase = await createClient()

  const { data: employees } = await supabase.from('users').select('id, name').eq('is_active', true).order('name')

  let query = supabase
    .from('tasks')
    .select('id, title, priority, status, assignee_id, due_date')
    .order('created_at', { ascending: true })

  if (assignee === 'me') {
    query = query.eq('assignee_id', user.id)
  } else if (assignee) {
    query = query.eq('assignee_id', assignee)
  }

  const { data: tasks } = await query

  const allTasks = tasks ?? []
  const allEmployees = employees ?? []
  const employeeNames = Object.fromEntries(allEmployees.map((employee) => [employee.id, employee.name]))

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Tasks</h1>
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        <form className="mt-3 flex items-center gap-2">
          <select
            name="assignee"
            defaultValue={assignee ?? ''}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="">All tasks</option>
            <option value="me">My tasks</option>
            {allEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Filter
          </button>
        </form>

        <form action={createTask} className="mt-4 grid grid-cols-5 gap-2">
          <input
            name="title"
            placeholder="Task title"
            required
            className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <select
            name="assigneeId"
            defaultValue=""
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {allEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue="medium"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <input
            name="dueDate"
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="col-span-5 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New task
          </button>
        </form>
      </div>

      <TaskBoard tasks={allTasks} employeeNames={employeeNames} updateTaskStatus={updateTaskStatus} />
    </div>
  )
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds with zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/hrm/tasks/actions.ts app/hrm/tasks/task-board.tsx app/hrm/tasks/page.tsx
git commit -m "Add task board: create task, drag-and-drop status via dnd-kit, assignee filter"
```

---

### Task 3: Task detail page — edit and activity history

**Files:**
- Create: `app/hrm/tasks/[id]/actions.ts`
- Create: `app/hrm/tasks/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateTaskSchema` from `lib/validation.ts` (Task 1);
  `logTaskEvent` from `lib/task-events.ts` (Task 1); DB tables
  `tasks`/`task_events`/`users` (Task 1/existing). Does not import
  anything from Task 2 — this is a separate route with its own
  self-contained action.
- Produces: server action `updateTask(formData: FormData)` from
  `app/hrm/tasks/[id]/actions.ts` (the usual `FormData` + `redirect()`
  shape). Nothing later in this plan consumes this task's exports — Task
  4 only adds a nav link to `/hrm/tasks` (Task 2's route), not this one.

- [ ] **Step 1: Write the detail-page action**

Create `app/hrm/tasks/[id]/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { updateTaskSchema } from '@/lib/validation'
import { logTaskEvent } from '@/lib/task-events'

export async function updateTask(formData: FormData) {
  const user = await requireModule('tasks')

  const rawTaskId = formData.get('taskId')

  const parsed = updateTaskSchema.safeParse({
    taskId: rawTaskId,
    title: formData.get('title'),
    description: formData.get('description'),
    status: formData.get('status'),
    priority: formData.get('priority'),
    assigneeId: formData.get('assigneeId'),
    dueDate: formData.get('dueDate'),
  })

  if (!parsed.success) {
    redirect(`/hrm/tasks/${rawTaskId}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { taskId, title, description, status, priority, assigneeId, dueDate } = parsed.data

  const supabase = await createClient()

  const { data: current, error: currentError } = await supabase
    .from('tasks')
    .select('status, priority, assignee_id')
    .eq('id', taskId)
    .single()

  if (currentError && currentError.code !== 'PGRST116') {
    redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(currentError.message))
  }

  if (!current) {
    redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent('Task not found'))
  }

  const newAssigneeId = assigneeId || null

  const { data: updated, error } = await supabase
    .from('tasks')
    .update({
      title,
      description: description || '',
      status,
      priority,
      assignee_id: newAssigneeId,
      due_date: dueDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Task not found' : error.message
    redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(message))
  }

  if (current.status !== status) {
    const { error: eventError } = await logTaskEvent(supabase, taskId, 'status', current.status, status, user.id)
    if (eventError) {
      redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(eventError.message))
    }
  }

  if (current.priority !== priority) {
    const { error: eventError } = await logTaskEvent(
      supabase,
      taskId,
      'priority',
      current.priority,
      priority,
      user.id
    )
    if (eventError) {
      redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(eventError.message))
    }
  }

  if (current.assignee_id !== newAssigneeId) {
    const { error: eventError } = await logTaskEvent(
      supabase,
      taskId,
      'assignee',
      current.assignee_id,
      newAssigneeId,
      user.id
    )
    if (eventError) {
      redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(eventError.message))
    }
  }

  revalidatePath(`/hrm/tasks/${taskId}`)
  revalidatePath('/hrm/tasks')
  redirect(`/hrm/tasks/${taskId}`)
}
```

- [ ] **Step 2: Write the detail page**

Create `app/hrm/tasks/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { updateTask } from './actions'

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('tasks')
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, description, status, priority, assignee_id, due_date')
    .eq('id', id)
    .single()

  if (taskError && taskError.code !== 'PGRST116') {
    throw new Error(taskError.message)
  }

  if (!task) notFound()

  const { data: employees } = await supabase.from('users').select('id, name').eq('is_active', true).order('name')

  const allEmployees = employees ?? []
  const employeeById = new Map(allEmployees.map((employee) => [employee.id, employee.name]))

  const { data: events } = await supabase
    .from('task_events')
    .select('id, field, from_value, to_value, changed_by, created_at')
    .eq('task_id', id)
    .order('created_at', { ascending: false })

  function describeValue(field: string, value: string | null): string {
    if (value === null) return field === 'assignee' ? 'Unassigned' : '—'
    if (field === 'assignee') return employeeById.get(value) ?? 'Unknown'
    return value
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateTask} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="taskId" value={task.id} />
        <input
          name="title"
          defaultValue={task.title}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:border-slate-800 focus:outline-none"
        />
        <textarea
          name="description"
          defaultValue={task.description}
          placeholder="Description"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            name="status"
            defaultValue={task.status}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select
            name="priority"
            defaultValue={task.priority}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            name="assigneeId"
            defaultValue={task.assignee_id ?? ''}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {allEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <input
            name="dueDate"
            type="date"
            defaultValue={task.due_date ?? ''}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Activity</h2>
        <ul className="mt-3 space-y-2">
          {(events ?? []).map((event) => (
            <li key={event.id} className="text-sm text-slate-600">
              {event.field === 'created' ? (
                <span>Task created</span>
              ) : (
                <span>
                  {event.field} changed from {describeValue(event.field, event.from_value)} to{' '}
                  {describeValue(event.field, event.to_value)}
                </span>
              )}
              <div className="text-xs text-slate-400">
                {employeeById.get(event.changed_by ?? '') ?? 'Unknown'} — {new Date(event.created_at).toLocaleString()}
              </div>
            </li>
          ))}
          {(events ?? []).length === 0 && <li className="text-sm text-slate-400">No activity yet.</li>}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/hrm/tasks/\[id\]/actions.ts app/hrm/tasks/\[id\]/page.tsx
git commit -m "Add task detail page: edit form and activity history"
```

---

### Task 4: Nav link

**Files:**
- Modify: `components/nav-links.tsx`

**Interfaces:**
- Consumes: nothing new — reads the `Module` type (already gained
  `'tasks'` in Task 1).
- Produces: nothing later tasks depend on — this is the last task.

- [ ] **Step 1: Add the nav entry**

In `components/nav-links.tsx`, add `ListTodo` to the `lucide-react`
import list:

```typescript
import {
  LayoutDashboard,
  Target,
  Building2,
  LayoutGrid,
  CircleUserRound,
  CalendarDays,
  Clock,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Briefcase,
  ListTodo,
  Settings as SettingsIcon,
} from 'lucide-react'
```

Then add this entry to `NAV_ITEMS`, right after the Recruitment entry and
before the Settings entry:

```typescript
  { href: '/hrm/tasks', label: 'Tasks', icon: ListTodo, module: 'tasks' },
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds with zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/nav-links.tsx
git commit -m "Add Tasks nav link"
```

---

### Task 5: Manual QA (human operator)

This task is reserved for the user — no subagent has real login
credentials for this app. Run the migration by hand first, then:

- [ ] Run `supabase/migrations/0016_tasks.sql` in the Supabase SQL
  editor.
- [ ] Create a task, assign it to another employee, set a priority and
  due date.
- [ ] On the board, drag the task from To Do to In Progress, then to
  Done. Confirm it lands in the right column each time and the board
  doesn't lose other cards.
- [ ] Open the task's detail page — confirm its activity history shows
  the creation event and both status-change events, each with the
  correct actor and timestamp.
- [ ] From the detail page, reassign the task to a different employee and
  change its priority — confirm both changes are logged in the activity
  history.
- [ ] Use the assignee filter to show "My tasks" — confirm only tasks
  assigned to you appear. Switch to a specific employee and confirm the
  same for them.
- [ ] Log in as a different employee (not the task's creator or
  assignee) and confirm they can also create, drag, and edit any task.
- [ ] Confirm the module gate hides the nav link and redirects away when
  `tasks` is disabled for a role (live-toggle test via
  `role_module_access`).
- [ ] Confirm `npm run build` is green on the final branch state.
