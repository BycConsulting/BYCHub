# HR Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR/Admin configure which weekdays are working days and the annual allocation for five leave types, as a single runtime-editable settings record.

**Architecture:** A singleton `hr_config` table (enforced by a boolean primary key trick, so a second row is structurally impossible), read/written exclusively through the service-role client, exposed at a new `requireModule('hr')`-gated page under the existing HR area.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase, Tailwind CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-22-hr-configuration-design.md](../specs/2026-08-22-hr-configuration-design.md)

## Global Constraints

- Five leave types, fixed: Casual, Sick, Earned/Privilege, Maternity, Paternity — each its own integer day count, one global number applying to every active employee (not split by employment type).
- Working days: which of Monday–Saturday are working days, editable. `working_sunday` exists in the schema for a uniform 7-column shape but is never rendered as an editable checkbox and never settable from this app — Sunday-as-working-day is out of scope this round.
- Access: gated by the `hr` module (`requireModule('hr')`) — same level as `/users`, not the harder `settings` module.
- `hr_config` has RLS enabled with zero policies for `authenticated` — all reads/writes go through `createAdminSupabaseClient()`, matching `role_module_access`'s established pattern.
- Audit trail: `updated_at`/`updated_by` on the row, set on every save.
- At least one weekday must remain a working day — reject a submission that would zero out the whole week.
- No `any` types anywhere. No automated test suite — `npm run build` succeeding with zero TypeScript errors is the acceptance bar for every task.

---

### Task 1: Database migration (MANUAL — human step)

This task requires running SQL against the live Supabase project, which the agent has no
programmatic access to. A human runs this step; the agent's job is to produce the exact
SQL and commit it as a migration file.

**Files:**
- Create: `supabase/migrations/0008_hr_config.sql`

**Interfaces:**
- Produces: `hr_config` table (single seeded row, `id = true`) that Tasks 2-3 depend on.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0008_hr_config.sql`:

```sql
-- `id boolean primary key default true check (id)` is the standard Postgres
-- singleton-table idiom: a boolean primary key can only ever hold one
-- distinct value, so a second row is structurally impossible, not merely
-- a convention this app has to uphold in application code.
create table if not exists public.hr_config (
  id boolean primary key default true check (id),
  working_monday boolean not null default true,
  working_tuesday boolean not null default true,
  working_wednesday boolean not null default true,
  working_thursday boolean not null default true,
  working_friday boolean not null default true,
  working_saturday boolean not null default true,
  working_sunday boolean not null default false,
  casual_leave_days integer not null default 12,
  sick_leave_days integer not null default 12,
  earned_leave_days integer not null default 15,
  maternity_leave_days integer not null default 182,
  paternity_leave_days integer not null default 15,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

-- No policies for `authenticated` on purpose: read and written exclusively
-- through the service-role client (the config page's read, the update
-- action's write) — same lockdown pattern as `role_module_access`.
alter table public.hr_config enable row level security;

insert into public.hr_config (id) values (true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Human runs the migration**

Hand these instructions to the user:

1. Go to the Supabase dashboard for the `yvnfiihppvderdjhzdyy` project.
2. SQL Editor → paste the contents of `supabase/migrations/0008_hr_config.sql` → Run.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0008_hr_config.sql
git commit -m "feat: add hr_config singleton table"
```

---

### Task 2: Types and validation schema

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`

**Interfaces:**
- Produces: `hr_config` table entry in `Database['public']['Tables']`, `updateHrConfigSchema`
  from `@/lib/validation`. Task 3 consumes both.

- [ ] **Step 1: Add the `hr_config` table entry to `types/database.ts`**

Add this as a sibling to `role_module_access`, inside `Database['public']['Tables']`
(right before the object's closing brace):

```ts
      hr_config: {
        Row: {
          id: boolean
          working_monday: boolean
          working_tuesday: boolean
          working_wednesday: boolean
          working_thursday: boolean
          working_friday: boolean
          working_saturday: boolean
          working_sunday: boolean
          casual_leave_days: number
          sick_leave_days: number
          earned_leave_days: number
          maternity_leave_days: number
          paternity_leave_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          working_monday?: boolean
          working_tuesday?: boolean
          working_wednesday?: boolean
          working_thursday?: boolean
          working_friday?: boolean
          working_saturday?: boolean
          working_sunday?: boolean
          casual_leave_days?: number
          sick_leave_days?: number
          earned_leave_days?: number
          maternity_leave_days?: number
          paternity_leave_days?: number
          updated_by?: string | null
        }
        Update: Partial<{
          working_monday: boolean
          working_tuesday: boolean
          working_wednesday: boolean
          working_thursday: boolean
          working_friday: boolean
          working_saturday: boolean
          casual_leave_days: number
          sick_leave_days: number
          earned_leave_days: number
          maternity_leave_days: number
          paternity_leave_days: number
          updated_at: string
          updated_by: string | null
        }>
        Relationships: []
      }
```

Note: `Update` deliberately omits `id` and `working_sunday` — neither is ever settable from
this app's code (id is the fixed singleton key, working_sunday is out of scope). This isn't
just a convention; the compiler enforces it — any code that tries to write either field
through this type will fail to build.

- [ ] **Step 2: Add `updateHrConfigSchema` to `lib/validation.ts`**

Add at the end of the file:

```ts
export const updateHrConfigSchema = z
  .object({
    workingMonday: z.boolean(),
    workingTuesday: z.boolean(),
    workingWednesday: z.boolean(),
    workingThursday: z.boolean(),
    workingFriday: z.boolean(),
    workingSaturday: z.boolean(),
    casualLeaveDays: z.coerce.number().int().min(0).max(365),
    sickLeaveDays: z.coerce.number().int().min(0).max(365),
    earnedLeaveDays: z.coerce.number().int().min(0).max(365),
    maternityLeaveDays: z.coerce.number().int().min(0).max(365),
    paternityLeaveDays: z.coerce.number().int().min(0).max(365),
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
```

`z.coerce.number()` is required (not plain `z.number()`) because Server Action form values
arrive as strings via `FormData.get(...)` — the existing `deactivateUserSchema` etc. in this
file use `z.string()` throughout since they only ever handle text fields; this is the first
schema in this file needing numeric coercion, so don't copy a `z.number()` pattern from
elsewhere in the file, there isn't one to copy.

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds (these types/schemas aren't wired into any page yet).

- [ ] **Step 4: Commit**

```bash
git add types/database.ts lib/validation.ts
git commit -m "feat: add hr_config types and validation schema"
```

---

### Task 3: HR configuration page

**Files:**
- Create: `app/(app)/users/config/page.tsx`, `app/(app)/users/config/actions.ts`
- Modify: `app/(app)/users/page.tsx` (add a link to the new page)

**Interfaces:**
- Consumes: `requireModule` from `@/lib/access`; `createAdminSupabaseClient` from
  `@/lib/supabase/admin`; `updateHrConfigSchema` from `@/lib/validation`.
- Produces: `updateHrConfig(formData)` Server Action.

- [ ] **Step 1: Write the update action**

Create `app/(app)/users/config/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateHrConfigSchema } from '@/lib/validation'

export async function updateHrConfig(formData: FormData) {
  const currentUser = await requireModule('hr')

  const parsed = updateHrConfigSchema.safeParse({
    workingMonday: formData.get('workingMonday') === 'on',
    workingTuesday: formData.get('workingTuesday') === 'on',
    workingWednesday: formData.get('workingWednesday') === 'on',
    workingThursday: formData.get('workingThursday') === 'on',
    workingFriday: formData.get('workingFriday') === 'on',
    workingSaturday: formData.get('workingSaturday') === 'on',
    casualLeaveDays: formData.get('casualLeaveDays'),
    sickLeaveDays: formData.get('sickLeaveDays'),
    earnedLeaveDays: formData.get('earnedLeaveDays'),
    maternityLeaveDays: formData.get('maternityLeaveDays'),
    paternityLeaveDays: formData.get('paternityLeaveDays'),
  })

  if (!parsed.success) {
    redirect('/users/config?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('hr_config')
    .update({
      working_monday: parsed.data.workingMonday,
      working_tuesday: parsed.data.workingTuesday,
      working_wednesday: parsed.data.workingWednesday,
      working_thursday: parsed.data.workingThursday,
      working_friday: parsed.data.workingFriday,
      working_saturday: parsed.data.workingSaturday,
      casual_leave_days: parsed.data.casualLeaveDays,
      sick_leave_days: parsed.data.sickLeaveDays,
      earned_leave_days: parsed.data.earnedLeaveDays,
      maternity_leave_days: parsed.data.maternityLeaveDays,
      paternity_leave_days: parsed.data.paternityLeaveDays,
      updated_at: new Date().toISOString(),
      updated_by: currentUser.id,
    })
    .eq('id', true)
    .select('id')
    .single()

  // The singleton row always exists once Task 1's migration has run — a
  // zero-row update here almost always means the migration hasn't been run
  // yet, not a real "not found" case. Surface that possibility rather than
  // a bare error, matching the diagnostic-visibility lesson from the prior
  // sub-project's final review (silent failures there caused a full,
  // unexplained lockout).
  if (!updated) {
    const message =
      !error || error.code === 'PGRST116'
        ? 'HR configuration not found — has the 0008_hr_config migration been run?'
        : error.message
    redirect('/users/config?error=' + encodeURIComponent(message))
  }

  revalidatePath('/users/config')
  redirect('/users/config')
}
```

- [ ] **Step 2: Write the config page**

Create `app/(app)/users/config/page.tsx`:

```tsx
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateHrConfig } from './actions'

const WEEKDAYS = [
  { key: 'workingMonday', column: 'working_monday', label: 'Monday' },
  { key: 'workingTuesday', column: 'working_tuesday', label: 'Tuesday' },
  { key: 'workingWednesday', column: 'working_wednesday', label: 'Wednesday' },
  { key: 'workingThursday', column: 'working_thursday', label: 'Thursday' },
  { key: 'workingFriday', column: 'working_friday', label: 'Friday' },
  { key: 'workingSaturday', column: 'working_saturday', label: 'Saturday' },
] as const

export default async function HrConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('hr')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()
  const { data: config } = await admin.from('hr_config').select('*').eq('id', true).single()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">HR configuration</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <form action={updateHrConfig} className="space-y-6">
        <div>
          <h2 className="text-sm font-medium text-gray-500">Working days</h2>
          <div className="mt-2 flex flex-wrap gap-4">
            {WEEKDAYS.map((day) => (
              <label key={day.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={day.key} defaultChecked={config?.[day.column] ?? true} />
                {day.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-gray-500">Annual leave allocation (days)</h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="text-sm">
              Casual Leave
              <input
                type="number"
                name="casualLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.casual_leave_days ?? 12}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Sick Leave
              <input
                type="number"
                name="sickLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.sick_leave_days ?? 12}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Earned/Privilege Leave
              <input
                type="number"
                name="earnedLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.earned_leave_days ?? 15}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Maternity Leave
              <input
                type="number"
                name="maternityLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.maternity_leave_days ?? 182}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Paternity Leave
              <input
                type="number"
                name="paternityLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.paternity_leave_days ?? 15}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
          </div>
        </div>

        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save
        </button>
      </form>
    </div>
  )
}
```

`config?.[day.column]` is safe, not a dynamic-key anti-pattern: `WEEKDAYS` is declared
`as const`, so `day.column` is typed as the literal union
`'working_monday' | 'working_tuesday' | ... | 'working_saturday'`, not `string` — TypeScript
verifies every possible value against `hr_config`'s real `Row` type at compile time, the same
way the existing permission-matrix editor
(`app/(app)/settings/permissions/page.tsx`) already maps over its own `as const` arrays. This
is a different situation from the `Record<string, string>` pattern this codebase's earlier
review flagged — there the concern was a genuinely unconstrained runtime string; here the key
space is closed and checked.

- [ ] **Step 3: Add the link from `/users`**

In `app/(app)/users/page.tsx`, the file currently starts:

```tsx
import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireModule } from '@/lib/access'
```

(`Link` is already imported — used for the per-employee name links in the table.) Find this
line:

```tsx
      <div>
        <h1 className="text-lg font-semibold">Invite user</h1>
```

Change it to add a link to the config page right after the `<h1>`:

```tsx
      <div>
        <h1 className="text-lg font-semibold">Invite user</h1>
        <Link href="/users/config" className="text-sm text-blue-600 hover:underline">
          HR configuration
        </Link>
```

Nothing else in `app/(app)/users/page.tsx` changes in this task.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors, zero `any`. Route table should include
`/users/config`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/users/config" "app/(app)/users/page.tsx"
git commit -m "feat: add HR configuration page"
```

---

### Task 4: End-to-end verification (MANUAL — human ran Task 1's migration first)

**Files:** none (verification only)

- [ ] **Step 1: Manually verify the full flow**

```bash
npm run dev
```

Logged in as the seeded admin:

1. Visit `/users` — confirm the new "HR configuration" link appears next to "Invite user".
2. Click it, land on `/users/config` — confirm all six weekday checkboxes are checked
   (Monday–Saturday, matching the migration's defaults) and the five leave fields show
   12/12/15/182/15.
3. Uncheck Saturday, change Casual Leave to 10, click Save — confirm it redirects back to
   `/users/config` with Saturday now unchecked and Casual Leave showing 10.
4. Refresh the page (full reload, not just client navigation) — confirm the changes
   persisted (this proves the write actually landed in the database, not just client state).
5. Uncheck every weekday and click Save — confirm it's rejected with "At least one weekday
   must be a working day" and nothing was written (refresh and confirm the prior state from
   step 3 is still there, not all-unchecked).
6. Enter `-5` in a leave field and click Save — confirm it's rejected (the `min(0)` schema
   constraint).
7. Sign in as an `employee`-role user (or the HR test user from the prior sub-project, if
   still around) — confirm `/users/config` is unreachable by direct URL for a plain
   `employee` (redirects away, since `employee`'s default matrix has no `hr` module) and
   reachable for an `hr`-role user (same `requireModule('hr')` gate as `/users` itself).
8. As admin, restore Saturday to checked and Casual Leave back to 12, to leave the config in
   its original state for future sub-projects' QA.

- [ ] **Step 2: No commit** — this task is verification only, nothing to commit.
