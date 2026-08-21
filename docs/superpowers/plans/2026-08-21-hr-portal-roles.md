# HR Portal: Roles & Module Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `hr` role, a runtime-editable role→module permission matrix, and remove the employee-initiated profile change-request system so employees have read-only profile access and only Admin/HR can change anything.

**Architecture:** A new `role_module_access` table (read exclusively via the service-role client — no RLS policies for the regular client) backs a `requireModule(moduleKey)` helper that replaces every `requireAdmin()` call. Admin bypasses the matrix entirely (hardcoded). The existing `employee_profile_requests` table, its two Server Actions, and the `/users/requests` page are deleted outright; `/profile` becomes a read-only view.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase, Tailwind CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-21-hr-portal-roles-design.md](../specs/2026-08-21-hr-portal-roles-design.md)

## Global Constraints

- Admin is fixed: always has every module, never stored as a togglable row, never consults the matrix.
- Modules are exactly: `dashboard`, `leads`, `clients`, `hr`, `settings`. `hr` covers the employee list, invite/deactivate/reset-password, and admin-direct-edit of any profile — deliberately not the same thing as "view my own profile" (see below).
- `/profile` (viewing your OWN profile) is never gated by the module matrix — every authenticated user can always reach it, the same way anyone can always sign out. Only the `hr` module (managing OTHER employees) is gated.
- Default matrix (all editable afterward via the UI): `hr` role → `hr`: on, everything else off. `employee` role → `dashboard`, `leads`, `clients`: on, `hr`/`settings`: off.
- Employees cannot edit anything, anywhere. The `employee_profile_requests` table, `submitProfileChangeRequest` action, `/profile`'s edit form, "My requests" section, and the entire `/users/requests` approval queue are removed, not hidden.
- `role_module_access` has RLS enabled with zero policies for `authenticated` — read/write exclusively through `createAdminSupabaseClient()`, matching how `users` writes already work in this app. This is a deliberate lockdown, not an oversight.
- No `any` types anywhere. No automated test suite — `npm run build` succeeding with zero TypeScript errors is the acceptance bar for every task.
- Ruling made during planning (not explicitly stated in the spec, but required for the matrix to be a real permission system rather than a cosmetic nav filter): `dashboard`, `leads`, and `clients` — including their `[id]` detail pages — get their own `requireModule()` gate too, not just the nav link. Today these pages have no role gate at all (any active employee, full stop) — since the default matrix keeps that behavior for `employee` (all three on) and Admin bypasses the matrix, this is invisible under the defaults, but it means an admin who later disables `leads` for `employee` (or grants `hr` a CRM module) gets real enforcement, not just a hidden link that's still reachable by URL. This mirrors the RLS-hardening precedent already set twice in this codebase (`0002`, `0005`) — nav-hidden-but-still-reachable is a defect class this project has fixed before, not introduced here.
- Explicit scope boundary on that ruling: it covers page-level reads only. `createLead`, `updateLeadStage`, and `addActivity` in `app/(app)/leads/actions.ts` keep their existing `requireUser()` gate, unchanged. Extending module-gating into the CRM's write path would mean auditing/re-designing the whole "any active employee can write" model that Foundation deliberately chose and this session already hardened twice at the RLS layer — that is a re-litigation of a settled, separate design decision, not part of "HR Portal: Roles & Module Access." Out of scope for this sub-project.

---

### Task 1: Database migration (MANUAL — human step)

This task requires running SQL against the live Supabase project, which the agent has no
programmatic access to. A human runs this step; the agent's job is to produce the exact
SQL and commit it as a migration file.

**Files:**
- Create: `supabase/migrations/0007_role_module_access.sql`

**Interfaces:**
- Produces: `role_module_access` table (seeded with the default matrix) and a widened
  `users.role` CHECK constraint (`admin`/`hr`/`employee`) that Task 2 onward depends on.
  Drops `employee_profile_requests` and its policies.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0007_role_module_access.sql`:

```sql
-- Widen the role CHECK constraint to allow 'hr'. The constraint's exact name
-- wasn't set explicitly in 0001_init.sql, so Postgres auto-generated it —
-- look it up rather than guessing, so this doesn't silently no-op if the
-- generated name differs from the Postgres default convention.
do $$
declare
  role_constraint_name text;
begin
  select conname into role_constraint_name
  from pg_constraint
  where conrelid = 'public.users'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role%';

  if role_constraint_name is not null then
    execute format('alter table public.users drop constraint %I', role_constraint_name);
  end if;
end $$;

alter table public.users add constraint users_role_check
  check (role in ('admin', 'hr', 'employee'));

create table if not exists public.role_module_access (
  role text not null check (role in ('hr', 'employee')),
  module text not null check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings')),
  enabled boolean not null default false,
  primary key (role, module)
);

-- No policies for `authenticated` on purpose: this table is read and written
-- exclusively through the service-role client (requireModule's lookup, the
-- nav's batched lookup, and the Admin permissions-editor action) — the same
-- pattern the `users` table already uses for writes. RLS enabled with zero
-- policies means the regular client gets zero rows either way; this is a
-- deliberate lockdown, not an oversight.
alter table public.role_module_access enable row level security;

insert into public.role_module_access (role, module, enabled) values
  ('hr', 'hr', true),
  ('employee', 'dashboard', true),
  ('employee', 'leads', true),
  ('employee', 'clients', true)
on conflict (role, module) do nothing;
-- Every other (role, module) pair is implicitly false (absent row).

-- Remove the employee change-request system — employees cannot edit
-- anything any more, so this table (and the pages/actions that used it) is
-- being deleted outright, not just hidden.
drop policy if exists "employee_profile_requests_select_own" on public.employee_profile_requests;
drop policy if exists "employee_profile_requests_insert_own" on public.employee_profile_requests;
drop table if exists public.employee_profile_requests;
```

- [ ] **Step 2: Human runs the migration**

Hand these instructions to the user:

1. Go to the Supabase dashboard for the `yvnfiihppvderdjhzdyy` project.
2. SQL Editor → paste the contents of `supabase/migrations/0007_role_module_access.sql` → Run.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0007_role_module_access.sql
git commit -m "feat: add role_module_access table, hr role, drop employee_profile_requests"
```

---

### Task 2: Types and validation schemas

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`

**Interfaces:**
- Produces: `Module` type, widened `UserRole`, `role_module_access` table entry from
  `@/types/database`. Widened `inviteUserSchema`, new `configurableRoles`,
  `moduleKeys`, `updateModuleAccessSchema` from `@/lib/validation`. Removes
  `EmployeeProfileField`, `ProfileRequestStatus` types and the `employee_profile_requests`
  table entry, and `employeeProfileFields`, `submitProfileChangesSchema`,
  `reviewProfileRequestSchema` from validation (all now unused — their only consumers are
  deleted in Task 6).

- [ ] **Step 1: Update `types/database.ts`**

Change the top of the file from:

```ts
export type UserRole = 'admin' | 'employee'
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'lost'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
export type ActivityType = 'note' | 'call' | 'email' | 'stage_change'
export type EmploymentType = 'full_time' | 'part_time' | 'contract'
export type EmployeeProfileField =
  | 'phone'
  | 'address'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
  | 'date_of_birth'
export type ProfileRequestStatus = 'pending' | 'approved' | 'rejected'
```

to:

```ts
export type UserRole = 'admin' | 'hr' | 'employee'
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'lost'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
export type ActivityType = 'note' | 'call' | 'email' | 'stage_change'
export type EmploymentType = 'full_time' | 'part_time' | 'contract'
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings'
export type ConfigurableRole = 'hr' | 'employee'
```

Remove the entire `employee_profile_requests` table entry (the block starting
`employee_profile_requests: {` through its closing `}` right before the `Tables`
object's final closing brace) — this table no longer exists after Task 1's migration.

Add a `role_module_access` table entry, as a sibling to `employee_profiles` (which stays
untouched — job/personal info fields are still needed by `/profile` and `/users/[id]`):

```ts
      role_module_access: {
        Row: {
          role: ConfigurableRole
          module: Module
          enabled: boolean
        }
        Insert: {
          role: ConfigurableRole
          module: Module
          enabled?: boolean
        }
        Update: Partial<{
          enabled: boolean
        }>
        Relationships: []
      }
```

- [ ] **Step 2: Update `lib/validation.ts`**

Change the `inviteUserSchema` role enum from:

```ts
export const inviteUserSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  name: z.string().trim().min(1, 'Name is required'),
  role: z.enum(['admin', 'employee']),
})
```

to:

```ts
export const inviteUserSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  name: z.string().trim().min(1, 'Name is required'),
  role: z.enum(['admin', 'hr', 'employee']),
})
```

Remove `employeeProfileFields`, `submitProfileChangesSchema`, and
`reviewProfileRequestSchema` entirely (their only consumers — `/profile`'s edit form and
`/users/requests` — are deleted in Task 6).

Keep `employmentTypes` and `updateEmployeeProfileSchema` exactly as they are (still used
by `/users/[id]`'s admin-direct-edit, unaffected by this sub-project).

Add, at the end of the file:

```ts
export const configurableRoles = ['hr', 'employee'] as const
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings'] as const

export const updateModuleAccessSchema = z.object({
  enabled: z.array(z.string()),
})
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: FAILS — `lib/access.ts`'s `requireAdmin` (unaffected by this task) still
compiles fine, but every file importing `submitProfileChangesSchema`,
`reviewProfileRequestSchema`, `employeeProfileFields`, or referencing the now-deleted
`employee_profile_requests` table type will error. This is expected at this point in the
plan — those files get fixed/deleted in Tasks 5 and 6. Confirm the errors are ONLY in
`app/(app)/profile/*` and `app/(app)/users/requests/*` (nowhere else) before proceeding —
that confirms this task's own edits are otherwise correct.

- [ ] **Step 4: Commit**

```bash
git add types/database.ts lib/validation.ts
git commit -m "feat: add Module type, hr role, module-access validation schemas"
```

---

### Task 3: `requireModule` access-control helper

**Files:**
- Modify: `lib/access.ts`

**Interfaces:**
- Consumes: `Module`, `ConfigurableRole`, `UserRole` from `@/types/database`;
  `createAdminSupabaseClient` from `@/lib/supabase/admin`.
- Produces: `getEnabledModules(role: UserRole): Promise<Module[]>`,
  `requireModule(moduleKey: Module): Promise<CurrentUser>` — both used by every later
  task. `requireAdmin` stays defined and unchanged in this task (still has live callers
  until Tasks 5-7 migrate them); it is deleted in Task 8 once nothing references it.

- [ ] **Step 1: Add the module helpers**

`lib/access.ts` currently ends with:

```ts
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/leads')
  return user
}
```

Add this import at the top of the file, alongside the existing ones:

```ts
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { Module, UserRole } from '@/types/database'
```

(The file already imports `UserRole` from `@/types/database` for the `CurrentUser`
interface — merge into that existing import line rather than duplicating it.)

Add this after `requireAdmin` (leave `requireAdmin` itself untouched — it is removed in
Task 8, not this one):

```ts
const MODULE_ORDER: Module[] = ['dashboard', 'leads', 'clients', 'hr', 'settings']

const MODULE_PATHS: Record<Module, string> = {
  dashboard: '/dashboard',
  leads: '/leads',
  clients: '/clients',
  hr: '/users',
  settings: '/settings',
}

export async function getEnabledModules(role: UserRole): Promise<Module[]> {
  if (role === 'admin') return [...MODULE_ORDER]

  const admin = createAdminSupabaseClient()
  const { data } = await admin.from('role_module_access').select('module').eq('role', role).eq('enabled', true)

  const enabledSet = new Set((data ?? []).map((row) => row.module))
  return MODULE_ORDER.filter((moduleKey) => enabledSet.has(moduleKey))
}

export async function requireModule(moduleKey: Module): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role === 'admin') return user

  const enabled = await getEnabledModules(user.role)
  if (enabled.includes(moduleKey)) return user

  redirect(enabled.length > 0 ? MODULE_PATHS[enabled[0]] : '/profile')
}
```

Note: after the `if (role === 'admin') return [...MODULE_ORDER]` early return inside
`getEnabledModules`, TypeScript narrows `role`'s type to `'hr' | 'employee'` for the rest
of the function — this matches `role_module_access.role`'s column type
(`ConfigurableRole`) exactly, so `.eq('role', role)` type-checks with no cast needed.

- [ ] **Step 2: Verify the build**

```bash
npm run build
```

Expected: same set of pre-existing failures as Task 2 left (in `app/(app)/profile/*` and
`app/(app)/users/requests/*` only) — this task's own additions (`getEnabledModules`,
`requireModule`) must introduce zero new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/access.ts
git commit -m "feat: add requireModule and getEnabledModules access-control helpers"
```

---

### Task 4: Gate Dashboard/Leads/Clients with `requireModule`

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/leads/page.tsx`
- Modify: `app/(app)/leads/[id]/page.tsx`
- Modify: `app/(app)/clients/page.tsx`
- Modify: `app/(app)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireModule` from `@/lib/access` (Task 3).

- [ ] **Step 1: Gate the Dashboard page**

In `app/(app)/dashboard/page.tsx`, add the import and call at the top of the component:

```ts
import { requireModule } from '@/lib/access'
```

```ts
export default async function DashboardPage() {
  await requireModule('dashboard')
  const supabase = await createClient()
  // ...rest of the function is unchanged
```

- [ ] **Step 2: Gate the Leads page**

In `app/(app)/leads/page.tsx`, add the import and call:

```ts
import { requireModule } from '@/lib/access'
```

```ts
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('leads')
  const { error } = await searchParams
  // ...rest of the function is unchanged
```

- [ ] **Step 3: Gate the Leads detail page**

In `app/(app)/leads/[id]/page.tsx`, add the import and call:

```ts
import { requireModule } from '@/lib/access'
```

```ts
export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('leads')
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()
  // ...rest of the function is unchanged
```

- [ ] **Step 4: Gate the Clients page**

In `app/(app)/clients/page.tsx`, add the import and call:

```ts
import { requireModule } from '@/lib/access'
```

```ts
export default async function ClientsPage() {
  await requireModule('clients')
  const supabase = await createClient()
  // ...rest of the function is unchanged
```

- [ ] **Step 5: Gate the Clients detail page**

In `app/(app)/clients/[id]/page.tsx`, add the import and call:

```ts
import { requireModule } from '@/lib/access'
```

```ts
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('clients')
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()
  // ...rest of the function is unchanged
```

- [ ] **Step 6: Verify the build**

```bash
npm run build
```

Expected: same pre-existing failures as before (Task 2's list) — no new ones.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" "app/(app)/leads/page.tsx" "app/(app)/leads/[id]/page.tsx" "app/(app)/clients/page.tsx" "app/(app)/clients/[id]/page.tsx"
git commit -m "feat: gate dashboard/leads/clients pages (list + detail) with requireModule"
```

---

### Task 5: Migrate employee-management to `requireModule('hr')`

**Files:**
- Modify: `app/(app)/users/actions.ts`
- Modify: `app/(app)/users/page.tsx`
- Modify: `app/(app)/users/[id]/page.tsx`
- Modify: `app/(app)/users/[id]/actions.ts`

**Interfaces:**
- Consumes: `requireModule` from `@/lib/access` (Task 3), widened `inviteUserSchema`
  (Task 2).

- [ ] **Step 1: `app/(app)/users/actions.ts` — swap every `requireAdmin()` call**

This file calls `requireAdmin()` four times (`inviteUser`, `clearInviteResult`,
`deactivateUser`, `reactivateUser`, `resetUserPassword` — five call sites total). Change
the import line from:

```ts
import { requireAdmin } from '@/lib/access'
```

to:

```ts
import { requireModule } from '@/lib/access'
```

Then replace every `await requireAdmin()` in this file with `await requireModule('hr')`
(five occurrences: in `inviteUser`, `clearInviteResult`, `deactivateUser` — note
`deactivateUser`'s call is `const currentUser = await requireAdmin()`, keep the
`currentUser` binding, just swap the right-hand side — `reactivateUser`, and
`resetUserPassword`). Nothing else in this file changes.

- [ ] **Step 2: `app/(app)/users/page.tsx` — swap the gate, add the HR role option**

Change:

```ts
import { requireAdmin } from '@/lib/access'
```

to:

```ts
import { requireModule } from '@/lib/access'
```

Change:

```ts
  const currentUser = await requireAdmin()
```

to:

```ts
  const currentUser = await requireModule('hr')
```

Change the invite form's role `<select>` from:

```tsx
          <select name="role" className="rounded border px-3 py-2">
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
```

to:

```tsx
          <select name="role" className="rounded border px-3 py-2">
            <option value="employee">Employee</option>
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
          </select>
```

Nothing else in this file changes.

- [ ] **Step 3: `app/(app)/users/[id]/page.tsx` — swap the gate**

Change:

```ts
import { requireAdmin } from '@/lib/access'
```

to:

```ts
import { requireModule } from '@/lib/access'
```

Change:

```ts
  await requireAdmin()
```

to:

```ts
  await requireModule('hr')
```

Nothing else in this file changes.

- [ ] **Step 4: `app/(app)/users/[id]/actions.ts` — swap the gate**

Change:

```ts
import { requireAdmin } from '@/lib/access'
```

to:

```ts
import { requireModule } from '@/lib/access'
```

Change:

```ts
  await requireAdmin()
```

to:

```ts
  await requireModule('hr')
```

Nothing else in this file changes.

- [ ] **Step 5: Verify the build**

```bash
npm run build
```

Expected: same pre-existing failures as before (Task 2's list, now narrowed — see next
step) — no new ones introduced by this task's own edits.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/users/actions.ts" "app/(app)/users/page.tsx" "app/(app)/users/[id]/page.tsx" "app/(app)/users/[id]/actions.ts"
git commit -m "feat: gate employee-management pages with requireModule('hr'), add HR invite role"
```

---

### Task 6: Remove the employee change-request system

**Files:**
- Delete: `app/(app)/users/requests/page.tsx`
- Delete: `app/(app)/users/requests/actions.ts`
- Delete: `app/(app)/profile/actions.ts`
- Modify: `app/(app)/profile/page.tsx`

**Interfaces:**
- Produces: read-only `/profile` page with no Server Action, no form, no "My requests"
  section.

- [ ] **Step 1: Delete the approval queue**

```bash
git rm -r "app/(app)/users/requests"
```

- [ ] **Step 2: Delete the employee change-request action**

```bash
git rm "app/(app)/profile/actions.ts"
```

- [ ] **Step 3: Rewrite `/profile` as read-only**

Replace the full contents of `app/(app)/profile/page.tsx` with:

```tsx
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const currentUser = await requireUser()

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type'
    )
    .eq('user_id', currentUser.id)
    .single()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">My profile</h1>

        <div className="mt-3">
          <h2 className="text-sm font-medium text-gray-500">Job info</h2>
          <p className="mt-1 text-sm">Designation: {profile?.designation ?? '—'}</p>
          <p className="text-sm">Department: {profile?.department ?? '—'}</p>
          <p className="text-sm">Start date: {profile?.employment_start_date ?? '—'}</p>
          <p className="text-sm">Employment type: {profile?.employment_type ?? '—'}</p>
        </div>

        <div className="mt-4">
          <h2 className="text-sm font-medium text-gray-500">Personal info</h2>
          <p className="mt-1 text-sm">Phone: {profile?.phone ?? '—'}</p>
          <p className="text-sm">Address: {profile?.address ?? '—'}</p>
          <p className="text-sm">Emergency contact name: {profile?.emergency_contact_name ?? '—'}</p>
          <p className="text-sm">Emergency contact phone: {profile?.emergency_contact_phone ?? '—'}</p>
          <p className="text-sm">Date of birth: {profile?.date_of_birth ?? '—'}</p>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          To update any of this information, contact HR or an admin.
        </p>
      </div>
    </div>
  )
}
```

This removes the `searchParams`/`error` handling (no form means no failed-submit case to
report), the personal-info edit form, and the entire "My requests" section, along with
the now-deleted `submitProfileChangeRequest` import and the
`employee_profile_requests` query.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors — this was the last remaining source of
the pre-existing failures from Task 2 onward. Confirm the route table no longer lists
`/users/requests`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile/page.tsx"
git commit -m "feat: remove employee change-request system, make /profile read-only"
```

---

### Task 7: Permission matrix editor under Settings

**Files:**
- Modify: `app/(app)/settings/page.tsx`
- Create: `app/(app)/settings/permissions/page.tsx`
- Create: `app/(app)/settings/permissions/actions.ts`

**Interfaces:**
- Consumes: `requireModule`, `requireUser` from `@/lib/access`; `createAdminSupabaseClient`
  from `@/lib/supabase/admin`; `configurableRoles`, `moduleKeys`, `updateModuleAccessSchema`
  from `@/lib/validation`; `ConfigurableRole`, `Module` from `@/types/database`.
- Produces: `updateModuleAccess(formData)` Server Action.

- [ ] **Step 1: Gate the existing Settings page, add a link to the editor**

Change `app/(app)/settings/page.tsx` from:

```tsx
import { requireAdmin } from '@/lib/access'

export default async function SettingsPage() {
  await requireAdmin()
```

to:

```tsx
import Link from 'next/link'
import { requireModule } from '@/lib/access'

export default async function SettingsPage() {
  await requireModule('settings')
```

Add a link to the new editor right after the `<h1>`:

```tsx
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Link href="/settings/permissions" className="text-sm text-blue-600 hover:underline">
          Edit role permissions
        </Link>
        <div>
          <h2 className="text-sm font-medium text-gray-500">AI provider API keys</h2>
```

(The `<div className="space-y-4">` wrapper and everything from `<h2>` onward is unchanged
— only the `<h1>` line gets the new `<Link>` inserted after it, and the import/gate at the
top change as shown above.)

- [ ] **Step 2: Write the matrix-update action**

Create `app/(app)/settings/permissions/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { configurableRoles, moduleKeys, updateModuleAccessSchema } from '@/lib/validation'
import type { ConfigurableRole, Module } from '@/types/database'

function isConfigurableRole(value: string): value is ConfigurableRole {
  return (configurableRoles as readonly string[]).includes(value)
}

function isModule(value: string): value is Module {
  return (moduleKeys as readonly string[]).includes(value)
}

export async function updateModuleAccess(formData: FormData) {
  await requireModule('settings')

  const parsed = updateModuleAccessSchema.safeParse({
    enabled: formData.getAll('enabled'),
  })

  if (!parsed.success) {
    redirect('/settings/permissions?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const enabledPairs = new Set(
    parsed.data.enabled.filter((pair) => {
      const [role, moduleKey] = pair.split(':')
      return role !== undefined && moduleKey !== undefined && isConfigurableRole(role) && isModule(moduleKey)
    })
  )

  const rows = configurableRoles.flatMap((role) =>
    moduleKeys.map((moduleKey) => ({
      role,
      module: moduleKey,
      enabled: enabledPairs.has(`${role}:${moduleKey}`),
    }))
  )

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('role_module_access').upsert(rows, { onConflict: 'role,module' })

  if (error) {
    redirect('/settings/permissions?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/settings/permissions')
  redirect('/settings/permissions')
}
```

- [ ] **Step 3: Write the editor page**

Create `app/(app)/settings/permissions/page.tsx`:

```tsx
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { configurableRoles, moduleKeys } from '@/lib/validation'
import { updateModuleAccess } from './actions'

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('settings')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()
  const { data: rows } = await admin.from('role_module_access').select('role, module, enabled')

  const enabledSet = new Set((rows ?? []).filter((row) => row.enabled).map((row) => `${row.role}:${row.module}`))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Role permissions</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <form action={updateModuleAccess}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Module</th>
              <th>Admin</th>
              {configurableRoles.map((role) => (
                <th key={role} className="capitalize">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {moduleKeys.map((moduleKey) => (
              <tr key={moduleKey} className="border-b">
                <td className="py-2 capitalize">{moduleKey}</td>
                <td>
                  <input type="checkbox" checked disabled />
                </td>
                {configurableRoles.map((role) => (
                  <td key={role}>
                    <input
                      type="checkbox"
                      name="enabled"
                      value={`${role}:${moduleKey}`}
                      defaultChecked={enabledSet.has(`${role}:${moduleKey}`)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" className="mt-4 rounded bg-black px-3 py-2 text-white">
          Save
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors. Route table includes `/settings` and
`/settings/permissions`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/settings/page.tsx" "app/(app)/settings/permissions"
git commit -m "feat: add role permission matrix editor under Settings"
```

---

### Task 8: Nav restructure and final cleanup

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `lib/access.ts`

**Interfaces:**
- Consumes: `getEnabledModules` from `@/lib/access` (Task 3).
- Produces: module-driven nav; removes the now-fully-unused `requireAdmin` export.

- [ ] **Step 1: Confirm `requireAdmin` has no remaining callers**

Before removing it, verify:

```bash
grep -rn "requireAdmin" --include="*.ts" --include="*.tsx" app lib
```

Expected: the only match is `requireAdmin`'s own definition in `lib/access.ts` (Tasks 5-7
migrated every call site to `requireModule`). If any other match appears, stop — a call
site was missed in an earlier task; fix it before continuing this task.

- [ ] **Step 2: Remove `requireAdmin` from `lib/access.ts`**

Delete this function (added originally in the Admin Console sub-project, superseded by
`requireModule`):

```ts
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/leads')
  return user
}
```

Nothing else in `lib/access.ts` changes.

- [ ] **Step 3: Rewrite the nav to be module-driven**

Replace `app/(app)/layout.tsx`'s full contents with:

```tsx
import Link from 'next/link'
import { requireUser, getEnabledModules } from '@/lib/access'
import { logout } from '@/app/login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const enabledModules = await getEnabledModules(user.role)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">BYC Hub</span>
          {enabledModules.includes('dashboard') && (
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
              Dashboard
            </Link>
          )}
          {enabledModules.includes('leads') && (
            <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
              Leads
            </Link>
          )}
          {enabledModules.includes('clients') && (
            <Link href="/clients" className="text-sm text-gray-600 hover:text-black">
              Clients
            </Link>
          )}
          <Link href="/profile" className="text-sm text-gray-600 hover:text-black">
            Profile
          </Link>
          {enabledModules.includes('hr') && (
            <Link href="/users" className="text-sm text-gray-600 hover:text-black">
              HR
            </Link>
          )}
          {enabledModules.includes('settings') && (
            <Link href="/settings" className="text-sm text-gray-600 hover:text-black">
              Settings
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user.name}</span>
          <form action={logout}>
            <button type="submit" className="text-gray-600 underline hover:text-black">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
```

`Profile` stays unconditional (never gated by the matrix, per the Global Constraints).
Every other link now renders only if its module is enabled for the current user's role —
Admin always sees all five, since `getEnabledModules('admin')` returns every module.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with zero TypeScript errors, zero `any`. Full route table:
`/dashboard`, `/leads`, `/leads/[id]`, `/clients`, `/clients/[id]`, `/profile`, `/users`,
`/users/[id]`, `/settings`, `/settings/permissions`, `/login`, `/`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" lib/access.ts
git commit -m "feat: drive nav visibility from role_module_access, remove requireAdmin"
```

---

### Task 9: End-to-end verification (MANUAL — human ran Task 1's migration first)

**Files:** none (verification only)

- [ ] **Step 1: Manually verify the full flow**

```bash
npm run dev
```

Logged in as the seeded admin:

1. Visit `/settings/permissions` — confirm the grid shows Admin's column as
   fixed/checked/disabled, `hr` role has only `hr` checked, `employee` role has
   `dashboard`/`leads`/`clients` checked and `hr`/`settings` unchecked (the default
   matrix Task 1's migration seeded).
2. Confirm the nav shows all five links (Dashboard, Leads, Clients, Profile, HR,
   Settings) while logged in as Admin.
3. Invite a fresh test employee with role "HR" (new dropdown option from Task 5) — confirm
   the invite succeeds and the temp password banner appears.
4. Sign out, sign in as the new HR user. Confirm the nav shows only Profile and HR (not
   Dashboard/Leads/Clients/Settings) — matches the default matrix.
5. As the HR user, visit `/dashboard` directly by URL — confirm it redirects away (not a
   crash), proving `requireModule('dashboard')` from Task 4 really blocks direct access,
   not just hides the nav link.
6. As the HR user, visit `/users` — confirm it's reachable, shows the employee list, and
   the HR user can invite/deactivate/reset-password and directly edit any employee's
   profile at `/users/[id]` (job info AND personal info, applied immediately, no approval
   step).
7. As the HR user, visit `/profile` — confirm it shows read-only job info and personal
   info with NO edit form and NO "My requests" section.
8. Sign out, sign in as an existing plain `employee` user (e.g. Sujala). Confirm the nav
   shows Dashboard/Leads/Clients/Profile but NOT HR/Settings.
9. As the employee, visit `/users` directly by URL — confirm it redirects away.
10. As the employee, visit `/profile` — confirm it's read-only, same as the HR user saw in
    step 7.
11. Sign back in as Admin. On `/settings/permissions`, toggle `employee` → `hr` ON and
    save. Sign in as the plain employee again (no re-invite needed) — confirm the nav now
    shows HR and `/users` is reachable, proving the matrix takes effect immediately with
    no redeploy.
12. Toggle it back OFF afterward to restore the default matrix, and deactivate the test HR
    user created in step 3 for cleanup (same as prior sub-projects — hard-delete isn't
    available without direct SQL access, and deactivation is this app's supported removal
    path).

- [ ] **Step 2: No commit** — this task is verification only, nothing to commit.
