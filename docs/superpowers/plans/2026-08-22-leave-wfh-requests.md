# Leave & WFH Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees submit leave/WFH requests and see their own current-year balance, and let HR approve or reject them.

**Architecture:** One unified `leave_requests` table (type covers 5 leave types + `wfh`), read/written mostly via the regular RLS-scoped client for employee self-service (SELECT-own/INSERT-own, matching the established self-service-request pattern), with all status changes (approve/reject/cancel) going through the service-role client via Server Actions. Balance is computed live from `hr_config` (already shipped) and approved requests — nothing stored.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase, Tailwind CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-22-leave-wfh-requests-design.md](../specs/2026-08-22-leave-wfh-requests-design.md)

## Global Constraints

- Six request types: `casual`, `sick`, `earned`, `maternity`, `paternity`, `wfh`. `wfh` never has a balance; the other five do.
- Day count = every calendar day in `[start_date, end_date]` inclusive, not working days only.
- A request cannot span two different calendar years — rejected at submission.
- Balance for a leave type in year Y = `hr_config`'s allocation for that type minus the day-counts of the requester's own `approved` requests of that type whose `start_date` falls in year Y. Computed live, nothing stored, no reset job.
- Balance is advisory only — a request that would push balance negative still submits and can still be approved by HR. No hard cap anywhere.
- Overlap blocking: a new request is rejected if its date range overlaps any of the requester's own `pending` or `approved` requests, across all types (not just the same type).
- Multiple concurrent pending requests are allowed (for non-overlapping dates) — no one-pending-at-a-time rule.
- Cancel: only the requester, only while `status = 'pending'`.
- `/leave` is ungated (every authenticated user, same status as `/profile` — never gated by the module matrix). The approval queue lives under the existing `hr`-module-gated area.
- `leave_requests` RLS: SELECT-own and INSERT-own for the regular authenticated client (with the insert `with check` pinning `status`/`reviewed_by`/`reviewed_at` to a fresh, unreviewed shape, matching the anti-forgery pattern already used for `employee_profile_requests` in migration `0006`). No UPDATE policy for the regular client — approve/reject/cancel all go through the service-role client.
- No `any` types anywhere. No automated test suite — `npm run build` succeeding with zero TypeScript errors is the acceptance bar for every task.

---

### Task 1: Database migration (MANUAL — human step)

This task requires running SQL against the live Supabase project, which the agent has no
programmatic access to. A human runs this step; the agent's job is to produce the exact
SQL and commit it as a migration file.

**Files:**
- Create: `supabase/migrations/0009_leave_requests.sql`

**Interfaces:**
- Produces: `leave_requests` table that Tasks 2-4 depend on.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0009_leave_requests.sql`:

```sql
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  type text not null check (type in ('casual', 'sick', 'earned', 'maternity', 'paternity', 'wfh')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- A request cannot span two different calendar years — keeps the
  -- balance math (computed per-year from `start_date`) from ever needing
  -- to split one request's days across two years' allocations.
  constraint leave_requests_same_year check (extract(year from start_date) = extract(year from end_date))
);

alter table public.leave_requests enable row level security;

-- Employee can read only their own requests (needed for their own /leave
-- page's request list and for the overlap check in the submit action).
drop policy if exists "leave_requests_select_own" on public.leave_requests;
create policy "leave_requests_select_own" on public.leave_requests
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- Employee can create their own requests (submitting is a normal
-- self-service action, unlike the profile data the HR Portal roles
-- sub-project locked down). `with check` pins status/reviewed_by/
-- reviewed_at to a fresh, unreviewed shape, so a request can't be
-- inserted via REST already marked approved/rejected with a forged
-- reviewer — same anti-forgery shape as `employee_profile_requests` in
-- migration 0006.
drop policy if exists "leave_requests_insert_own" on public.leave_requests;
create policy "leave_requests_insert_own" on public.leave_requests
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- No UPDATE policy for `authenticated` — approve, reject, and cancel all
-- go through the service-role client via Server Actions, each with an
-- explicit ownership/role check in code.
```

- [ ] **Step 2: Human runs the migration**

Hand these instructions to the user:

1. Go to the Supabase dashboard for the `yvnfiihppvderdjhzdyy` project.
2. SQL Editor → paste the contents of `supabase/migrations/0009_leave_requests.sql` → Run.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0009_leave_requests.sql
git commit -m "feat: add leave_requests table"
```

---

### Task 2: Types, validation, and balance-calculation helpers

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`
- Create: `lib/leave.ts`

**Interfaces:**
- Produces: `LeaveRequestType`, `LeaveRequestStatus` types and `leave_requests` table entry
  from `@/types/database`. `leaveRequestTypes`, `submitLeaveRequestSchema`,
  `leaveRequestIdSchema` from `@/lib/validation`. `dayCount(startDate, endDate)`,
  `rangesOverlap(aStart, aEnd, bStart, bEnd)`, `allocationForType(config, type)`,
  `computeBalance(allocation, approvedRequestsOfType, year)`, `LEAVE_TYPE_LABELS` from
  `@/lib/leave` — Tasks 3 and 4 both consume every one of these.

- [ ] **Step 1: Add types to `types/database.ts`**

Add these two type exports as siblings of `ConfigurableRole` (near the top of the file):

```ts
export type LeaveRequestType = 'casual' | 'sick' | 'earned' | 'maternity' | 'paternity' | 'wfh'
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
```

Add a `leave_requests` table entry as a sibling of `hr_config`, inside
`Database['public']['Tables']` (right before the object's closing brace):

```ts
      leave_requests: {
        Row: {
          id: string
          user_id: string
          type: LeaveRequestType
          start_date: string
          end_date: string
          reason: string
          status: LeaveRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          type: LeaveRequestType
          start_date: string
          end_date: string
          reason: string
        }
        Update: Partial<{
          status: LeaveRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
        }>
        Relationships: []
      }
```

Note: `Insert` deliberately omits `status`/`reviewed_by`/`reviewed_at` — the table's own
defaults (`status` defaults to `'pending'`, the other two to `NULL`) apply, matching what
the migration's RLS `with check` expects. `Update` deliberately omits `type`/`start_date`/
`end_date`/`reason`/`user_id` — nothing in this app ever edits a request's content, only
its status (approve/reject/cancel per Task 4's actions).

- [ ] **Step 2: Add validation schemas to `lib/validation.ts`**

Add at the end of the file:

```ts
export const leaveRequestTypes = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'wfh'] as const

export const submitLeaveRequestSchema = z
  .object({
    type: z.enum(leaveRequestTypes),
    startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
    endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
    reason: z.string().trim().min(1, 'Reason is required').max(1000),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  })
  .refine((data) => data.startDate.slice(0, 4) === data.endDate.slice(0, 4), {
    message: 'A request cannot span two different years',
    path: ['endDate'],
  })

export const leaveRequestIdSchema = z.object({
  requestId: z.string().uuid(),
})
```

(`startDate`/`endDate` are `YYYY-MM-DD` strings, so plain string comparison — `<=`, `>=`,
`.slice(0, 4)` — is correct and matches the same lexicographic-date-string convention
already used by `updateEmployeeProfileSchema` elsewhere in this file.)

- [ ] **Step 3: Create `lib/leave.ts`**

This mirrors the existing `lib/metrics.ts`'s style: pure functions, no I/O, imported by
both the employee and HR pages/actions in Tasks 3-4.

Create `lib/leave.ts`:

```ts
import type { Database, LeaveRequestType } from '@/types/database'

export const LEAVE_TYPE_LABELS: Record<LeaveRequestType, string> = {
  casual: 'Casual Leave',
  sick: 'Sick Leave',
  earned: 'Earned/Privilege Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  wfh: 'Work From Home',
}

/** Inclusive day count between two YYYY-MM-DD date strings. */
export function dayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

/** Whether two inclusive YYYY-MM-DD date ranges overlap at all. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

type HrConfigRow = Database['public']['Tables']['hr_config']['Row']

/** The annual allocation for a leave type, or null for `wfh` (which has no balance). */
export function allocationForType(config: HrConfigRow, type: LeaveRequestType): number | null {
  switch (type) {
    case 'casual':
      return config.casual_leave_days
    case 'sick':
      return config.sick_leave_days
    case 'earned':
      return config.earned_leave_days
    case 'maternity':
      return config.maternity_leave_days
    case 'paternity':
      return config.paternity_leave_days
    case 'wfh':
      return null
  }
}

/**
 * Remaining balance for one leave type in one calendar year: the annual
 * allocation minus the day-counts of every approved request of that type
 * whose `start_date` falls in `year`. Can go negative — balance is
 * advisory, never a submission-time cap (see the design spec).
 */
export function computeBalance(
  allocation: number,
  approvedRequestsOfType: { start_date: string; end_date: string }[],
  year: number
): number {
  const usedDays = approvedRequestsOfType
    .filter((request) => Number(request.start_date.slice(0, 4)) === year)
    .reduce((sum, request) => sum + dayCount(request.start_date, request.end_date), 0)
  return allocation - usedDays
}
```

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds (these types/schemas/helpers aren't wired into any page yet).

- [ ] **Step 5: Commit**

```bash
git add types/database.ts lib/validation.ts lib/leave.ts
git commit -m "feat: add leave request types, validation, and balance helpers"
```

---

### Task 3: Employee self-service `/leave` page

**Files:**
- Create: `app/(app)/leave/page.tsx`, `app/(app)/leave/actions.ts`
- Modify: `app/(app)/layout.tsx` (add the "Leave" nav link)

**Interfaces:**
- Consumes: `requireUser` from `@/lib/access`; `createClient` from `@/lib/supabase/server`;
  `createAdminSupabaseClient` from `@/lib/supabase/admin`; `submitLeaveRequestSchema`,
  `leaveRequestIdSchema` from `@/lib/validation`; `dayCount`, `rangesOverlap`,
  `allocationForType`, `computeBalance`, `LEAVE_TYPE_LABELS` from `@/lib/leave`;
  `LeaveRequestType` from `@/types/database`.
- Produces: `submitLeaveRequest(formData)`, `cancelLeaveRequest(formData)` Server Actions.

- [ ] **Step 1: Write the actions**

Create `app/(app)/leave/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { submitLeaveRequestSchema, leaveRequestIdSchema } from '@/lib/validation'
import { rangesOverlap } from '@/lib/leave'

export async function submitLeaveRequest(formData: FormData) {
  const currentUser = await requireUser()

  const parsed = submitLeaveRequestSchema.safeParse({
    type: formData.get('type'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    reason: formData.get('reason'),
  })

  if (!parsed.success) {
    redirect('/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('leave_requests')
    .select('start_date, end_date')
    .eq('user_id', currentUser.id)
    .in('status', ['pending', 'approved'])

  const overlaps = (existing ?? []).some((request) =>
    rangesOverlap(parsed.data.startDate, parsed.data.endDate, request.start_date, request.end_date)
  )

  if (overlaps) {
    redirect('/leave?error=' + encodeURIComponent('This date range overlaps an existing request'))
  }

  const { error } = await supabase.from('leave_requests').insert({
    user_id: currentUser.id,
    type: parsed.data.type,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    reason: parsed.data.reason,
  })

  if (error) {
    redirect('/leave?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/leave')
  redirect('/leave')
}

export async function cancelLeaveRequest(formData: FormData) {
  const currentUser = await requireUser()

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, user_id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.user_id !== currentUser.id || request.status !== 'pending') {
    redirect('/leave?error=' + encodeURIComponent('Request not found or no longer pending'))
  }

  // Re-check `status = 'pending'` in the update's own filter (not just the
  // fetch above) so a request that got approved/rejected/cancelled in the
  // narrow window between the fetch and this update can't be silently
  // cancelled anyway — and `.select().single()` confirms the update
  // actually matched a row rather than silently no-op'ing.
  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request no longer pending' : error.message
    redirect('/leave?error=' + encodeURIComponent(message))
  }

  revalidatePath('/leave')
  redirect('/leave')
}
```

- [ ] **Step 2: Write the page**

Create `app/(app)/leave/page.tsx`:

```tsx
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { allocationForType, computeBalance, dayCount, LEAVE_TYPE_LABELS } from '@/lib/leave'
import { submitLeaveRequest, cancelLeaveRequest } from './actions'
import type { LeaveRequestType } from '@/types/database'

const BALANCE_TYPES: LeaveRequestType[] = ['casual', 'sick', 'earned', 'maternity', 'paternity']

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireUser()
  const { error } = await searchParams

  const supabase = await createClient()
  const admin = createAdminSupabaseClient()

  const { data: myRequests } = await supabase
    .from('leave_requests')
    .select('id, type, start_date, end_date, reason, status, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  const { data: config } = await admin.from('hr_config').select('*').eq('id', true).single()

  const approvedByType = new Map<LeaveRequestType, { start_date: string; end_date: string }[]>()
  for (const request of myRequests ?? []) {
    if (request.status !== 'approved') continue
    const list = approvedByType.get(request.type) ?? []
    list.push({ start_date: request.start_date, end_date: request.end_date })
    approvedByType.set(request.type, list)
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Leave & WFH</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        {config && (
          <div className="mt-3">
            <h2 className="text-sm font-medium text-gray-500">My balance ({currentYear})</h2>
            <div className="mt-2 grid grid-cols-5 gap-3">
              {BALANCE_TYPES.map((type) => {
                const allocation = allocationForType(config, type)
                const balance = computeBalance(allocation ?? 0, approvedByType.get(type) ?? [], currentYear)
                return (
                  <div key={type} className="rounded border p-3 text-sm">
                    <div className="text-gray-500">{LEAVE_TYPE_LABELS[type]}</div>
                    <div className="text-lg font-semibold">{balance}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <form action={submitLeaveRequest} className="mt-4 grid grid-cols-2 gap-3">
          <select name="type" className="rounded border px-3 py-2">
            {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div />
          <input type="date" name="startDate" required className="rounded border px-3 py-2" />
          <input type="date" name="endDate" required className="rounded border px-3 py-2" />
          <textarea
            name="reason"
            placeholder="Reason"
            required
            className="col-span-2 rounded border px-3 py-2"
          />
          <button type="submit" className="col-span-2 rounded bg-black py-2 text-white">
            Submit request
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold">My requests</h2>
        {myRequests && myRequests.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {myRequests.map((request) => (
              <li key={request.id} className="rounded border p-3 text-sm">
                <div>
                  {LEAVE_TYPE_LABELS[request.type]}: {request.start_date} to {request.end_date} (
                  {dayCount(request.start_date, request.end_date)} day
                  {dayCount(request.start_date, request.end_date) === 1 ? '' : 's'}) —{' '}
                  <strong>{request.status}</strong>
                </div>
                <div className="text-gray-500">{request.reason}</div>
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
          <p className="mt-2 text-sm text-gray-500">No requests yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the "Leave" nav link**

In `app/(app)/layout.tsx`, the nav currently has:

```tsx
          <Link href="/profile" className="text-sm text-gray-600 hover:text-black">
            Profile
          </Link>
          {enabledModules.includes('hr') && (
```

Change it to add "Leave" right after "Profile" (unconditional, like Profile itself —
never gated by `enabledModules`):

```tsx
          <Link href="/profile" className="text-sm text-gray-600 hover:text-black">
            Profile
          </Link>
          <Link href="/leave" className="text-sm text-gray-600 hover:text-black">
            Leave
          </Link>
          {enabledModules.includes('hr') && (
```

Nothing else in `app/(app)/layout.tsx` changes.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors, zero `any`. Route table should include
`/leave`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/leave" "app/(app)/layout.tsx"
git commit -m "feat: add employee self-service leave/WFH request page"
```

---

### Task 4: HR approval queue

**Files:**
- Create: `app/(app)/users/leave-requests/page.tsx`, `app/(app)/users/leave-requests/actions.ts`
- Modify: `app/(app)/users/page.tsx` (add a link to the queue)

**Interfaces:**
- Consumes: `requireModule` from `@/lib/access`; `createAdminSupabaseClient` from
  `@/lib/supabase/admin`; `leaveRequestIdSchema` from `@/lib/validation`;
  `allocationForType`, `computeBalance`, `dayCount`, `LEAVE_TYPE_LABELS` from `@/lib/leave`.
- Produces: `approveLeaveRequest(formData)`, `rejectLeaveRequest(formData)` Server Actions.

- [ ] **Step 1: Write the approve/reject actions**

Create `app/(app)/users/leave-requests/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { leaveRequestIdSchema } from '@/lib/validation'

async function reviewRequest(formData: FormData, status: 'approved' | 'rejected') {
  const currentUser = await requireModule('hr')

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/users/leave-requests?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/users/leave-requests?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  // Re-check `status = 'pending'` in the update's own filter (not just the
  // fetch above), and confirm via `.select().single()` that the update
  // actually matched a row — same race-safety and silent-no-op guard as
  // `cancelLeaveRequest` in app/(app)/leave/actions.ts.
  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request not found or already resolved' : error.message
    redirect('/users/leave-requests?error=' + encodeURIComponent(message))
  }

  revalidatePath('/users/leave-requests')
  redirect('/users/leave-requests')
}

export async function approveLeaveRequest(formData: FormData) {
  await reviewRequest(formData, 'approved')
}

export async function rejectLeaveRequest(formData: FormData) {
  await reviewRequest(formData, 'rejected')
}
```

- [ ] **Step 2: Write the approval queue page**

Create `app/(app)/users/leave-requests/page.tsx`:

```tsx
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { allocationForType, computeBalance, dayCount, LEAVE_TYPE_LABELS } from '@/lib/leave'
import { approveLeaveRequest, rejectLeaveRequest } from './actions'

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('hr')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: pendingRequests } = await admin
    .from('leave_requests')
    .select('id, user_id, type, start_date, end_date, reason, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const pending = pendingRequests ?? []
  const userIds = [...new Set(pending.map((request) => request.user_id))]

  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((user) => [user.id, user.name]))

  const { data: config } = await admin.from('hr_config').select('*').eq('id', true).single()

  const { data: approvedRequests } =
    userIds.length > 0
      ? await admin.from('leave_requests').select('user_id, type, start_date, end_date').eq('status', 'approved')
      : { data: [] }

  const approvedByUserAndType = new Map<string, { start_date: string; end_date: string }[]>()
  for (const request of approvedRequests ?? []) {
    const key = `${request.user_id}:${request.type}`
    const list = approvedByUserAndType.get(key) ?? []
    list.push({ start_date: request.start_date, end_date: request.end_date })
    approvedByUserAndType.set(key, list)
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Pending leave & WFH requests</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {pending.length === 0 ? (
        <p className="text-sm text-gray-500">No pending requests.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((request) => {
            const allocation = config ? allocationForType(config, request.type) : null
            const balance =
              allocation !== null
                ? computeBalance(
                    allocation,
                    approvedByUserAndType.get(`${request.user_id}:${request.type}`) ?? [],
                    currentYear
                  )
                : null

            return (
              <li key={request.id} className="rounded border p-4">
                <p className="text-sm font-medium">
                  {nameById.get(request.user_id) ?? 'Unknown'} — {LEAVE_TYPE_LABELS[request.type]}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {request.start_date} to {request.end_date} ({dayCount(request.start_date, request.end_date)} day
                  {dayCount(request.start_date, request.end_date) === 1 ? '' : 's'})
                  {balance !== null && <> — current balance: {balance}</>}
                </p>
                <p className="text-sm text-gray-600">{request.reason}</p>
                <div className="mt-2 flex gap-3">
                  <form action={approveLeaveRequest}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <button type="submit" className="text-green-700 underline">
                      Approve
                    </button>
                  </form>
                  <form action={rejectLeaveRequest}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <button type="submit" className="text-red-600 underline">
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add the link from `/users`**

In `app/(app)/users/page.tsx`, the file currently has (after the HR Configuration
sub-project's own link addition):

```tsx
      <div>
        <Link href="/users/config" className="text-sm text-blue-600 hover:underline">
          HR configuration
        </Link>
        <h1 className="mt-2 text-lg font-semibold">Invite user</h1>
```

Change it to add a second link, next to the first:

```tsx
      <div>
        <div className="flex gap-4">
          <Link href="/users/config" className="text-sm text-blue-600 hover:underline">
            HR configuration
          </Link>
          <Link href="/users/leave-requests" className="text-sm text-blue-600 hover:underline">
            Leave requests
          </Link>
        </div>
        <h1 className="mt-2 text-lg font-semibold">Invite user</h1>
```

Nothing else in `app/(app)/users/page.tsx` changes in this task.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors, zero `any`. Route table should include
`/users/leave-requests`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/users/leave-requests" "app/(app)/users/page.tsx"
git commit -m "feat: add HR approval queue for leave/WFH requests"
```

---

### Task 5: End-to-end verification (MANUAL — human ran Task 1's migration first)

**Files:** none (verification only)

- [ ] **Step 1: Manually verify the full flow**

```bash
npm run dev
```

Logged in as the seeded admin:

1. Visit `/leave` — confirm balances show the defaults from HR Configuration (12/12/15/
   182/15 unless already changed) for Casual/Sick/Earned/Maternity/Paternity, and "No
   requests yet."
2. Submit a Casual Leave request for a 3-day range entirely within the current year, with
   a reason — confirm it appears in "My requests" as `pending` with the correct day count.
3. Submit a second request whose dates overlap the first (any type) — confirm it's
   rejected with "This date range overlaps an existing request", and does NOT appear in
   the list.
4. Submit a WFH request for a *different*, non-overlapping date range — confirm it
   succeeds (WFH has no balance shown, so nothing to check there beyond it appearing in
   the list).
5. Submit a request spanning two different years (e.g. Dec 30 to Jan 2) — confirm it's
   rejected with "A request cannot span two different years".
6. Visit `/users/leave-requests` (as admin, still gated by the `hr` module like `/users`
   itself) — confirm both pending requests (Casual Leave and WFH) appear, with the
   requester's name, dates, day count, reason, and — for the Casual Leave one only — a
   "current balance" figure.
7. Approve the Casual Leave request — confirm it disappears from the pending queue.
8. Back on `/leave`, confirm the approved request now shows `approved`, and the Casual
   Leave balance has decreased by exactly its day count.
9. As admin, click "Cancel" on the still-pending WFH request from `/leave` — confirm it's
   removed from the pending list (status becomes `cancelled`) and no longer shows a Cancel
   button.
10. Invite a fresh test employee (or reuse a deactivated one from a prior sub-project's QA,
    reactivating it) — confirm they see `/leave` with the "Leave" nav link but not
    "Leave requests" (that's `hr`-module-gated), and that submitting/viewing their own
    requests works independently of the admin's.
11. As the test employee, confirm they cannot reach `/users/leave-requests` by direct URL
    (redirects away, matching the `hr` module gate already proven for `/users` and
    `/users/config`).
12. Clean up: deactivate the test employee, and as admin reject or cancel any leftover
    test requests you created so `/leave` and `/users/leave-requests` are clean for the
    next sub-project's QA.

- [ ] **Step 2: No commit** — this task is verification only, nothing to commit.
