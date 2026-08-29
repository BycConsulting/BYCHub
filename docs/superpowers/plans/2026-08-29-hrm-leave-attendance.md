# BYC HRM Leave/Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Leave & WFH and Attendance from plain, always-visible pages
into a module-gated `/hrm/leave` + `/hrm/attendance` section with the same
sidebar/design system as the rest of the app, and add a leave calendar,
HR-managed holidays, richer attendance reports with CSV export, and
informational shift assignment — then delete the old pages.

**Architecture:** Existing leave/attendance business logic (balance math,
manager-routed approval, IP-allowlisted check-in/out, HR corrections) is
ported byte-for-byte into new files under `app/hrm/leave/` and
`app/hrm/attendance/`, only swapping `requireUser()` for
`requireModule('leave_attendance')` and updating redirect paths. Four new
pages (calendar, holidays, team view, shifts, reports) are genuinely new
code built on two new tables (`holidays`, `shifts`) and one new column
(`employee_profiles.shift_id`), all read via the existing service-role
"admin client + explicit column list" pattern already used everywhere else
in this codebase.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres +
service-role client), Tailwind CSS v4, zod. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-hrm-leave-attendance-design.md`

## Global Constraints

- No automated test suite — `npm run build` succeeding with zero
  TypeScript errors is the acceptance bar for every task.
- Migrations are MANUAL — write the SQL file, but running it against
  Supabase is a step the human operator performs by hand in the SQL
  editor (same convention as every prior migration in this repo).
- Never break the "manager-routed requests never appear in HR's queue and
  vice versa" invariant, and never change `computeBalance`/`dayCount` in
  `lib/leave.ts` — holidays never subtract from leave balances.
- Shifts are informational only in this sub-project — no attendance
  validation/enforcement logic keys off `shift_id`.
- Primary color `#1e293b` (Tailwind `slate-800`), white `rounded-xl`
  cards, `lucide-react` icons — match every other page already restyled
  in this app.

---

### Task 1: Migration + types + validation

**Files:**
- Create: `supabase/migrations/0012_leave_attendance_module.sql`
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`
- Modify: `lib/access.ts:57-64`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Module` type includes `'leave_attendance'`; `moduleKeys`
  array includes `'leave_attendance'`; `MODULE_PATHS['leave_attendance']
  = '/hrm/leave'`; `Database['public']['Tables']['holidays']` and
  `Database['public']['Tables']['shifts']` row/insert/update shapes;
  `employee_profiles`'s `Row`/`Update` types include `shift_id: string |
  null`; zod schemas `addHolidaySchema`, `holidayIdSchema`,
  `createShiftSchema`, `assignShiftSchema` — every later task imports
  these exact names from `@/lib/validation`.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Run the migration manually**

By hand in the Supabase SQL editor (this project has no automated
migration runner — see `README.md`). Confirm "Success. No rows returned."

- [ ] **Step 3: Update `types/database.ts`**

Change the `Module` type (currently
`export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory'`)
to:

```typescript
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory' | 'leave_attendance'
```

In the `employee_profiles` table's `Row` type, add `shift_id: string |
null` after `manager_id: string | null`. In its `Update` type (a
`Partial<{...}>`), add `shift_id: string | null` to the same object.

Add two new table entries inside `Database['public']['Tables']`, next to
the existing `attendance_records` entry:

```typescript
      holidays: {
        Row: { id: string; date: string; name: string; created_at: string }
        Insert: { date: string; name: string }
        Update: Partial<{ date: string; name: string }>
        Relationships: []
      }
      shifts: {
        Row: {
          id: string
          name: string
          start_time: string
          end_time: string
          working_monday: boolean
          working_tuesday: boolean
          working_wednesday: boolean
          working_thursday: boolean
          working_friday: boolean
          working_saturday: boolean
          created_at: string
        }
        Insert: {
          name: string
          start_time: string
          end_time: string
          working_monday?: boolean
          working_tuesday?: boolean
          working_wednesday?: boolean
          working_thursday?: boolean
          working_friday?: boolean
          working_saturday?: boolean
        }
        Update: Partial<{
          name: string
          start_time: string
          end_time: string
          working_monday: boolean
          working_tuesday: boolean
          working_wednesday: boolean
          working_thursday: boolean
          working_friday: boolean
          working_saturday: boolean
        }>
        Relationships: []
      }
```

- [ ] **Step 4: Update `lib/validation.ts`**

Change `moduleKeys` (currently
`export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory'] as const`)
to:

```typescript
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance'] as const
```

Append these new schemas at the end of the file:

```typescript
export const addHolidaySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
  name: z.string().trim().min(1, 'Holiday name is required').max(200),
})

export const holidayIdSchema = z.object({
  holidayId: z.string().uuid(),
})

export const createShiftSchema = z
  .object({
    name: z.string().trim().min(1, 'Shift name is required').max(100),
    startTime: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Enter a valid time'),
    endTime: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Enter a valid time'),
    workingMonday: z.boolean(),
    workingTuesday: z.boolean(),
    workingWednesday: z.boolean(),
    workingThursday: z.boolean(),
    workingFriday: z.boolean(),
    workingSaturday: z.boolean(),
  })
  .refine(
    (data) =>
      data.workingMonday ||
      data.workingTuesday ||
      data.workingWednesday ||
      data.workingThursday ||
      data.workingFriday ||
      data.workingSaturday,
    { message: 'At least one weekday must be a working day' }
  )

export const assignShiftSchema = z.object({
  userId: z.string().uuid(),
  shiftId: z.string().uuid().optional().or(z.literal('')),
})
```

- [ ] **Step 5: Update `lib/access.ts`**

In `MODULE_PATHS` (around line 57), add the new key:

```typescript
const MODULE_PATHS: Record<Module, string> = {
  dashboard: '/dashboard',
  leads: '/leads',
  clients: '/clients',
  hr: '/users',
  settings: '/settings',
  directory: '/hrm/directory',
  leave_attendance: '/hrm/leave',
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: compiles with zero TypeScript errors (this task only touches
types/schemas, no page yet imports the new module key or tables).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0012_leave_attendance_module.sql types/database.ts lib/validation.ts lib/access.ts
git commit -m "feat: add leave_attendance module, holidays/shifts tables"
```

---

### Task 2: Port Leave page to /hrm/leave

**Files:**
- Create: `app/hrm/leave/page.tsx`
- Create: `app/hrm/leave/actions.ts`
- Create: `app/hrm/leave/team-actions.ts`

**Interfaces:**
- Consumes: `requireModule('leave_attendance')` from `@/lib/access`
  (Task 1); `submitLeaveRequestSchema`, `leaveRequestIdSchema` from
  `@/lib/validation` (already exist); `rangesOverlap`, `allocationForType`,
  `computeBalance`, `dayCount`, `LEAVE_TYPE_LABELS` from `@/lib/leave`
  (already exist); `ConfirmSubmitButton` from
  `@/app/(app)/confirm-submit-button` (already exists).
- Produces: page renders at `/hrm/leave` with a link to
  `/hrm/leave/calendar` and (HR/admin only) `/hrm/leave/holidays` —
  Task 3 and Task 4 add those pages.

- [ ] **Step 1: Create `app/hrm/leave/actions.ts`**

Byte-identical to the existing `app/(app)/leave/actions.ts`, except every
`requireUser()` call becomes `requireModule('leave_attendance')` and every
`redirect('/leave...')` becomes `redirect('/hrm/leave...')`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { submitLeaveRequestSchema, leaveRequestIdSchema } from '@/lib/validation'
import { rangesOverlap } from '@/lib/leave'

export async function submitLeaveRequest(formData: FormData) {
  const currentUser = await requireModule('leave_attendance')

  const parsed = submitLeaveRequestSchema.safeParse({
    type: formData.get('type'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    reason: formData.get('reason'),
  })

  if (!parsed.success) {
    redirect('/hrm/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()

  const { data: existing, error: existingError } = await supabase
    .from('leave_requests')
    .select('start_date, end_date')
    .eq('user_id', currentUser.id)
    .in('status', ['pending', 'approved'])

  if (existingError) {
    redirect('/hrm/leave?error=' + encodeURIComponent('Could not verify your existing requests, please retry'))
  }

  const overlaps = (existing ?? []).some((request) =>
    rangesOverlap(parsed.data.startDate, parsed.data.endDate, request.start_date, request.end_date)
  )

  if (overlaps) {
    redirect('/hrm/leave?error=' + encodeURIComponent('This date range overlaps an existing request'))
  }

  const { error } = await supabase.from('leave_requests').insert({
    user_id: currentUser.id,
    type: parsed.data.type,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    reason: parsed.data.reason,
  })

  if (error) {
    redirect('/hrm/leave?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/hrm/leave')
  redirect('/hrm/leave')
}

export async function cancelLeaveRequest(formData: FormData) {
  const currentUser = await requireModule('leave_attendance')

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/hrm/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, user_id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.user_id !== currentUser.id || request.status !== 'pending') {
    redirect('/hrm/leave?error=' + encodeURIComponent('Request not found or no longer pending'))
  }

  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.requestId)
    .eq('user_id', currentUser.id)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request no longer pending' : error.message
    redirect('/hrm/leave?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/leave')
  redirect('/hrm/leave')
}
```

- [ ] **Step 2: Create `app/hrm/leave/team-actions.ts`**

Byte-identical to `app/(app)/leave/team-actions.ts`, same
`requireUser()` → `requireModule('leave_attendance')` and
`/leave` → `/hrm/leave` substitutions:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { leaveRequestIdSchema } from '@/lib/validation'

async function reviewTeamRequest(formData: FormData, status: 'approved' | 'rejected') {
  const currentUser = await requireModule('leave_attendance')

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/hrm/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, user_id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/hrm/leave?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  if (request.user_id === currentUser.id) {
    redirect('/hrm/leave?error=' + encodeURIComponent('You cannot review your own request'))
  }

  const { data: profile } = await admin
    .from('employee_profiles')
    .select('manager_id')
    .eq('user_id', request.user_id)
    .single()

  if (!profile || profile.manager_id !== currentUser.id) {
    redirect('/hrm/leave?error=' + encodeURIComponent('You are not authorized to review this request'))
  }

  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request not found or already resolved' : error.message
    redirect('/hrm/leave?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/leave')
  redirect('/hrm/leave')
}

export async function approveTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'approved')
}

export async function rejectTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'rejected')
}
```

- [ ] **Step 3: Create `app/hrm/leave/page.tsx`**

Same content/logic as `app/(app)/leave/page.tsx`, with
`requireUser()` → `requireModule('leave_attendance')`, imports repointed
to the new `./actions`/`./team-actions`, and a small top-of-page link row
(matching the existing `/users` page's cross-link pattern) to the new
calendar and holidays pages:

```typescript
import type { PostgrestError } from '@supabase/supabase-js'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { allocationForType, computeBalance, dayCount, LEAVE_TYPE_LABELS } from '@/lib/leave'
import { submitLeaveRequest, cancelLeaveRequest } from './actions'
import { approveTeamRequest, rejectTeamRequest } from './team-actions'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import type { LeaveRequestType } from '@/types/database'

const BALANCE_TYPES: LeaveRequestType[] = ['casual', 'sick', 'earned', 'maternity', 'paternity']

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { error } = await searchParams

  const supabase = await createClient()
  const admin = createAdminSupabaseClient()

  const { data: myRequests, error: requestsError } = await supabase
    .from('leave_requests')
    .select('id, type, start_date, end_date, reason, status, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  const { data: config, error: configError } = await admin.from('hr_config').select('*').eq('id', true).single()

  const approvedByType = new Map<LeaveRequestType, { start_date: string; end_date: string }[]>()
  for (const request of myRequests ?? []) {
    if (request.status !== 'approved') continue
    const list = approvedByType.get(request.type) ?? []
    list.push({ start_date: request.start_date, end_date: request.end_date })
    approvedByType.set(request.type, list)
  }

  const currentYear = new Date().getFullYear()

  const { data: myReports, error: reportsError } = await admin
    .from('employee_profiles')
    .select('user_id')
    .eq('manager_id', currentUser.id)
  const reportIds = (myReports ?? []).map((report) => report.user_id)

  let teamPending: {
    id: string
    user_id: string
    type: LeaveRequestType
    start_date: string
    end_date: string
    reason: string
    created_at: string
  }[] = []
  let teamNameById = new Map<string, string>()
  const teamApprovedByUserAndType = new Map<string, { start_date: string; end_date: string }[]>()
  let teamPendingError: PostgrestError | null = null
  let teamApprovedError: PostgrestError | null = null

  if (reportIds.length > 0) {
    const { data: pending, error: pendingErr } = await admin
      .from('leave_requests')
      .select('id, user_id, type, start_date, end_date, reason, created_at')
      .in('user_id', reportIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    teamPending = pending ?? []
    teamPendingError = pendingErr

    const { data: reportUsers } = await admin.from('users').select('id, name').in('id', reportIds)
    teamNameById = new Map((reportUsers ?? []).map((user) => [user.id, user.name]))

    const { data: teamApproved, error: approvedErr } = await admin
      .from('leave_requests')
      .select('user_id, type, start_date, end_date')
      .in('user_id', reportIds)
      .eq('status', 'approved')
    teamApprovedError = approvedErr
    for (const request of teamApproved ?? []) {
      const key = `${request.user_id}:${request.type}`
      const list = teamApprovedByUserAndType.get(key) ?? []
      list.push({ start_date: request.start_date, end_date: request.end_date })
      teamApprovedByUserAndType.set(key, list)
    }
  }

  const canManageHolidays = currentUser.role === 'hr' || currentUser.role === 'admin'

  return (
    <div className="space-y-8">
      <div className="flex gap-4">
        <Link href="/hrm/leave/calendar" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          Calendar
        </Link>
        {canManageHolidays && (
          <Link href="/hrm/leave/holidays" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            Holidays
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Leave & WFH</h1>
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        {configError ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Could not load leave balances
          </p>
        ) : (
          config && (
            <div className="mt-3">
              <h2 className="text-sm font-medium text-slate-500">My balance ({currentYear})</h2>
              <div className="mt-2 grid grid-cols-5 gap-3">
                {BALANCE_TYPES.map((type) => {
                  const allocation = allocationForType(config, type)
                  const balance = computeBalance(allocation ?? 0, approvedByType.get(type) ?? [], currentYear)
                  return (
                    <div key={type} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="text-slate-500">{LEAVE_TYPE_LABELS[type]}</div>
                      <div className="text-lg font-semibold text-slate-800">{balance}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        <form action={submitLeaveRequest} className="mt-4 grid grid-cols-2 gap-3">
          <select
            name="type"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div />
          <input
            type="date"
            name="startDate"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            type="date"
            name="endDate"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <textarea
            name="reason"
            placeholder="Reason"
            required
            className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="col-span-2 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Submit request
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">My requests</h2>
        {requestsError ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Could not load your requests
          </p>
        ) : myRequests && myRequests.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {myRequests.map((request) => (
              <li key={request.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="text-slate-700">
                  {LEAVE_TYPE_LABELS[request.type]}: {request.start_date} to {request.end_date} (
                  {dayCount(request.start_date, request.end_date)} day
                  {dayCount(request.start_date, request.end_date) === 1 ? '' : 's'}) —{' '}
                  <strong className="text-slate-800">{request.status}</strong>
                </div>
                <div className="text-slate-500">{request.reason}</div>
                {request.status === 'pending' && (
                  <form action={cancelLeaveRequest} className="mt-1">
                    <input type="hidden" name="requestId" value={request.id} />
                    <button type="submit" className="text-red-600 underline">
                      Cancel
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No requests yet.</p>
        )}
      </div>

      {(reportsError || reportIds.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">My team&apos;s requests</h2>
          {reportsError ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              Could not load your team
            </p>
          ) : teamPendingError ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              Could not load your team&apos;s requests
            </p>
          ) : teamPending.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No pending requests from your team.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {teamPending.map((request) => {
                const allocation = config ? allocationForType(config, request.type) : null
                const balanceText =
                  (configError || teamApprovedError) && request.type !== 'wfh'
                    ? 'balance unavailable'
                    : allocation !== null
                      ? `current balance: ${computeBalance(
                          allocation,
                          teamApprovedByUserAndType.get(`${request.user_id}:${request.type}`) ?? [],
                          currentYear
                        )}`
                      : null

                return (
                  <li key={request.id} className="rounded-lg border border-slate-100 p-4">
                    <p className="text-sm font-medium text-slate-800">
                      {teamNameById.get(request.user_id) ?? 'Unknown'} — {LEAVE_TYPE_LABELS[request.type]}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {request.start_date} to {request.end_date} ({dayCount(request.start_date, request.end_date)}{' '}
                      day{dayCount(request.start_date, request.end_date) === 1 ? '' : 's'})
                      {balanceText && <> — {balanceText}</>}
                    </p>
                    <p className="text-sm text-slate-600">{request.reason}</p>
                    <div className="mt-2 flex gap-3">
                      <form action={approveTeamRequest}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <ConfirmSubmitButton
                          confirmMessage="Approve this request? This cannot be undone."
                          className="text-green-700 underline"
                        >
                          Approve
                        </ConfirmSubmitButton>
                      </form>
                      <form action={rejectTeamRequest}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <ConfirmSubmitButton
                          confirmMessage="Reject this request? This cannot be undone."
                          className="text-red-600 underline"
                        >
                          Reject
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: compiles with zero TypeScript errors. (`/hrm/leave/calendar`
and `/hrm/leave/holidays` links exist but their target pages don't yet —
that's fine, Next.js doesn't fail the build over a `<Link>` to a
not-yet-existing route.)

- [ ] **Step 5: Commit**

```bash
git add app/hrm/leave
git commit -m "feat: port leave & WFH page to /hrm/leave"
```

---

### Task 3: Leave calendar

**Files:**
- Create: `app/hrm/leave/calendar/page.tsx`

**Interfaces:**
- Consumes: `requireModule('leave_attendance')` (Task 1); `LEAVE_TYPE_LABELS`
  from `@/lib/leave`; `todayDate` from `@/lib/attendance`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `app/hrm/leave/calendar/page.tsx`**

```typescript
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { LEAVE_TYPE_LABELS } from '@/lib/leave'
import { todayDate } from '@/lib/attendance'
import type { LeaveRequestType } from '@/types/database'

function shiftMonth(monthParam: string, delta: number): string {
  const [y, m] = monthParam.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildCalendarWeeks(monthParam: string): { date: string; inMonth: boolean }[][] {
  const [year, month] = monthParam.split('-').map(Number)
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const startDow = firstOfMonth.getUTCDay()
  const cursor = new Date(firstOfMonth)
  cursor.setUTCDate(firstOfMonth.getUTCDate() - startDow)

  const weeks: { date: string; inMonth: boolean }[][] = []
  for (let w = 0; w < 6; w++) {
    const week: { date: string; inMonth: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      week.push({ date: cursor.toISOString().slice(0, 10), inMonth: cursor.getUTCMonth() === month - 1 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function LeaveCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { month: monthRaw, scope: scopeRaw } = await searchParams

  const monthParam = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : todayDate().slice(0, 7)
  const canViewCompany = currentUser.role === 'hr' || currentUser.role === 'admin'
  const scope = scopeRaw === 'company' && canViewCompany ? 'company' : 'team'

  const weeks = buildCalendarWeeks(monthParam)
  const gridStart = weeks[0][0].date
  const gridEnd = weeks[5][6].date

  const admin = createAdminSupabaseClient()

  let scopeUserIds: string[] = [currentUser.id]
  if (scope === 'company') {
    const { data: activeUsers } = await admin.from('users').select('id').eq('is_active', true)
    scopeUserIds = (activeUsers ?? []).map((u) => u.id)
  } else {
    const { data: reports } = await admin.from('employee_profiles').select('user_id').eq('manager_id', currentUser.id)
    scopeUserIds = [currentUser.id, ...(reports ?? []).map((r) => r.user_id)]
  }

  const { data: leaveRows, error: leaveError } = await admin
    .from('leave_requests')
    .select('user_id, type, start_date, end_date')
    .eq('status', 'approved')
    .in('user_id', scopeUserIds)
    .lte('start_date', gridEnd)
    .gte('end_date', gridStart)

  const { data: holidayRows, error: holidayError } = await admin
    .from('holidays')
    .select('date, name')
    .gte('date', gridStart)
    .lte('date', gridEnd)

  const { data: users } = await admin.from('users').select('id, name').in('id', scopeUserIds)
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]))

  const holidayByDate = new Map((holidayRows ?? []).map((h) => [h.date, h.name]))
  const leaveByDate = new Map<string, { name: string; type: LeaveRequestType }[]>()
  for (const row of leaveRows ?? []) {
    for (const week of weeks) {
      for (const cell of week) {
        if (cell.date >= row.start_date && cell.date <= row.end_date) {
          const list = leaveByDate.get(cell.date) ?? []
          list.push({ name: nameById.get(row.user_id) ?? 'Unknown', type: row.type })
          leaveByDate.set(cell.date, list)
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/hrm/leave" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Leave
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Leave calendar — {monthParam}</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/hrm/leave/calendar?month=${shiftMonth(monthParam, -1)}&scope=${scope}`}
            className="text-slate-600 hover:text-slate-900"
          >
            ← Prev
          </Link>
          <Link
            href={`/hrm/leave/calendar?month=${shiftMonth(monthParam, 1)}&scope=${scope}`}
            className="text-slate-600 hover:text-slate-900"
          >
            Next →
          </Link>
          {canViewCompany && (
            <Link
              href={`/hrm/leave/calendar?month=${monthParam}&scope=${scope === 'company' ? 'team' : 'company'}`}
              className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50"
            >
              {scope === 'company' ? 'Show my team' : 'Show company-wide'}
            </Link>
          )}
        </div>
      </div>

      {(leaveError || holidayError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Could not load calendar data
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-medium text-slate-500">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-slate-100 last:border-0">
            {week.map((cell) => {
              const holidayName = holidayByDate.get(cell.date)
              const entries = leaveByDate.get(cell.date) ?? []
              return (
                <div
                  key={cell.date}
                  className={`min-h-24 border-r border-slate-100 p-2 text-xs last:border-0 ${
                    cell.inMonth ? '' : 'bg-slate-50 text-slate-300'
                  }`}
                >
                  <div className={cell.inMonth ? 'text-slate-700' : 'text-slate-300'}>
                    {Number(cell.date.slice(8, 10))}
                  </div>
                  {holidayName && (
                    <div className="mt-1 truncate rounded bg-amber-100 px-1 py-0.5 text-amber-800">
                      {holidayName}
                    </div>
                  )}
                  {entries.map((entry, i) => (
                    <div key={i} className="mt-1 truncate rounded bg-slate-100 px-1 py-0.5 text-slate-700">
                      {entry.name} — {LEAVE_TYPE_LABELS[entry.type]}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/hrm/leave/calendar
git commit -m "feat: add leave calendar view"
```

---

### Task 4: Holidays management

**Files:**
- Create: `app/hrm/leave/holidays/page.tsx`
- Create: `app/hrm/leave/holidays/actions.ts`

**Interfaces:**
- Consumes: `requireModule('leave_attendance')` (Task 1);
  `addHolidaySchema`, `holidayIdSchema` from `@/lib/validation` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `app/hrm/leave/holidays/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addHolidaySchema, holidayIdSchema } from '@/lib/validation'

function isHrOrAdmin(role: string): boolean {
  return role === 'hr' || role === 'admin'
}

export async function addHoliday(formData: FormData) {
  const currentUser = await requireModule('leave_attendance')
  if (!isHrOrAdmin(currentUser.role)) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent('Not authorized'))
  }

  const parsed = addHolidaySchema.safeParse({
    date: formData.get('date'),
    name: formData.get('name'),
  })

  if (!parsed.success) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('holidays').insert({ date: parsed.data.date, name: parsed.data.name })

  if (error) {
    const message = error.code === '23505' ? 'A holiday already exists on this date' : error.message
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/leave/holidays')
  redirect('/hrm/leave/holidays')
}

export async function deleteHoliday(formData: FormData) {
  const currentUser = await requireModule('leave_attendance')
  if (!isHrOrAdmin(currentUser.role)) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent('Not authorized'))
  }

  const parsed = holidayIdSchema.safeParse({ holidayId: formData.get('holidayId') })

  if (!parsed.success) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('holidays').delete().eq('id', parsed.data.holidayId)

  if (error) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/hrm/leave/holidays')
  redirect('/hrm/leave/holidays')
}
```

- [ ] **Step 2: Create `app/hrm/leave/holidays/page.tsx`**

```typescript
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addHoliday, deleteHoliday } from './actions'

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { error } = await searchParams
  const canManage = currentUser.role === 'hr' || currentUser.role === 'admin'

  const admin = createAdminSupabaseClient()
  const { data: holidays, error: holidaysError } = await admin
    .from('holidays')
    .select('id, date, name')
    .order('date', { ascending: true })

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/hrm/leave" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Leave
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Company holidays</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      {canManage && (
        <form
          action={addHoliday}
          className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <label className="text-sm text-slate-700">
            Date
            <input
              type="date"
              name="date"
              required
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
            />
          </label>
          <label className="flex-1 text-sm text-slate-700">
            Name
            <input
              name="name"
              placeholder="e.g. Independence Day"
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {holidaysError ? (
          <p className="p-4 text-sm text-red-700">Could not load holidays</p>
        ) : holidays && holidays.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {holidays.map((holiday) => (
              <li key={holiday.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-700">
                  {holiday.date} — {holiday.name}
                </span>
                {canManage && (
                  <form action={deleteHoliday}>
                    <input type="hidden" name="holidayId" value={holiday.id} />
                    <button type="submit" className="text-red-600 underline">
                      Delete
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No holidays added yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/hrm/leave/holidays
git commit -m "feat: add HR holiday calendar management"
```

---

### Task 5: Port Attendance page to /hrm/attendance

**Files:**
- Create: `app/hrm/attendance/page.tsx`
- Create: `app/hrm/attendance/actions.ts`

**Interfaces:**
- Consumes: `requireModule('leave_attendance')` (Task 1);
  `isIpAllowed`, `isIpv4Address`, `parseClientIp`, `todayDate`,
  `formatIstTime`, `hoursWorked` from `@/lib/attendance` (already exist).
- Produces: page links to `/hrm/attendance/team` (Task 6),
  `/hrm/attendance/reports` and `/hrm/attendance/shifts` (Tasks 7-8) for
  HR/admin.

Note: unlike the old `/attendance` page, this page does **not** include
the "My team's attendance" section — that moves to its own page in
Task 6, per the design spec's architecture.

- [ ] **Step 1: Create `app/hrm/attendance/actions.ts`**

Byte-identical to `app/(app)/attendance/actions.ts`, with
`requireUser()` → `requireModule('leave_attendance')` and
`/attendance` → `/hrm/attendance`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { isIpAllowed, isIpv4Address, parseClientIp, todayDate } from '@/lib/attendance'

async function resolveClientIp(): Promise<string | null> {
  const headerList = await headers()
  const realIp = headerList.get('x-real-ip')
  if (realIp && realIp.trim().length > 0) return realIp.trim()
  return parseClientIp(headerList.get('x-forwarded-for'))
}

interface GateResult {
  open: boolean
  configUnavailable: boolean
}

async function isGateOpen(userId: string, ip: string | null): Promise<GateResult> {
  const admin = createAdminSupabaseClient()
  const { data: config, error: configError } = await admin.from('hr_config').select('office_ip_allowlist').eq('id', true).single()
  if (configError) {
    console.error('isGateOpen: failed to read hr_config.office_ip_allowlist:', configError.message)
  }
  const allowlist = config?.office_ip_allowlist ?? ''

  if (ip && isIpAllowed(ip, allowlist)) {
    return { open: true, configUnavailable: false }
  }

  const supabase = await createClient()
  const today = todayDate()
  const { data: wfh, error: wfhError } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'wfh')
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
  if (wfhError) {
    console.error('isGateOpen: failed to check WFH bypass:', wfhError.message)
  }

  return { open: (wfh ?? []).length > 0, configUnavailable: Boolean(configError) }
}

function gateErrorMessage(gate: GateResult, ip: string | null): string {
  if (gate.configUnavailable) return 'Could not verify your network — contact HR'
  if (ip && !isIpv4Address(ip)) return 'Your network uses IPv6, which is not yet supported — contact HR'
  return 'Not on the office network'
}

export async function checkIn() {
  const currentUser = await requireModule('leave_attendance')
  const supabase = await createClient()
  const ip = await resolveClientIp()
  const today = todayDate()

  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id, checked_in_at')
    .eq('user_id', currentUser.id)
    .eq('date', today)
    .single()

  if (existing?.checked_in_at) {
    redirect('/hrm/attendance?error=' + encodeURIComponent('Already checked in today'))
  }

  const gate = await isGateOpen(currentUser.id, ip)
  if (!gate.open) {
    redirect('/hrm/attendance?error=' + encodeURIComponent(gateErrorMessage(gate, ip)))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('attendance_records').insert({
    user_id: currentUser.id,
    date: today,
    checked_in_at: new Date().toISOString(),
    checked_in_ip: ip,
  })

  if (error) {
    redirect('/hrm/attendance?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/hrm/attendance')
  redirect('/hrm/attendance')
}

export async function checkOut() {
  const currentUser = await requireModule('leave_attendance')
  const ip = await resolveClientIp()
  const today = todayDate()
  const admin = createAdminSupabaseClient()

  const { data: record } = await admin
    .from('attendance_records')
    .select('id, checked_in_at, checked_out_at')
    .eq('user_id', currentUser.id)
    .eq('date', today)
    .single()

  if (!record || !record.checked_in_at || record.checked_out_at) {
    redirect('/hrm/attendance?error=' + encodeURIComponent('Not checked in today, or already checked out'))
  }

  const gate = await isGateOpen(currentUser.id, ip)
  if (!gate.open) {
    redirect('/hrm/attendance?error=' + encodeURIComponent(gateErrorMessage(gate, ip)))
  }

  const { data: updated, error } = await admin
    .from('attendance_records')
    .update({ checked_out_at: new Date().toISOString(), checked_out_ip: ip })
    .eq('id', record.id)
    .eq('user_id', currentUser.id)
    .is('checked_out_at', null)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Already checked out' : error.message
    redirect('/hrm/attendance?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/attendance')
  redirect('/hrm/attendance')
}
```

- [ ] **Step 2: Create `app/hrm/attendance/page.tsx`**

```typescript
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { formatIstTime, hoursWorked, todayDate } from '@/lib/attendance'
import { checkIn, checkOut } from './actions'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: myRecords, error: recordsError } = await supabase
    .from('attendance_records')
    .select('id, date, checked_in_at, checked_out_at')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false })
    .limit(30)

  const today = todayDate()
  const todayRecord = (myRecords ?? []).find((record) => record.date === today)

  const admin = createAdminSupabaseClient()
  const { data: myReports } = await admin
    .from('employee_profiles')
    .select('user_id')
    .eq('manager_id', currentUser.id)
  const hasReports = (myReports ?? []).length > 0

  const canManage = currentUser.role === 'hr' || currentUser.role === 'admin'

  return (
    <div className="space-y-8">
      <div className="flex gap-4">
        {hasReports && (
          <Link href="/hrm/attendance/team" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            My team
          </Link>
        )}
        {canManage && (
          <>
            <Link
              href="/hrm/attendance/reports"
              className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
            >
              Reports
            </Link>
            <Link
              href="/hrm/attendance/shifts"
              className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
            >
              Shifts
            </Link>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Attendance</h1>
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-4">
          {!todayRecord?.checked_in_at ? (
            <form action={checkIn}>
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Check In
              </button>
            </form>
          ) : !todayRecord.checked_out_at ? (
            <form action={checkOut}>
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Check Out
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Checked out for today.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">My history</h2>
        {recordsError ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Could not load your attendance history
          </p>
        ) : myRecords && myRecords.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {myRecords.map((record) => {
              const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
              return (
                <li key={record.id} className="rounded-lg border border-slate-100 p-3 text-sm text-slate-700">
                  <span className="font-medium text-slate-800">{record.date}</span> —{' '}
                  {record.checked_in_at ? formatIstTime(record.checked_in_at) : '—'} to{' '}
                  {record.checked_out_at ? formatIstTime(record.checked_out_at) : 'not checked out'}
                  {hours !== null && <> ({hours}h)</>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No attendance records yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/hrm/attendance/page.tsx app/hrm/attendance/actions.ts
git commit -m "feat: port attendance page to /hrm/attendance"
```

---

### Task 6: Attendance team view

**Files:**
- Create: `app/hrm/attendance/team/page.tsx`

**Interfaces:**
- Consumes: `requireModule('leave_attendance')` (Task 1); `formatIstTime`
  from `@/lib/attendance`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `app/hrm/attendance/team/page.tsx`**

Ported content from the old `/attendance` page's "My team's attendance"
section, now its own page, plus a Shift column reading
`employee_profiles.shift_id` → `shifts.name`:

```typescript
import type { PostgrestError } from '@supabase/supabase-js'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { formatIstTime, todayDate } from '@/lib/attendance'

export default async function AttendanceTeamPage() {
  const currentUser = await requireModule('leave_attendance')
  const today = todayDate()
  const admin = createAdminSupabaseClient()

  const { data: myReports, error: reportsError } = await admin
    .from('employee_profiles')
    .select('user_id, shift_id')
    .eq('manager_id', currentUser.id)
  const reportIds = (myReports ?? []).map((report) => report.user_id)
  const shiftIdByUser = new Map((myReports ?? []).map((report) => [report.user_id, report.shift_id]))

  let teamToday: {
    user_id: string
    checked_in_at: string | null
    checked_out_at: string | null
  }[] = []
  let teamNameById = new Map<string, string>()
  let shiftNameById = new Map<string, string>()
  let teamRecordsError: PostgrestError | null = null

  if (reportIds.length > 0) {
    const { data: records, error: recordsErr } = await admin
      .from('attendance_records')
      .select('user_id, checked_in_at, checked_out_at')
      .in('user_id', reportIds)
      .eq('date', today)
    teamToday = records ?? []
    teamRecordsError = recordsErr

    const { data: reportUsers } = await admin.from('users').select('id, name').in('id', reportIds)
    teamNameById = new Map((reportUsers ?? []).map((user) => [user.id, user.name]))

    const shiftIds = [...new Set([...shiftIdByUser.values()].filter((id): id is string => id !== null))]
    if (shiftIds.length > 0) {
      const { data: shifts } = await admin.from('shifts').select('id, name').in('id', shiftIds)
      shiftNameById = new Map((shifts ?? []).map((shift) => [shift.id, shift.name]))
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">My team&apos;s attendance</h1>

      {reportsError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Could not load your team
        </p>
      ) : teamRecordsError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Could not load your team&apos;s attendance
        </p>
      ) : (
        <ul className="space-y-2">
          {reportIds.map((reportId) => {
            const record = teamToday.find((r) => r.user_id === reportId)
            const status = !record?.checked_in_at
              ? 'not checked in today'
              : !record.checked_out_at
                ? `checked in at ${formatIstTime(record.checked_in_at)}`
                : `${formatIstTime(record.checked_in_at)} to ${formatIstTime(record.checked_out_at)}`
            const shiftId = shiftIdByUser.get(reportId)
            const shiftName = shiftId ? (shiftNameById.get(shiftId) ?? 'Unknown shift') : 'No shift assigned'
            return (
              <li
                key={reportId}
                className="rounded-lg border border-slate-100 bg-white p-3 text-sm text-slate-700 shadow-sm"
              >
                <span className="font-medium text-slate-800">{teamNameById.get(reportId) ?? 'Unknown'}</span> —{' '}
                {status} <span className="text-slate-400">· {shiftName}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/hrm/attendance/team
git commit -m "feat: add attendance team view with shift column"
```

---

### Task 7: Shifts management

**Files:**
- Create: `app/hrm/attendance/shifts/page.tsx`
- Create: `app/hrm/attendance/shifts/actions.ts`

**Interfaces:**
- Consumes: `requireModule('leave_attendance')` (Task 1);
  `createShiftSchema`, `assignShiftSchema` from `@/lib/validation`
  (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `app/hrm/attendance/shifts/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createShiftSchema, assignShiftSchema } from '@/lib/validation'
import type { CurrentUser } from '@/lib/access'

async function requireHrOrAdmin(): Promise<CurrentUser> {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/attendance')
  }
  return currentUser
}

export async function createShift(formData: FormData) {
  await requireHrOrAdmin()

  const parsed = createShiftSchema.safeParse({
    name: formData.get('name'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    workingMonday: formData.get('workingMonday') === 'on',
    workingTuesday: formData.get('workingTuesday') === 'on',
    workingWednesday: formData.get('workingWednesday') === 'on',
    workingThursday: formData.get('workingThursday') === 'on',
    workingFriday: formData.get('workingFriday') === 'on',
    workingSaturday: formData.get('workingSaturday') === 'on',
  })

  if (!parsed.success) {
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('shifts').insert({
    name: parsed.data.name,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    working_monday: parsed.data.workingMonday,
    working_tuesday: parsed.data.workingTuesday,
    working_wednesday: parsed.data.workingWednesday,
    working_thursday: parsed.data.workingThursday,
    working_friday: parsed.data.workingFriday,
    working_saturday: parsed.data.workingSaturday,
  })

  if (error) {
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/hrm/attendance/shifts')
  redirect('/hrm/attendance/shifts')
}

export async function assignShift(formData: FormData) {
  await requireHrOrAdmin()

  const parsed = assignShiftSchema.safeParse({
    userId: formData.get('userId'),
    shiftId: formData.get('shiftId'),
  })

  if (!parsed.success) {
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('employee_profiles')
    .update({ shift_id: parsed.data.shiftId || null })
    .eq('user_id', parsed.data.userId)

  if (error) {
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/hrm/attendance/shifts')
  redirect('/hrm/attendance/shifts')
}
```

- [ ] **Step 2: Create `app/hrm/attendance/shifts/page.tsx`**

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createShift, assignShift } from './actions'

const WEEKDAYS = [
  { key: 'workingMonday', label: 'Mon' },
  { key: 'workingTuesday', label: 'Tue' },
  { key: 'workingWednesday', label: 'Wed' },
  { key: 'workingThursday', label: 'Thu' },
  { key: 'workingFriday', label: 'Fri' },
  { key: 'workingSaturday', label: 'Sat' },
] as const

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/attendance')
  }
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()
  const { data: shifts, error: shiftsError } = await admin
    .from('shifts')
    .select('id, name, start_time, end_time')
    .order('name')

  const { data: employees, error: employeesError } = await admin
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const { data: profiles } = await admin.from('employee_profiles').select('user_id, shift_id')
  const shiftIdByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.shift_id]))

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Shifts</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={createShift}
        className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input
          name="name"
          placeholder="Shift name"
          required
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
        />
        <div className="flex gap-3">
          <input
            type="time"
            name="startTime"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            type="time"
            name="endTime"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>
        <div className="col-span-2 flex flex-wrap gap-4">
          {WEEKDAYS.map((day) => (
            <label key={day.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name={day.key} defaultChecked />
              {day.label}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="col-span-2 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Create shift
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">Existing shifts</h2>
        {shiftsError ? (
          <p className="p-4 text-sm text-red-700">Could not load shifts</p>
        ) : shifts && shifts.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {shifts.map((shift) => (
              <li key={shift.id} className="px-4 py-3 text-sm text-slate-700">
                {shift.name} — {shift.start_time} to {shift.end_time}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No shifts created yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">Assign employees</h2>
        {employeesError ? (
          <p className="p-4 text-sm text-red-700">Could not load employees</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <tbody>
              {(employees ?? []).map((employee) => (
                <tr key={employee.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{employee.name}</td>
                  <td className="px-4 py-2">
                    <form action={assignShift} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={employee.id} />
                      <select
                        name="shiftId"
                        defaultValue={shiftIdByUser.get(employee.id) ?? ''}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      >
                        <option value="">No shift</option>
                        {(shifts ?? []).map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-slate-600 underline hover:text-slate-900">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/hrm/attendance/shifts
git commit -m "feat: add shift creation and employee assignment"
```

---

### Task 8: Attendance reports + CSV export

**Files:**
- Create: `app/hrm/attendance/reports/page.tsx`
- Create: `app/hrm/attendance/reports/export/route.ts`

**Interfaces:**
- Consumes: `requireModule('leave_attendance')` (Task 1); `hoursWorked`,
  `todayDate` from `@/lib/attendance`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `app/hrm/attendance/reports/page.tsx`**

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { hoursWorked, todayDate } from '@/lib/attendance'

function firstOfMonth(): string {
  return `${todayDate().slice(0, 7)}-01`
}

export default async function AttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/attendance')
  }

  const { from: fromRaw, to: toRaw } = await searchParams
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : firstOfMonth()
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : todayDate()

  const admin = createAdminSupabaseClient()
  const { data: records, error: recordsError } = await admin
    .from('attendance_records')
    .select('user_id, date, checked_in_at, checked_out_at')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  const userIds = [...new Set((records ?? []).map((r) => r.user_id))]
  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]))

  const summary = new Map<string, { name: string; daysPresent: number; totalHours: number }>()
  for (const record of records ?? []) {
    const entry = summary.get(record.user_id) ?? {
      name: nameById.get(record.user_id) ?? 'Unknown',
      daysPresent: 0,
      totalHours: 0,
    }
    entry.daysPresent += 1
    const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
    if (hours !== null) entry.totalHours += hours
    summary.set(record.user_id, entry)
  }
  const summaryRows = [...summary.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Attendance reports</h1>

      <form className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm text-slate-700">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <label className="text-sm text-slate-700">
          To
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Filter
        </button>
        <a
          href={`/hrm/attendance/reports/export?from=${from}&to=${to}`}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Download CSV
        </a>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {recordsError ? (
          <p className="p-4 text-sm text-red-700">Could not load attendance records</p>
        ) : summaryRows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No attendance records in this range.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-2">Name</th>
                <th>Days present</th>
                <th>Total hours</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.name} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-700">{row.name}</td>
                  <td className="text-slate-600">{row.daysPresent}</td>
                  <td className="text-slate-600">{row.totalHours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/hrm/attendance/reports/export/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { hoursWorked } from '@/lib/attendance'

export async function GET(request: NextRequest) {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data: records, error: recordsError } = await admin
    .from('attendance_records')
    .select('user_id, date, checked_in_at, checked_out_at')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  if (recordsError) {
    return NextResponse.json({ error: recordsError.message }, { status: 500 })
  }

  const userIds = [...new Set((records ?? []).map((r) => r.user_id))]
  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]))

  const rows = ['Name,Date,Checked In,Checked Out,Hours']
  for (const record of records ?? []) {
    const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
    const name = (nameById.get(record.user_id) ?? 'Unknown').replace(/"/g, '""')
    rows.push(
      `"${name}",${record.date},${record.checked_in_at ?? ''},${record.checked_out_at ?? ''},${hours ?? ''}`
    )
  }
  const csv = rows.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="attendance-${from}-to-${to}.csv"`,
    },
  })
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/hrm/attendance/reports
git commit -m "feat: add attendance reports with CSV export"
```

---

### Task 9: Nav update + retire old pages

**Files:**
- Modify: `components/nav-links.tsx`
- Modify: `app/(app)/users/page.tsx`
- Delete: `app/(app)/leave/`
- Delete: `app/(app)/attendance/`
- Delete: `app/(app)/users/leave-requests/`
- Delete: `app/(app)/users/attendance-records/`

**Interfaces:**
- Consumes: everything from Tasks 1-8 (this task is the cutover).
- Produces: nothing (last code task).

- [ ] **Step 1: Update `components/nav-links.tsx`**

Replace the two always-visible Leave/Attendance entries (currently
`{ href: '/leave', label: 'Leave', icon: CalendarDays, module: null }` and
`{ href: '/attendance', label: 'Attendance', icon: Clock, module: null }`)
with module-gated entries pointing at the new routes:

```typescript
  { href: '/hrm/leave', label: 'Leave', icon: CalendarDays, module: 'leave_attendance' },
  { href: '/hrm/attendance', label: 'Attendance', icon: Clock, module: 'leave_attendance' },
```

(Keep their position in the `NAV_ITEMS` array — between the `Profile` and
`HR` entries — unchanged, only the three fields shown above change.)

- [ ] **Step 2: Update `app/(app)/users/page.tsx`**

Remove the two dead cross-links (they point at pages this task deletes).
Change:

```typescript
        <div className="flex gap-4">
          <Link href="/users/config" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            HR configuration
          </Link>
          <Link
            href="/users/leave-requests"
            className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
          >
            Leave requests
          </Link>
          <Link
            href="/users/attendance-records"
            className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
          >
            Attendance records
          </Link>
        </div>
```

to:

```typescript
        <div className="flex gap-4">
          <Link href="/users/config" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            HR configuration
          </Link>
        </div>
```

- [ ] **Step 3: Delete the old route folders**

```bash
git rm -r "app/(app)/leave" "app/(app)/attendance" "app/(app)/users/leave-requests" "app/(app)/users/attendance-records"
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors. Route list should no longer show
`/leave`, `/attendance`, `/users/leave-requests`, or
`/users/attendance-records`, and should show `/hrm/leave`,
`/hrm/leave/calendar`, `/hrm/leave/holidays`, `/hrm/attendance`,
`/hrm/attendance/team`, `/hrm/attendance/reports`,
`/hrm/attendance/reports/export`, `/hrm/attendance/shifts`.

- [ ] **Step 5: Commit**

```bash
git add components/nav-links.tsx "app/(app)/users/page.tsx"
git commit -m "feat: repoint nav to /hrm leave/attendance, retire old pages"
```

---

### Task 10: Manual end-to-end QA

**Files:** none (verification only).

**Interfaces:**
- Consumes: the fully merged feature from Tasks 1-9.
- Produces: nothing.

- [ ] **Step 1: Confirm the migration ran**

In the Supabase SQL editor, confirm `role_module_access` has rows for
`('hr', 'leave_attendance', true)` and `('employee', 'leave_attendance',
true)`, and that `holidays`/`shifts` tables exist and
`employee_profiles.shift_id` exists.

- [ ] **Step 2: Run through the leave flow**

Start the dev server (`npm run dev`). Log in as a non-admin employee.
Submit a leave request, confirm it appears under "My requests" on
`/hrm/leave`. Cancel it, confirm status flips to "cancelled". Log in as
that employee's manager, approve a different pending request from
`/hrm/leave`'s "My team's requests" section, confirm it disappears from
the pending list.

- [ ] **Step 3: Run through the holiday + calendar flow**

Log in as `hr` or `admin`. On `/hrm/leave/holidays`, add a holiday inside
the current month. Confirm the leave balance numbers on `/hrm/leave` did
not change. Visit `/hrm/leave/calendar`, confirm the holiday shows on the
correct day, and that an approved leave request also shows.

- [ ] **Step 4: Run through the attendance flow**

Check in from `/hrm/attendance` (works if your current IP is in
`hr_config.office_ip_allowlist`, or if you have an approved WFH request
for today). Check out. Confirm the record shows in "My history" with
correct hours. As a manager with reports, visit `/hrm/attendance/team`,
confirm today's status shows for each report.

- [ ] **Step 5: Run through shifts + reports**

On `/hrm/attendance/shifts`, create a shift and assign it to an employee
who reports to you. Revisit `/hrm/attendance/team`, confirm the shift
name shows next to that employee. On `/hrm/attendance/reports`, filter a
date range covering today's check-in, confirm the summary row's hours
match what you saw in "My history". Click "Download CSV", confirm the
file downloads and its numbers match the on-screen table.

- [ ] **Step 6: Confirm retirement**

Visit `/leave`, `/attendance`, `/users/leave-requests`, and
`/users/attendance-records` directly — all four should 404. Confirm the
sidebar's "Leave" and "Attendance" links land on `/hrm/leave` and
`/hrm/attendance`.

- [ ] **Step 7: Confirm the module gate**

In the Supabase SQL editor, temporarily set
`update role_module_access set enabled = false where role = 'employee' and module = 'leave_attendance';`.
Log in as a non-admin `employee`-role user, confirm "Leave" and
"Attendance" no longer appear in the sidebar and `/hrm/leave` redirects
away. Restore the row:
`update role_module_access set enabled = true where role = 'employee' and module = 'leave_attendance';`.
