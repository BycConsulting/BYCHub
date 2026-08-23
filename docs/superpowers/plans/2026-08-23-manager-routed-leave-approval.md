# Manager-Routed Leave Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR/Admin assign each employee a manager (any role), route that employee's leave/WFH requests to their manager instead of the shared HR queue, and let the manager act on them from the existing `/leave` page.

**Architecture:** One new nullable column (`employee_profiles.manager_id`), a manager-scoped pair of Server Actions authorized by a service-role lookup against that column (not a module gate), a new "My team's requests" section on the already-ungated `/leave` page, and one added filter on the existing HR queue to exclude requests whose employee now has a manager.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase, Tailwind CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-23-manager-routed-leave-approval-design.md](../specs/2026-08-23-manager-routed-leave-approval-design.md)

## Global Constraints

- One manager per employee (`manager_id`, nullable) — no join table, no multiple approvers.
- A manager can be any active user, any role — not restricted to `hr`/`admin`.
- Assigning a manager is an HR/Admin action only, on the existing `/users/[id]` page — gated by `requireModule('hr')`, same as every other field there.
- Routing is exclusive: an employee with a manager assigned routes ONLY to that manager — HR's queue excludes them entirely. An employee with no manager assigned still falls through to HR's existing shared queue exactly as today.
- No new RLS policy for cross-user visibility on `leave_requests` — a manager's read of their reports' requests goes through the service-role client, filtered in application code, matching how `/leave` already reads `hr_config`.
- The existing `approveLeaveRequest`/`rejectLeaveRequest` (HR-side, `requireModule('hr')`-gated) are untouched and unused by the manager path — new, separate actions authorized by the `manager_id` relationship instead.
- Manager UI lives as a conditional section on the existing, already-ungated `/leave` page (`requireUser()` only) — not a new nav item, not a new module.
- Self-approval stays unreachable on the manager path too: reject `request.user_id === currentUser.id` before the manager-relationship check, matching the existing HR-side guard exactly.
- No `any` types anywhere. No automated test suite — `npm run build` succeeding with zero TypeScript errors is the acceptance bar for every task.

---

### Task 1: Database migration (MANUAL — human step)

This task requires running SQL against the live Supabase project, which the agent has no
programmatic access to. A human runs this step; the agent's job is to produce the exact
SQL and commit it as a migration file.

**Files:**
- Create: `supabase/migrations/0010_employee_manager.sql`

**Interfaces:**
- Produces: `employee_profiles.manager_id` column that Tasks 2-5 depend on.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0010_employee_manager.sql`:

```sql
-- Nullable: most employees have no manager assigned yet, which is the
-- existing behavior (routes to HR's shared queue) — assigning one is an
-- explicit HR/Admin action, not a default. No RLS change needed: this
-- column is read/written exclusively through the service-role client,
-- same as every other employee_profiles column — the table's existing
-- RLS policies (SELECT-own for the regular client, no write policy at
-- all) apply to new columns automatically.
alter table public.employee_profiles
  add column if not exists manager_id uuid references public.users(id);
```

- [ ] **Step 2: Human runs the migration**

Hand these instructions to the user:

1. Go to the Supabase dashboard for the `yvnfiihppvderdjhzdyy` project.
2. SQL Editor → paste the contents of `supabase/migrations/0010_employee_manager.sql` → Run.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0010_employee_manager.sql
git commit -m "feat: add employee_profiles.manager_id column"
```

---

### Task 2: Types and validation schema

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`

**Interfaces:**
- Produces: `manager_id` field on `employee_profiles`'s Row/Insert/Update types, and a
  `managerId` field (plus a self-manager guard) on `updateEmployeeProfileSchema`. Tasks 3-5
  all consume these.

- [ ] **Step 1: Add `manager_id` to `types/database.ts`**

In the `employee_profiles` table entry, add `manager_id` to all three shapes. `Row` becomes:

```ts
      employee_profiles: {
        Row: {
          user_id: string
          phone: string | null
          address: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          date_of_birth: string | null
          designation: string | null
          department: string | null
          employment_start_date: string | null
          employment_type: EmploymentType | null
          manager_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          phone?: string | null
          address?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          date_of_birth?: string | null
          designation?: string | null
          department?: string | null
          employment_start_date?: string | null
          employment_type?: EmploymentType | null
          manager_id?: string | null
        }
        Update: Partial<{
          phone: string | null
          address: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          date_of_birth: string | null
          designation: string | null
          department: string | null
          employment_start_date: string | null
          employment_type: EmploymentType | null
          manager_id: string | null
          updated_at: string
        }>
        Relationships: []
      }
```

(Only `manager_id` is new in each of the three shapes — every other field is unchanged
from the current file; copy this block over the existing `employee_profiles` entry
exactly.)

- [ ] **Step 2: Add `managerId` to `updateEmployeeProfileSchema` in `lib/validation.ts`**

Change:

```ts
export const updateEmployeeProfileSchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().trim().max(200).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactName: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().max(200).optional().or(z.literal('')),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
    .optional()
    .or(z.literal('')),
  designation: z.string().trim().max(200).optional().or(z.literal('')),
  department: z.string().trim().max(200).optional().or(z.literal('')),
  employmentStartDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
    .optional()
    .or(z.literal('')),
  employmentType: z.enum(employmentTypes).optional().or(z.literal('')),
})
```

to:

```ts
export const updateEmployeeProfileSchema = z
  .object({
    userId: z.string().uuid(),
    phone: z.string().trim().max(200).optional().or(z.literal('')),
    address: z.string().trim().max(200).optional().or(z.literal('')),
    emergencyContactName: z.string().trim().max(200).optional().or(z.literal('')),
    emergencyContactPhone: z.string().trim().max(200).optional().or(z.literal('')),
    dateOfBirth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
      .optional()
      .or(z.literal('')),
    designation: z.string().trim().max(200).optional().or(z.literal('')),
    department: z.string().trim().max(200).optional().or(z.literal('')),
    employmentStartDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
      .optional()
      .or(z.literal('')),
    employmentType: z.enum(employmentTypes).optional().or(z.literal('')),
    managerId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((data) => !data.managerId || data.managerId !== data.userId, {
    message: 'An employee cannot be their own manager',
    path: ['managerId'],
  })
```

(The object gains one field, `managerId`, and the whole schema gets wrapped in a
`.refine(...)` — every other field's validation is byte-for-byte unchanged.)

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds (this type/schema change isn't wired into any page yet).

- [ ] **Step 4: Commit**

```bash
git add types/database.ts lib/validation.ts
git commit -m "feat: add manager_id type and validation"
```

---

### Task 3: Manager picker on the admin employee-edit page

**Files:**
- Modify: `app/(app)/users/[id]/page.tsx`
- Modify: `app/(app)/users/[id]/actions.ts`

**Interfaces:**
- Consumes: `manager_id` from `employee_profiles` (Task 2), widened
  `updateEmployeeProfileSchema` (Task 2).
- Produces: no new exports — `updateEmployeeProfile` gains `manager_id` handling, used by
  no other task in this plan (Tasks 4-5 read `manager_id` directly via Supabase queries,
  not through this action).

- [ ] **Step 1: Fetch the active-user list and the profile's `manager_id` in `page.tsx`**

Change:

```tsx
  const { data: profile } = await admin
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type'
    )
    .eq('user_id', id)
    .single()
```

to:

```tsx
  const { data: profile } = await admin
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type, manager_id'
    )
    .eq('user_id', id)
    .single()

  const { data: activeUsers } = await admin.from('users').select('id, name').eq('is_active', true).neq('id', id).order('name')
```

(`activeUsers` excludes the profile's own id — a person can't be selected as their own
manager in the dropdown, and Task 2's zod `.refine()` backs this up server-side too in
case of a crafted request.)

- [ ] **Step 2: Add the Manager field to the Job info section**

In the `<form>`'s "Job info" `<div>`, the employment-type `<select>` currently ends the
section:

```tsx
          <select
            name="employmentType"
            defaultValue={profile?.employment_type ?? ''}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">Select type</option>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
          </select>
        </div>
```

Add a Manager `<select>` right after it, still inside the "Job info" `<div>`:

```tsx
          <select
            name="employmentType"
            defaultValue={profile?.employment_type ?? ''}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">Select type</option>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
          </select>
          <select
            name="managerId"
            defaultValue={profile?.manager_id ?? ''}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">No manager</option>
            {(activeUsers ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
```

Nothing else in `page.tsx` changes in this task.

- [ ] **Step 3: Handle `managerId` in `updateEmployeeProfile`**

In `app/(app)/users/[id]/actions.ts`, add `managerId: formData.get('managerId')` to the
`safeParse` call:

```ts
  const parsed = updateEmployeeProfileSchema.safeParse({
    userId: formData.get('userId'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactPhone: formData.get('emergencyContactPhone'),
    dateOfBirth: formData.get('dateOfBirth'),
    designation: formData.get('designation'),
    department: formData.get('department'),
    employmentStartDate: formData.get('employmentStartDate'),
    employmentType: formData.get('employmentType'),
    managerId: formData.get('managerId'),
  })
```

and add `manager_id: fields.managerId || null,` to the `.update({...})` payload:

```ts
    .update({
      phone: fields.phone || null,
      address: fields.address || null,
      emergency_contact_name: fields.emergencyContactName || null,
      emergency_contact_phone: fields.emergencyContactPhone || null,
      date_of_birth: fields.dateOfBirth || null,
      designation: fields.designation || null,
      department: fields.department || null,
      employment_start_date: fields.employmentStartDate || null,
      employment_type: fields.employmentType || null,
      manager_id: fields.managerId || null,
      updated_at: new Date().toISOString(),
    })
```

Nothing else in `actions.ts` changes in this task.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors, zero `any`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/users/[id]/page.tsx" "app/(app)/users/[id]/actions.ts"
git commit -m "feat: add manager picker to admin employee-edit page"
```

---

### Task 4: Manager-scoped "My team's requests" on `/leave`

**Files:**
- Create: `app/(app)/confirm-submit-button.tsx` (moved from
  `app/(app)/users/leave-requests/confirm-submit-button.tsx`)
- Delete: `app/(app)/users/leave-requests/confirm-submit-button.tsx`
- Modify: `app/(app)/users/leave-requests/page.tsx` (import path only, in this task)
- Create: `app/(app)/leave/team-actions.ts`
- Modify: `app/(app)/leave/page.tsx`

**Interfaces:**
- Consumes: `requireUser` from `@/lib/access`; `createAdminSupabaseClient` from
  `@/lib/supabase/admin`; `leaveRequestIdSchema` from `@/lib/validation`;
  `allocationForType`, `computeBalance`, `dayCount`, `LEAVE_TYPE_LABELS` from
  `@/lib/leave`.
- Produces: `approveTeamRequest(formData)`, `rejectTeamRequest(formData)` Server Actions.
  `ConfirmSubmitButton` moves to a shared location — Task 5 (which doesn't touch this
  component) is unaffected since it only imports it via the already-updated path this task
  leaves behind.

`ConfirmSubmitButton` is now used by two unrelated route directories (the existing HR
queue and this task's new team section) — moving it to a shared ancestor location matches
this codebase's "files that change together live together" principle better than either
duplicating it or having one feature's directory import from another's.

- [ ] **Step 1: Move `ConfirmSubmitButton` to a shared location**

Create `app/(app)/confirm-submit-button.tsx` with the exact current contents of
`app/(app)/users/leave-requests/confirm-submit-button.tsx`:

```tsx
'use client'

export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: {
  confirmMessage: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault()
        }
      }}
    >
      {children}
    </button>
  )
}
```

Then delete the old file:

```bash
git rm "app/(app)/users/leave-requests/confirm-submit-button.tsx"
```

- [ ] **Step 2: Update the import in the existing HR queue page**

In `app/(app)/users/leave-requests/page.tsx`, change:

```tsx
import { ConfirmSubmitButton } from './confirm-submit-button'
```

to:

```tsx
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
```

(This codebase already uses `@/app/...` absolute imports for cross-route-group
references — `app/(app)/layout.tsx` imports `logout` from `@/app/login/actions` the same
way.) Nothing else in this file changes in this task — the queue-filtering change comes in
Task 5.

- [ ] **Step 3: Write the manager-scoped actions**

Create `app/(app)/leave/team-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { leaveRequestIdSchema } from '@/lib/validation'

async function reviewTeamRequest(formData: FormData, status: 'approved' | 'rejected') {
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

  if (!request || request.status !== 'pending') {
    redirect('/leave?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  // Same self-approval guard as the HR-side reviewRequest — checked before
  // the manager-relationship lookup, so it holds even in the nonsensical
  // case of someone being recorded as their own manager (Task 2's zod
  // refine already blocks that at assignment time; this is defense in
  // depth, not the only guard).
  if (request.user_id === currentUser.id) {
    redirect('/leave?error=' + encodeURIComponent('You cannot review your own request'))
  }

  const { data: profile } = await admin
    .from('employee_profiles')
    .select('manager_id')
    .eq('user_id', request.user_id)
    .single()

  // Not authorized unless the acting user is genuinely this request's
  // employee's assigned manager — covers both "not their report at all"
  // and "was their report, but the manager was reassigned since this
  // request was submitted" (routing is always computed live, never
  // snapshotted, per the design spec).
  if (!profile || profile.manager_id !== currentUser.id) {
    redirect('/leave?error=' + encodeURIComponent('You are not authorized to review this request'))
  }

  // Re-check `status = 'pending'` in the update's own filter (not just the
  // fetch above), and confirm via `.select().single()` that the update
  // actually matched a row — same race-safety and silent-no-op guard as
  // the HR-side `reviewRequest` in app/(app)/users/leave-requests/actions.ts.
  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request not found or already resolved' : error.message
    redirect('/leave?error=' + encodeURIComponent(message))
  }

  revalidatePath('/leave')
  redirect('/leave')
}

export async function approveTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'approved')
}

export async function rejectTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'rejected')
}
```

- [ ] **Step 4: Add the "My team's requests" section to `/leave`**

In `app/(app)/leave/page.tsx`, add these imports alongside the existing ones:

```tsx
import { approveTeamRequest, rejectTeamRequest } from './team-actions'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
```

After the line that computes `const currentYear = new Date().getFullYear()` and before the
`return (` statement, add:

```tsx
  const { data: myReports } = await admin.from('employee_profiles').select('user_id').eq('manager_id', currentUser.id)
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
  let teamApprovedByUserAndType = new Map<string, { start_date: string; end_date: string }[]>()

  if (reportIds.length > 0) {
    const { data: pending } = await admin
      .from('leave_requests')
      .select('id, user_id, type, start_date, end_date, reason, created_at')
      .in('user_id', reportIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    teamPending = pending ?? []

    const { data: reportUsers } = await admin.from('users').select('id, name').in('id', reportIds)
    teamNameById = new Map((reportUsers ?? []).map((user) => [user.id, user.name]))

    const { data: teamApproved } = await admin
      .from('leave_requests')
      .select('user_id, type, start_date, end_date')
      .in('user_id', reportIds)
      .eq('status', 'approved')
    for (const request of teamApproved ?? []) {
      const key = `${request.user_id}:${request.type}`
      const list = teamApprovedByUserAndType.get(key) ?? []
      list.push({ start_date: request.start_date, end_date: request.end_date })
      teamApprovedByUserAndType.set(key, list)
    }
  }
```

Then, inside the outer `<div className="space-y-8">`, after the existing "My requests"
`<div>` block (i.e. as a new sibling `<div>` at the end, still inside the outer
`space-y-8` container), add:

```tsx
      {reportIds.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold">My team&apos;s requests</h2>
          {teamPending.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No pending requests from your team.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {teamPending.map((request) => {
                const allocation = config ? allocationForType(config, request.type) : null
                const balanceText =
                  configError && request.type !== 'wfh'
                    ? 'balance unavailable'
                    : allocation !== null
                      ? `current balance: ${computeBalance(
                          allocation,
                          teamApprovedByUserAndType.get(`${request.user_id}:${request.type}`) ?? [],
                          currentYear
                        )}`
                      : null

                return (
                  <li key={request.id} className="rounded border p-4">
                    <p className="text-sm font-medium">
                      {teamNameById.get(request.user_id) ?? 'Unknown'} — {LEAVE_TYPE_LABELS[request.type]}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {request.start_date} to {request.end_date} ({dayCount(request.start_date, request.end_date)}{' '}
                      day{dayCount(request.start_date, request.end_date) === 1 ? '' : 's'})
                      {balanceText && <> — {balanceText}</>}
                    </p>
                    <p className="text-sm text-gray-600">{request.reason}</p>
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
```

This reuses `config`/`configError` (the same `hr_config` read already on this page for
"My balance") and `allocationForType`/`computeBalance`/`dayCount`/`LEAVE_TYPE_LABELS`
(already imported) — no new balance-related imports needed, only the two new action
imports and `ConfirmSubmitButton` from Step 4's import block above.

Note: `admin` (the service-role client) is already declared earlier in this file via
`const admin = createAdminSupabaseClient()` for the `hr_config` read — reuse that same
variable, don't create a second client instance.

- [ ] **Step 5: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors, zero `any`. Confirm `app/(app)/users/leave-requests/confirm-submit-button.tsx` no longer exists and `app/(app)/confirm-submit-button.tsx` does.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/confirm-submit-button.tsx" "app/(app)/users/leave-requests/page.tsx" "app/(app)/leave/team-actions.ts" "app/(app)/leave/page.tsx"
git commit -m "feat: add manager-scoped team request review to /leave"
```

---

### Task 5: Exclude manager-routed requests from HR's queue

**Files:**
- Modify: `app/(app)/users/leave-requests/page.tsx`

**Interfaces:**
- Consumes: `manager_id` from `employee_profiles` (Task 2).

- [ ] **Step 1: Filter out requests whose employee has a manager assigned**

In `app/(app)/users/leave-requests/page.tsx`, change:

```tsx
  const { data: pendingRequests, error: pendingError } = await admin
    .from('leave_requests')
    .select('id, user_id, type, start_date, end_date, reason, created_at')
    .eq('status', 'pending')
    .neq('user_id', currentUser.id)
    .order('created_at', { ascending: true })

  const pending = pendingRequests ?? []
  const userIds = [...new Set(pending.map((request) => request.user_id))]
```

to:

```tsx
  const { data: pendingRequests, error: pendingError } = await admin
    .from('leave_requests')
    .select('id, user_id, type, start_date, end_date, reason, created_at')
    .eq('status', 'pending')
    .neq('user_id', currentUser.id)
    .order('created_at', { ascending: true })

  const allPending = pendingRequests ?? []
  const pendingUserIds = [...new Set(allPending.map((request) => request.user_id))]

  // Requests from employees who have an assigned manager route to that
  // manager exclusively (see /leave's "My team's requests" section) — HR's
  // queue only shows requests from employees with no manager assigned.
  const { data: managerLookup } =
    pendingUserIds.length > 0
      ? await admin.from('employee_profiles').select('user_id, manager_id').in('user_id', pendingUserIds)
      : { data: [] }
  const managerIdByUser = new Map((managerLookup ?? []).map((profile) => [profile.user_id, profile.manager_id]))

  const pending = allPending.filter((request) => !managerIdByUser.get(request.user_id))
  const userIds = [...new Set(pending.map((request) => request.user_id))]
```

Everything after this block (the `users` name lookup, the `hr_config` read, the
`approvedRequests` lookup, and all the JSX rendering) is unchanged — it already reads from
`pending`/`userIds`, which keep the same names and shapes as before, just now filtered.

- [ ] **Step 2: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors, zero `any`.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/users/leave-requests/page.tsx"
git commit -m "feat: exclude manager-routed requests from HR's approval queue"
```

---

### Task 6: End-to-end verification (MANUAL — human ran Task 1's migration first)

**Files:** none (verification only)

- [ ] **Step 1: Manually verify the full flow**

```bash
npm run dev
```

Logged in as the seeded admin:

1. Invite two fresh test employees — one to act as a manager (a plain `employee` role,
   deliberately NOT `hr`), one to act as their report.
2. On `/users/[id]` for the report, confirm the new "No manager" dropdown appears in Job
   info, listing every active user by name (including the manager candidate), with no
   option to select the report themselves. Assign the manager candidate as their manager,
   Save, confirm it persists across a reload.
3. Sign in as the report, submit a leave request.
4. Sign in as admin, visit `/users/leave-requests` — confirm the report's new request does
   **NOT** appear (it now has a manager).
5. Sign in as the manager candidate (a plain employee, no `hr` module access) — confirm
   they can still reach `/leave` (ungated) and see a new "My team's requests" section
   showing the report's pending request, with the same balance-context and confirmation-
   dialog behavior the HR queue already has.
6. Approve it as the manager — confirm it disappears from "My team's requests", and
   (switch back to the report's own login) confirm their own `/leave` shows it `approved`
   with the balance correctly deducted, same as the HR-approval path already does.
7. As the manager, confirm attempting to review their own request (if they submit one) is
   rejected the same way HR's self-review guard already works.
8. On `/users/[id]`, unassign the manager (set back to "No manager") for a *different* test
   employee who still has a pending request — confirm that request reappears in HR's
   `/users/leave-requests` queue and disappears from the (now-former) manager's "My team's
   requests" section, proving routing is computed live, not snapshotted at submission time.
9. Clean up: reject or cancel any leftover test requests, unassign test manager
   relationships, and deactivate both test employees.

- [ ] **Step 2: No commit** — this task is verification only, nothing to commit.
