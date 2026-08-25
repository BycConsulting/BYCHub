# Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add check-in/check-out attendance tracking, gated by an office IP allowlist (bypassed on approved WFH days), with an employee history view, a manager team view, and an HR view with manual correction of missed checkouts.

**Architecture:** A new `attendance_records` table (one row per employee per day, `unique(user_id, date)`) backs a new `/attendance` page (own check-in/out + history, plus a conditional "My team's attendance" section reusing the existing `manager_id` relationship) and a new HR page `/users/attendance-records` for correcting records with no checkout. The IP gate and WFH bypass are evaluated server-side on every check-in/out call. The office IP allowlist is a new column on the existing `hr_config` singleton row, edited on the existing `/users/config` page.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase (Postgres + Auth), Tailwind CSS. No automated test suite — `npm run build` succeeding with zero TypeScript errors is the acceptance bar for every task, matching every prior sub-project in this codebase.

**Spec:** [docs/superpowers/specs/2026-08-23-attendance-design.md](../specs/2026-08-23-attendance-design.md)

## Global Constraints

- Zero `any` types anywhere.
- No automated test suite exists in this codebase — `npm run build` with zero TypeScript errors is the acceptance bar for every task.
- `Relationships: []` on every table in `types/database.ts` — no embedded/joined `.select('*, other(...)')` calls anywhere; every "related data" need is a second query plus an in-memory `Map` lookup.
- Row-count-check pattern for every UPDATE that could silently match zero rows: `.eq(<all relevant filters>).select('id').single()`, check `!updated`, translate `PGRST116` into a human-readable message.
- `attendance_records` gets SELECT-own and INSERT-own RLS policies for the regular authenticated client (INSERT's `with check` pins `user_id` to the caller and requires a fresh, not-yet-checked-out shape), and NO UPDATE policy — checkout and every HR correction go through `createAdminSupabaseClient()` with explicit checks in code.
- `hr_config` stays read/written exclusively through the service-role client (no RLS policies for `authenticated`) — same as every other field on it.
- Single check-in/out session per day, enforced structurally by `unique (user_id, date)` on `attendance_records`, not merely in application code.
- The office IP gate is bypassed only by an `approved` `wfh`-type `leave_requests` row covering today's date — computed live on every check-in/out call, never cached or snapshotted.
- `requireUser()` gates `/attendance` (universally reachable, like `/leave` — never module-gated). `requireModule('hr')` gates `/users/attendance-records` and the office-IP-allowlist field on `/users/config`.
- `@/app/(app)/confirm-submit-button.tsx` already exists (shared `ConfirmSubmitButton`) — this plan's actions don't need confirmation dialogs (check-in/out/correction aren't destructive in the same sense as approve/reject), so it is not reused here.

---

### Task 1: Migration (MANUAL — human runs this in the Supabase SQL editor)

**Files:**
- Create: `supabase/migrations/0011_attendance.sql`

**Interfaces:**
- Produces: `public.attendance_records` table (`id`, `user_id`, `date`, `checked_in_at`, `checked_in_ip`, `checked_out_at`, `checked_out_ip`, `created_at`) and `public.hr_config.office_ip_allowlist` column — consumed by every later task.

- [ ] **Step 1: Write the migration**

```sql
alter table public.hr_config
  add column if not exists office_ip_allowlist text not null default '';

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  date date not null,
  checked_in_at timestamptz,
  checked_in_ip text,
  checked_out_at timestamptz,
  checked_out_ip text,
  created_at timestamptz not null default now(),
  -- One check-in/out session per employee per day, enforced structurally —
  -- a second same-day check-in fails at the database level even if the
  -- application-code check in checkIn() is ever bypassed.
  unique (user_id, date)
);

alter table public.attendance_records enable row level security;

-- Employee can read only their own records (needed for their own
-- /attendance history and for the "already checked in today" check).
drop policy if exists "attendance_records_select_own" on public.attendance_records;
create policy "attendance_records_select_own" on public.attendance_records
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- Check-in inserts the day's row directly via the regular client (no
-- service-role needed for check-in itself). `with check` pins user_id to
-- the caller and requires a fresh, not-yet-checked-out shape (checked_out_at
-- and checked_out_ip both null), so a row can't be inserted via REST already
-- showing a checkout — same anti-forgery shape as leave_requests' insert-own
-- policy in migration 0009.
drop policy if exists "attendance_records_insert_own" on public.attendance_records;
create policy "attendance_records_insert_own" on public.attendance_records
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and checked_out_at is null
    and checked_out_ip is null
    and exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.is_active
    )
  );

-- No UPDATE policy for `authenticated` — check-out and every HR manual
-- correction go through the service-role client via Server Actions, each
-- with an explicit ownership/authorization check in code.
```

- [ ] **Step 2: Human runs this migration in the Supabase SQL editor**

This step cannot be automated by an agentic worker — flag it to your human
partner and wait for confirmation it has been run before Task 7 (manual
end-to-end QA) can proceed. Every other task can be implemented and
`npm run build`-verified without this migration having run yet.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_attendance.sql
git commit -m "feat: add attendance_records table and hr_config.office_ip_allowlist"
```

---

### Task 2: Types, validation schemas, and pure helpers

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`
- Create: `lib/attendance.ts`

**Interfaces:**
- Consumes: Task 1's `attendance_records` columns and `hr_config.office_ip_allowlist` column (exact names above).
- Produces: `Database['public']['Tables']['attendance_records']` Row/Insert/Update types; `updateHrConfigSchema` gains `officeIpAllowlist`; new `correctAttendanceSchema`; `lib/attendance.ts` exports `parseClientIp(forwardedFor: string | null): string | null`, `isIpAllowed(ip: string, allowlist: string): boolean`, `hoursWorked(checkedInAt: string, checkedOutAt: string | null): number | null`, `todayDate(): string` — all consumed by Tasks 3-6.

- [ ] **Step 1: Add `attendance_records` to `types/database.ts`**

Add this table entry inside the `Tables` object, after the `leave_requests` entry (`types/database.ts:226`, right before the closing `}` of `Tables`):

```typescript
      attendance_records: {
        Row: {
          id: string
          user_id: string
          date: string
          checked_in_at: string | null
          checked_in_ip: string | null
          checked_out_at: string | null
          checked_out_ip: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          date: string
          checked_in_at?: string | null
          checked_in_ip?: string | null
        }
        Update: Partial<{
          checked_in_at: string | null
          checked_in_ip: string | null
          checked_out_at: string | null
          checked_out_ip: string | null
        }>
        Relationships: []
      }
```

- [ ] **Step 2: Add `office_ip_allowlist` to the `hr_config` table entry**

In `types/database.ts`, the `hr_config` table entry (`types/database.ts:149-199`):
- `Row` (after `working_sunday: boolean` on line 158): add `office_ip_allowlist: string`
- `Insert` (after `working_sunday?: boolean` on line 175): add `office_ip_allowlist?: string`
- `Update`'s `Partial<{...}>` (after `working_saturday: boolean` on line 189): add `office_ip_allowlist: string`

Every other field in all three shapes stays byte-for-byte unchanged.

- [ ] **Step 3: Verify the build still compiles with the new types**

Run: `npm run build`
Expected: succeeds (no code references the new fields yet, so this only checks the type additions themselves are syntactically valid).

- [ ] **Step 4: Add `officeIpAllowlist` to `updateHrConfigSchema` in `lib/validation.ts`**

In `lib/validation.ts`, add one field to the `updateHrConfigSchema` object (`lib/validation.ts:90-103`), right after `paternityLeaveDays: leaveDayCount,` (line 102):

```typescript
    officeIpAllowlist: z.string().trim().max(2000),
```

The existing `.refine(...)` on this schema (lines 104-113, requiring at least one working weekday) stays unchanged — it doesn't reference this new field.

- [ ] **Step 5: Add `correctAttendanceSchema` to `lib/validation.ts`**

Add this at the end of `lib/validation.ts`, after `leaveRequestIdSchema` (line 135):

```typescript
export const correctAttendanceSchema = z.object({
  recordId: z.string().uuid(),
  checkedInAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a valid date and time')
    .optional()
    .or(z.literal('')),
  checkedOutAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a valid date and time')
    .optional()
    .or(z.literal('')),
})
```

This matches the `<input type="datetime-local">` format (`YYYY-MM-DDTHH:mm`) used in Task 6's HR correction form.

- [ ] **Step 6: Create `lib/attendance.ts`**

```typescript
/** The first IP in an X-Forwarded-For header value, or null if absent/empty. */
export function parseClientIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null
  const first = forwardedFor.split(',')[0]?.trim()
  return first && first.length > 0 ? first : null
}

/**
 * Whether `ip` matches any entry in a comma-separated allowlist of exact
 * IPv4 addresses and/or IPv4 CIDR ranges (e.g. "203.0.113.5,198.51.100.0/24").
 * Blank entries are ignored; a blank/empty allowlist matches nothing.
 * IPv6 is not supported — out of scope per the design spec.
 */
export function isIpAllowed(ip: string, allowlist: string): boolean {
  const entries = allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return entries.some((entry) => matchesAllowlistEntry(ip, entry))
}

function matchesAllowlistEntry(ip: string, entry: string): boolean {
  if (!entry.includes('/')) return ip === entry

  const [rangeIp, prefixStr] = entry.split('/')
  const prefix = Number(prefixStr)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false

  const ipInt = ipv4ToInt(ip)
  const rangeInt = ipv4ToInt(rangeIp)
  if (ipInt === null || rangeInt === null) return false

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  return (ipInt & mask) === (rangeInt & mask)
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null

  let result = 0
  for (const part of parts) {
    const n = Number(part)
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
    result = (result << 8) | n
  }
  return result >>> 0
}

/** Hours worked (2 decimal places), or null if not yet checked out. */
export function hoursWorked(checkedInAt: string, checkedOutAt: string | null): number | null {
  if (!checkedOutAt) return null
  const ms = new Date(checkedOutAt).getTime() - new Date(checkedInAt).getTime()
  return Math.round((ms / 3600000) * 100) / 100
}

/** Today's date as YYYY-MM-DD in the server's local time zone. */
export function todayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add types/database.ts lib/validation.ts lib/attendance.ts
git commit -m "feat: add attendance types, validation schemas, and helpers"
```

---

### Task 3: Office IP allowlist field on HR configuration

**Files:**
- Modify: `app/(app)/users/config/page.tsx`
- Modify: `app/(app)/users/config/actions.ts`

**Interfaces:**
- Consumes: `updateHrConfigSchema` (Task 2), `hr_config.office_ip_allowlist` column (Task 1).
- Produces: nothing new consumed by later tasks — Tasks 4-6 read `hr_config.office_ip_allowlist` directly via the admin client, not through this page.

- [ ] **Step 1: Add the allowlist field to the config form**

In `app/(app)/users/config/page.tsx`, insert this new section into the `<form>` (`app/(app)/users/config/page.tsx:40-122`), right after the "Annual leave allocation" `<div>` closes (after line 117) and before the `<button type="submit">` (line 119):

```tsx
          <div>
            <h2 className="text-sm font-medium text-gray-500">Office network (attendance check-in)</h2>
            <p className="mt-1 text-xs text-gray-500">
              Comma-separated IPv4 addresses or CIDR ranges (e.g. 203.0.113.5, 198.51.100.0/24). Employees can
              only check in/out from these networks unless they have an approved WFH request for today.
            </p>
            <textarea
              name="officeIpAllowlist"
              rows={2}
              defaultValue={config?.office_ip_allowlist ?? ''}
              className="mt-2 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
```

- [ ] **Step 2: Parse and save the field in the update action**

In `app/(app)/users/config/actions.ts`, add to the `updateHrConfigSchema.safeParse({...})` call (`app/(app)/users/config/actions.ts:12-24`), right after `paternityLeaveDays: formData.get('paternityLeaveDays'),` (line 23):

```typescript
    officeIpAllowlist: formData.get('officeIpAllowlist'),
```

And add to the `.update({...})` payload (`app/(app)/users/config/actions.ts:33-47`), right after `paternity_leave_days: parsed.data.paternityLeaveDays,` (line 43):

```typescript
      office_ip_allowlist: parsed.data.officeIpAllowlist,
```

Every other field in both the parse call and the update payload stays unchanged.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/users/config/page.tsx app/\(app\)/users/config/actions.ts
git commit -m "feat: add office IP allowlist field to HR configuration"
```

---

### Task 4: Check-in/check-out actions and the employee's own `/attendance` page

**Files:**
- Create: `app/(app)/attendance/actions.ts`
- Create: `app/(app)/attendance/page.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `lib/attendance.ts`'s `parseClientIp`, `isIpAllowed`, `hoursWorked`, `todayDate` (Task 2); `attendance_records` RLS policies (Task 1); `hr_config.office_ip_allowlist` (Task 1, read via admin client).
- Produces: `checkIn(): Promise<void>` and `checkOut(): Promise<void>` Server Actions, exported from `app/(app)/attendance/actions.ts` — not consumed by any later task in this plan (Task 5 adds to the same page but doesn't call these).

- [ ] **Step 1: Create the check-in/check-out Server Actions**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { isIpAllowed, parseClientIp, todayDate } from '@/lib/attendance'

async function resolveClientIp(): Promise<string | null> {
  const headerList = await headers()
  return parseClientIp(headerList.get('x-forwarded-for'))
}

// The IP gate and the WFH bypass are both re-evaluated here on every call —
// never cached, never trusted from the client — per the design spec.
async function isGateOpen(userId: string, ip: string | null): Promise<boolean> {
  const admin = createAdminSupabaseClient()
  const { data: config } = await admin.from('hr_config').select('office_ip_allowlist').eq('id', true).single()
  const allowlist = config?.office_ip_allowlist ?? ''

  if (ip && isIpAllowed(ip, allowlist)) return true

  // WFH lookup queries the caller's own leave_requests rows, already
  // covered by that table's existing SELECT-own policy, so it uses the
  // regular authenticated client — no service-role needed here.
  const supabase = await createClient()
  const today = todayDate()
  const { data: wfh } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'wfh')
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)

  return (wfh ?? []).length > 0
}

export async function checkIn() {
  const currentUser = await requireUser()
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
    redirect('/attendance?error=' + encodeURIComponent('Already checked in today'))
  }

  const gateOpen = await isGateOpen(currentUser.id, ip)
  if (!gateOpen) {
    redirect('/attendance?error=' + encodeURIComponent('Not on the office network'))
  }

  const { error } = await supabase.from('attendance_records').insert({
    user_id: currentUser.id,
    date: today,
    checked_in_at: new Date().toISOString(),
    checked_in_ip: ip,
  })

  if (error) {
    redirect('/attendance?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/attendance')
  redirect('/attendance')
}

export async function checkOut() {
  const currentUser = await requireUser()
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
    redirect('/attendance?error=' + encodeURIComponent('Not checked in today, or already checked out'))
  }

  const gateOpen = await isGateOpen(currentUser.id, ip)
  if (!gateOpen) {
    redirect('/attendance?error=' + encodeURIComponent('Not on the office network'))
  }

  // Re-check `checked_out_at is null` in the update's own filter (not just
  // the fetch above), and confirm via `.select().single()` that the update
  // actually matched a row — same race-safety and silent-no-op guard used
  // everywhere else in this app (e.g. cancelLeaveRequest in
  // app/(app)/leave/actions.ts).
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
    redirect('/attendance?error=' + encodeURIComponent(message))
  }

  revalidatePath('/attendance')
  redirect('/attendance')
}
```

- [ ] **Step 2: Create the `/attendance` page (own check-in/out and history)**

```tsx
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { hoursWorked, todayDate } from '@/lib/attendance'
import { checkIn, checkOut } from './actions'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireUser()
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Attendance</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4">
          {!todayRecord?.checked_in_at ? (
            <form action={checkIn}>
              <button type="submit" className="rounded bg-black px-4 py-2 text-white">
                Check In
              </button>
            </form>
          ) : !todayRecord.checked_out_at ? (
            <form action={checkOut}>
              <button type="submit" className="rounded bg-black px-4 py-2 text-white">
                Check Out
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-500">Checked out for today.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">My history</h2>
        {recordsError ? (
          <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">Could not load your attendance history</p>
        ) : myRecords && myRecords.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {myRecords.map((record) => {
              const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
              return (
                <li key={record.id} className="rounded border p-3 text-sm">
                  <span className="font-medium">{record.date}</span> —{' '}
                  {record.checked_in_at ? new Date(record.checked_in_at).toLocaleTimeString() : '—'} to{' '}
                  {record.checked_out_at ? new Date(record.checked_out_at).toLocaleTimeString() : 'not checked out'}
                  {hours !== null && <> ({hours}h)</>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No attendance records yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the nav link**

In `app/(app)/layout.tsx`, add a link right after the existing `/leave` link (`app/(app)/layout.tsx:32-34`), so both universally-reachable links sit together:

```tsx
          <Link href="/attendance" className="text-sm text-gray-600 hover:text-black">
            Attendance
          </Link>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/attendance/actions.ts app/\(app\)/attendance/page.tsx app/\(app\)/layout.tsx
git commit -m "feat: add check-in/check-out actions and the attendance page"
```

---

### Task 5: Manager's "My team's attendance" section

**Files:**
- Modify: `app/(app)/attendance/page.tsx`

**Interfaces:**
- Consumes: `employee_profiles.manager_id` (already exists, from the Manager-Routed Leave Approval sub-project), `attendance_records` (Task 1), Task 4's `AttendancePage` component (this task extends it, not replaces it).
- Produces: nothing consumed by later tasks — this is the final piece of the employee-facing page.

- [ ] **Step 1: Add the team data-fetching block**

In `app/(app)/attendance/page.tsx`, add these imports at the top, alongside the existing ones:

```typescript
import type { PostgrestError } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
```

Then, inside the `AttendancePage` function, right after the `todayRecord` line and before the `return`, add:

```typescript
  const admin = createAdminSupabaseClient()

  const { data: myReports, error: reportsError } = await admin
    .from('employee_profiles')
    .select('user_id')
    .eq('manager_id', currentUser.id)
  const reportIds = (myReports ?? []).map((report) => report.user_id)

  let teamToday: {
    user_id: string
    checked_in_at: string | null
    checked_out_at: string | null
  }[] = []
  let teamNameById = new Map<string, string>()
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
  }
```

- [ ] **Step 2: Render the team section**

Add this new `<div>` right after the closing `</div>` of the "My history" section (the last `</div>` before the outer `</div>` that closes the component's return), still inside the outer `<div className="space-y-8">`:

```tsx
      {(reportsError || reportIds.length > 0) && (
        <div>
          <h2 className="text-lg font-semibold">My team&apos;s attendance</h2>
          {reportsError ? (
            <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">Could not load your team</p>
          ) : teamRecordsError ? (
            <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">Could not load your team&apos;s attendance</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reportIds.map((reportId) => {
                const record = teamToday.find((r) => r.user_id === reportId)
                const status = !record?.checked_in_at
                  ? 'not checked in today'
                  : !record.checked_out_at
                    ? `checked in at ${new Date(record.checked_in_at).toLocaleTimeString()}`
                    : `${new Date(record.checked_in_at).toLocaleTimeString()} to ${new Date(
                        record.checked_out_at
                      ).toLocaleTimeString()}`
                return (
                  <li key={reportId} className="rounded border p-3 text-sm">
                    <span className="font-medium">{teamNameById.get(reportId) ?? 'Unknown'}</span> — {status}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/attendance/page.tsx
git commit -m "feat: add manager's team attendance section to /attendance"
```

---

### Task 6: HR attendance records page and manual correction

**Files:**
- Create: `app/(app)/users/attendance-records/page.tsx`
- Create: `app/(app)/users/attendance-records/actions.ts`

**Interfaces:**
- Consumes: `correctAttendanceSchema` (Task 2), `attendance_records` table (Task 1).
- Produces: `correctAttendanceRecord(formData: FormData): Promise<void>` — not consumed by any other task in this plan.

- [ ] **Step 1: Create the correction Server Action**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { correctAttendanceSchema } from '@/lib/validation'

export async function correctAttendanceRecord(formData: FormData) {
  await requireModule('hr')

  const parsed = correctAttendanceSchema.safeParse({
    recordId: formData.get('recordId'),
    checkedInAt: formData.get('checkedInAt'),
    checkedOutAt: formData.get('checkedOutAt'),
  })

  if (!parsed.success) {
    redirect('/users/attendance-records?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  if (!parsed.data.checkedInAt && !parsed.data.checkedOutAt) {
    redirect('/users/attendance-records?error=' + encodeURIComponent('Enter at least one time to save'))
  }

  const admin = createAdminSupabaseClient()

  const { data: record } = await admin
    .from('attendance_records')
    .select('id, checked_in_at, checked_out_at')
    .eq('id', parsed.data.recordId)
    .single()

  if (!record) {
    redirect('/users/attendance-records?error=' + encodeURIComponent('Record not found'))
  }

  const checkedInAt = parsed.data.checkedInAt ? new Date(parsed.data.checkedInAt).toISOString() : record.checked_in_at
  const checkedOutAt = parsed.data.checkedOutAt
    ? new Date(parsed.data.checkedOutAt).toISOString()
    : record.checked_out_at

  if (checkedInAt && checkedOutAt && checkedOutAt < checkedInAt) {
    redirect('/users/attendance-records?error=' + encodeURIComponent('Checkout must be after check-in'))
  }

  // Row-count-check pattern: confirm the update actually matched a row
  // rather than silently no-op'ing, same as every other write in this app.
  const { data: updated, error } = await admin
    .from('attendance_records')
    .update({ checked_in_at: checkedInAt, checked_out_at: checkedOutAt })
    .eq('id', parsed.data.recordId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Record not found' : error.message
    redirect('/users/attendance-records?error=' + encodeURIComponent(message))
  }

  revalidatePath('/users/attendance-records')
  redirect('/users/attendance-records')
}
```

- [ ] **Step 2: Create the HR page**

Per the design spec's Access control section ("HR/Admin: full read access to
every employee's attendance across the company, plus the manual-correction
action"), this page lists every employee's records from the last 30 days
(not only the ones missing a checkout), each with an always-available
correction form — so HR can fix a wrong check-in time too, not only fill in
a missing checkout. Records missing a checkout sort first within each day
so they're easy to spot.

```tsx
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { correctAttendanceRecord } from './actions'

export default async function AttendanceRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('hr')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sinceDate = thirtyDaysAgo.toISOString().slice(0, 10)

  const { data: records, error: recordsError } = await admin
    .from('attendance_records')
    .select('id, user_id, date, checked_in_at, checked_out_at')
    .gte('date', sinceDate)
    .order('date', { ascending: false })

  const sortedRecords = [...(records ?? [])].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    const aOpen = a.checked_in_at && !a.checked_out_at
    const bOpen = b.checked_in_at && !b.checked_out_at
    return aOpen === bOpen ? 0 : aOpen ? -1 : 1
  })

  const userIds = [...new Set(sortedRecords.map((record) => record.user_id))]
  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((user) => [user.id, user.name]))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Attendance records</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {recordsError ? (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">Could not load attendance records</p>
      ) : sortedRecords.length === 0 ? (
        <p className="text-sm text-gray-500">No attendance records in the last 30 days.</p>
      ) : (
        <ul className="space-y-3">
          {sortedRecords.map((record) => (
            <li key={record.id} className="rounded border p-4">
              <p className="text-sm font-medium">
                {nameById.get(record.user_id) ?? 'Unknown'} — {record.date}
                {record.checked_in_at && !record.checked_out_at && (
                  <span className="ml-2 text-xs font-normal text-amber-600">missing checkout</span>
                )}
              </p>
              <form action={correctAttendanceRecord} className="mt-2 flex flex-wrap items-end gap-3">
                <input type="hidden" name="recordId" value={record.id} />
                <label className="text-sm">
                  Checked in
                  <input
                    type="datetime-local"
                    name="checkedInAt"
                    defaultValue={record.checked_in_at ? record.checked_in_at.slice(0, 16) : ''}
                    className="mt-1 block rounded border px-2 py-1"
                  />
                </label>
                <label className="text-sm">
                  Checked out
                  <input
                    type="datetime-local"
                    name="checkedOutAt"
                    defaultValue={record.checked_out_at ? record.checked_out_at.slice(0, 16) : ''}
                    className="mt-1 block rounded border px-2 py-1"
                  />
                </label>
                <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/users/attendance-records/page.tsx app/\(app\)/users/attendance-records/actions.ts
git commit -m "feat: add HR attendance records page with missed-checkout correction"
```

---

### Task 7: End-to-end verification (MANUAL — human ran Task 1's migration first)

**Files:** none (verification only)

- [ ] **Step 1: Manually verify the full flow**

```bash
npm run dev
```

Before starting, find your machine's current public IP (e.g. via a "what's my IP" lookup) and set `HR configuration`'s office network field to it (via `/users/config`, logged in as HR/Admin) so local testing check-ins succeed as "on office network".

1. As a plain employee (not HR/Admin), visit `/attendance`. Confirm the page loads (ungated) and shows a "Check In" button.
2. Click Check In. Confirm it succeeds (the dev server's outbound IP matches the allowlisted IP) and the button changes to "Check Out".
3. Attempt to check in again (e.g. by hitting the check-in Server Action a second time, or reloading — the button should no longer offer it). Confirm the app does not allow a second check-in the same day.
4. Click Check Out. Confirm the history section below now shows today's row with both times and computed hours.
5. Temporarily set the office IP allowlist (`/users/config`) to something that does **not** match your current IP (e.g. `203.0.113.1`). As a different test employee, attempt to check in. Confirm it's rejected with "Not on the office network".
6. As HR/Admin, submit and approve a WFH leave request for that same test employee covering today (via `/leave` and `/users/leave-requests`, from the already-shipped Leave & WFH Requests and Manager-Routed Leave Approval sub-projects). With the allowlist still not matching, have that employee attempt check-in again. Confirm it now succeeds (WFH bypass).
7. Restore the office IP allowlist to the correct value afterward.
8. Assign a manager to a test employee (via `/users/[id]`, from the Manager-Routed Leave Approval sub-project) if not already assigned. Have that employee check in (but not out). As the manager, visit `/attendance` and confirm "My team's attendance" shows that employee as checked in but not checked out.
9. As HR/Admin, visit `/users/attendance-records`. Confirm the still-open record from step 8 appears with the amber "missing checkout" label. Fill in a checkout time and save. Confirm the label disappears and the employee's own `/attendance` history now shows it as checked out with the corrected time.
10. Attempt a correction with a checkout time earlier than the check-in time. Confirm it's rejected with "Checkout must be after check-in".
11. Clean up: any test check-ins/records created for this QA pass can be left as-is (they're real timestamped history, not destructive test data like user accounts) — but deactivate any throwaway test employee accounts created solely for this QA pass, matching this session's established cleanup convention.

- [ ] **Step 2: No commit** — this task is verification only, nothing to commit.
