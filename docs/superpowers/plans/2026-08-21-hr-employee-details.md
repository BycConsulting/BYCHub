# HR Module: Employee Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employee view their job info and propose changes to their personal info (approved by an admin), and let an admin view/edit any employee's full profile directly plus review the approval queue.

**Architecture:** Two new tables (`employee_profiles`, `employee_profile_requests`) with the same SELECT-only-for-authenticated / all-writes-via-service-role RLS pattern already used on `users`. Three new pages: `/profile` (employee self-service), `/users/[id]` (admin direct edit), `/users/requests` (admin approval queue).

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase, Tailwind CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-21-hr-employee-details-design.md](../specs/2026-08-21-hr-employee-details-design.md)

## Global Constraints

- Job info (designation, department, employment start date, employment type) is admin-only, direct edit, never touched by the employee.
- Personal info (phone, address, emergency contact name/phone, date of birth) is employee-proposed via a change request; admin approves/rejects. Admin can also edit personal info directly on `/users/[id]` — no approval needed for admin's own edits.
- `employee_profiles`/`employee_profile_requests` RLS matches `users`' existing pattern exactly: SELECT-only for the regular authenticated client, all writes (including admin edits) go through the service-role client (`createAdminSupabaseClient` from `@/lib/supabase/admin`).
- One pending request per field per employee — a new submission for a field that already has a pending request is blocked with a clear error, not silently stacked.
- While a request is pending, the profile shows only the current (last-approved) value — no inline "pending: X" hint. Pending/approved/rejected status is visible only in the employee's own "My requests" list.
- Every employee (existing and new) must have an `employee_profiles` row — the migration backfills existing users, and the invite flow creates one for every new user going forward. No page should need to lazily create a missing row.
- No `any` types anywhere — where a value needs mapping onto a specific one of five typed columns (e.g. applying an approved request's `field`/`proposed_value` onto `employee_profiles`, or reading one field's current value by name), use an explicit `switch` over the five known field names, never a dynamic/computed property key — this codebase has a documented history of `any`-casts and unsafe dynamic access papering over real type issues instead of fixing them.
- Testing: manual QA in the dev server (platform-wide decision) — no automated test suite.

---

### Task 1: Database migration (MANUAL — human step)

This task requires running SQL against the live Supabase project, which the agent has no
programmatic access to. A human runs this step; the agent's job is to produce the exact
SQL and commit it as a migration file.

**Files:**
- Create: `supabase/migrations/0006_employee_profiles.sql`

**Interfaces:**
- Produces: `employee_profiles` and `employee_profile_requests` tables (with every
  existing user backfilled a blank profile row) that Tasks 2-5 depend on.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0006_employee_profiles.sql`:

```sql
create table public.employee_profiles (
  user_id uuid primary key references public.users(id),
  phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  date_of_birth date,
  designation text,
  department text,
  employment_start_date date,
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_profile_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  field text not null check (
    field in ('phone', 'address', 'emergency_contact_name', 'emergency_contact_phone', 'date_of_birth')
  ),
  proposed_value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.employee_profiles enable row level security;
alter table public.employee_profile_requests enable row level security;

-- Employee can read only their own profile row. No INSERT/UPDATE policy here
-- is intentional — all writes (including admin edits) go through the
-- service-role client, exactly matching the `users` table's existing pattern.
create policy "employee_profiles_select_own" on public.employee_profiles
  for select to authenticated
  using (auth.uid() = user_id);

-- Employee can read and create their own change requests (submitting a
-- request is a normal self-service action). No UPDATE policy — approving or
-- rejecting a request is an admin action via the service-role client.
create policy "employee_profile_requests_select_own" on public.employee_profile_requests
  for select to authenticated
  using (auth.uid() = user_id);

create policy "employee_profile_requests_insert_own" on public.employee_profile_requests
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Every existing employee gets a blank profile row so no page ever needs to
-- lazily create one. Safe to re-run.
insert into public.employee_profiles (user_id)
select id from public.users
on conflict (user_id) do nothing;
```

- [ ] **Step 2: Human runs the migration**

Hand these instructions to the user:

1. Go to the Supabase dashboard for the `yvnfiihppvderdjhzdyy` project.
2. SQL Editor → paste the contents of `supabase/migrations/0006_employee_profiles.sql` → Run.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0006_employee_profiles.sql
git commit -m "feat: add employee_profiles and employee_profile_requests tables"
```

---

### Task 2: Types and validation schemas

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`

**Interfaces:**
- Produces:
  - `EmploymentType`, `EmployeeProfileField`, `ProfileRequestStatus` types, and
    `employee_profiles`/`employee_profile_requests` table entries, from
    `@/types/database`.
  - `employeeProfileFields`, `employmentTypes` (const arrays); `submitProfileChangesSchema`,
    `reviewProfileRequestSchema`, `updateEmployeeProfileSchema` (zod) from
    `@/lib/validation`.

- [ ] **Step 1: Add the new types to `types/database.ts`**

Add these three type exports right after the existing `ActivityType` export:

```ts
export type EmploymentType = 'full_time' | 'part_time' | 'contract'
export type EmployeeProfileField =
  | 'phone'
  | 'address'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
  | 'date_of_birth'
export type ProfileRequestStatus = 'pending' | 'approved' | 'rejected'
```

Add these two table entries inside `Database['public']['Tables']`, as two more sibling
entries after the existing `activities` entry (before the closing brace of `Tables`):

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
          updated_at: string
        }>
        Relationships: []
      }
      employee_profile_requests: {
        Row: {
          id: string
          user_id: string
          field: EmployeeProfileField
          proposed_value: string
          status: ProfileRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          field: EmployeeProfileField
          proposed_value: string
        }
        Update: Partial<{
          status: ProfileRequestStatus
          reviewed_by: string | null
          reviewed_at: string | null
        }>
        Relationships: []
      }
```

- [ ] **Step 2: Add the validation schemas to `lib/validation.ts`**

Add at the end of the file:

```ts
export const employeeProfileFields = [
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'date_of_birth',
] as const

export const employmentTypes = ['full_time', 'part_time', 'contract'] as const

export const submitProfileChangesSchema = z.object({
  phone: z.string().trim().max(200).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactName: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().max(200).optional().or(z.literal('')),
  dateOfBirth: z.string().trim().optional().or(z.literal('')),
})

export const reviewProfileRequestSchema = z.object({
  requestId: z.string().uuid(),
})

export const updateEmployeeProfileSchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().trim().max(200).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactName: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().max(200).optional().or(z.literal('')),
  dateOfBirth: z.string().trim().optional().or(z.literal('')),
  designation: z.string().trim().max(200).optional().or(z.literal('')),
  department: z.string().trim().max(200).optional().or(z.literal('')),
  employmentStartDate: z.string().trim().optional().or(z.literal('')),
  employmentType: z.enum(employmentTypes).optional().or(z.literal('')),
})
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds (these types/schemas aren't wired into any page yet).

- [ ] **Step 4: Commit**

```bash
git add types/database.ts lib/validation.ts
git commit -m "feat: add employee profile types and validation schemas"
```

---

### Task 3: Employee self-service profile page

**Files:**
- Create: `app/(app)/profile/page.tsx`, `app/(app)/profile/actions.ts`
- Modify: `app/(app)/users/actions.ts` (backfill a blank profile row on invite)
- Modify: `app/(app)/layout.tsx` (add the "Profile" nav link)

**Interfaces:**
- Consumes: `requireUser` from `@/lib/access`; `createClient` from `@/lib/supabase/server`;
  `submitProfileChangesSchema` from `@/lib/validation`; `EmployeeProfileField` from
  `@/types/database`.
- Produces: `submitProfileChangeRequest(formData)` Server Action.

- [ ] **Step 1: Make `inviteUser` create a blank profile row for every new employee**

In `app/(app)/users/actions.ts`, the `inviteUser` function currently has this block:

```ts
  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
  })

  if (profileError) {
    redirect('/users?error=' + encodeURIComponent(profileError.message))
  }
```

Add a second insert right after it, so the function now reads:

```ts
  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
  })

  if (profileError) {
    redirect('/users?error=' + encodeURIComponent(profileError.message))
  }

  const { error: employeeProfileError } = await admin.from('employee_profiles').insert({
    user_id: created.user.id,
  })

  if (employeeProfileError) {
    redirect('/users?error=' + encodeURIComponent(employeeProfileError.message))
  }
```

Nothing else in `app/(app)/users/actions.ts` changes in this task.

- [ ] **Step 2: Write the profile change-request action**

Create `app/(app)/profile/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { submitProfileChangesSchema } from '@/lib/validation'
import type { EmployeeProfileField } from '@/types/database'

export async function submitProfileChangeRequest(formData: FormData) {
  const currentUser = await requireUser()

  const parsed = submitProfileChangesSchema.safeParse({
    phone: formData.get('phone'),
    address: formData.get('address'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactPhone: formData.get('emergencyContactPhone'),
    dateOfBirth: formData.get('dateOfBirth'),
  })

  if (!parsed.success) {
    redirect('/profile?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('employee_profiles')
    .select('phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth')
    .eq('user_id', currentUser.id)
    .single()

  const { data: existingRequests } = await supabase
    .from('employee_profile_requests')
    .select('field')
    .eq('user_id', currentUser.id)
    .eq('status', 'pending')

  const pendingFields = new Set((existingRequests ?? []).map((request) => request.field))

  const candidates: { field: EmployeeProfileField; current: string | null; proposed: string }[] = [
    { field: 'phone', current: profile?.phone ?? null, proposed: parsed.data.phone ?? '' },
    { field: 'address', current: profile?.address ?? null, proposed: parsed.data.address ?? '' },
    {
      field: 'emergency_contact_name',
      current: profile?.emergency_contact_name ?? null,
      proposed: parsed.data.emergencyContactName ?? '',
    },
    {
      field: 'emergency_contact_phone',
      current: profile?.emergency_contact_phone ?? null,
      proposed: parsed.data.emergencyContactPhone ?? '',
    },
    { field: 'date_of_birth', current: profile?.date_of_birth ?? null, proposed: parsed.data.dateOfBirth ?? '' },
  ]

  const changedFields = candidates.filter(
    (candidate) => candidate.proposed !== '' && candidate.proposed !== (candidate.current ?? '')
  )

  const blockedField = changedFields.find((candidate) => pendingFields.has(candidate.field))
  if (blockedField) {
    redirect('/profile?error=' + encodeURIComponent(`You already have a pending request for ${blockedField.field}`))
  }

  if (changedFields.length === 0) {
    redirect('/profile')
  }

  const { error } = await supabase.from('employee_profile_requests').insert(
    changedFields.map((candidate) => ({
      user_id: currentUser.id,
      field: candidate.field,
      proposed_value: candidate.proposed,
    }))
  )

  if (error) {
    redirect('/profile?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/profile')
  redirect('/profile')
}
```

- [ ] **Step 3: Write the profile page**

Create `app/(app)/profile/page.tsx`:

```tsx
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { submitProfileChangeRequest } from './actions'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireUser()
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type'
    )
    .eq('user_id', currentUser.id)
    .single()

  const { data: requests } = await supabase
    .from('employee_profile_requests')
    .select('id, field, proposed_value, status, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">My profile</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="mt-3">
          <h2 className="text-sm font-medium text-gray-500">Job info (set by admin)</h2>
          <p className="mt-1 text-sm">Designation: {profile?.designation ?? '—'}</p>
          <p className="text-sm">Department: {profile?.department ?? '—'}</p>
          <p className="text-sm">Start date: {profile?.employment_start_date ?? '—'}</p>
          <p className="text-sm">Employment type: {profile?.employment_type ?? '—'}</p>
        </div>

        <form action={submitProfileChangeRequest} className="mt-4 space-y-2">
          <h2 className="text-sm font-medium text-gray-500">Personal info (changes need admin approval)</h2>
          <input
            name="phone"
            placeholder="Phone"
            defaultValue={profile?.phone ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="address"
            placeholder="Address"
            defaultValue={profile?.address ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="emergencyContactName"
            placeholder="Emergency contact name"
            defaultValue={profile?.emergency_contact_name ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="emergencyContactPhone"
            placeholder="Emergency contact phone"
            defaultValue={profile?.emergency_contact_phone ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={profile?.date_of_birth ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Submit changes for approval
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold">My requests</h2>
        {requests && requests.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {requests.map((request) => (
              <li key={request.id} className="rounded border p-3 text-sm">
                {request.field}: {request.proposed_value} — <strong>{request.status}</strong>
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

- [ ] **Step 4: Add the nav link**

In `app/(app)/layout.tsx`, the nav currently reads:

```tsx
          <Link href="/clients" className="text-sm text-gray-600 hover:text-black">
            Clients
          </Link>
          {user.role === 'admin' && (
```

Change it to add a "Profile" link (visible to everyone, not admin-gated) right after
"Clients":

```tsx
          <Link href="/clients" className="text-sm text-gray-600 hover:text-black">
            Clients
          </Link>
          <Link href="/profile" className="text-sm text-gray-600 hover:text-black">
            Profile
          </Link>
          {user.role === 'admin' && (
```

(Everything else in the file stays unchanged.)

- [ ] **Step 5: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors, zero `any`. Route table should include `/profile`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/profile" "app/(app)/users/actions.ts" "app/(app)/layout.tsx"
git commit -m "feat: add employee self-service profile page with change requests"
```

---

### Task 4: Admin employee detail page

**Files:**
- Create: `app/(app)/users/[id]/page.tsx`, `app/(app)/users/[id]/actions.ts`
- Modify: `app/(app)/users/page.tsx` (link each employee's name to their detail page)

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/access`; `createAdminSupabaseClient` from
  `@/lib/supabase/admin`; `updateEmployeeProfileSchema` from `@/lib/validation`.
- Produces: `updateEmployeeProfile(formData)` Server Action.

- [ ] **Step 1: Write the update action**

Create `app/(app)/users/[id]/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateEmployeeProfileSchema } from '@/lib/validation'

export async function updateEmployeeProfile(formData: FormData) {
  await requireAdmin()

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
  })

  if (!parsed.success) {
    redirect(`/users/${formData.get('userId')}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { userId, ...fields } = parsed.data
  const admin = createAdminSupabaseClient()

  const { error } = await admin
    .from('employee_profiles')
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
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    redirect(`/users/${userId}?error=` + encodeURIComponent(error.message))
  }

  revalidatePath(`/users/${userId}`)
  redirect(`/users/${userId}`)
}
```

- [ ] **Step 2: Write the employee detail page**

Create `app/(app)/users/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateEmployeeProfile } from './actions'

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: user } = await admin.from('users').select('id, name, email, role, is_active').eq('id', id).single()

  if (!user) notFound()

  const { data: profile } = await admin
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type'
    )
    .eq('user_id', id)
    .single()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{user.name}</h1>
      <p className="text-sm text-gray-500">
        {user.email} · {user.role} · {user.is_active ? 'Active' : 'Deactivated'}
      </p>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <form action={updateEmployeeProfile} className="grid grid-cols-2 gap-6">
        <input type="hidden" name="userId" value={user.id} />

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-500">Job info</h2>
          <input
            name="designation"
            placeholder="Designation"
            defaultValue={profile?.designation ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="department"
            placeholder="Department"
            defaultValue={profile?.department ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="employmentStartDate"
            type="date"
            defaultValue={profile?.employment_start_date ?? ''}
            className="w-full rounded border px-3 py-2"
          />
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

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-500">Personal info</h2>
          <input
            name="phone"
            placeholder="Phone"
            defaultValue={profile?.phone ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="address"
            placeholder="Address"
            defaultValue={profile?.address ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="emergencyContactName"
            placeholder="Emergency contact name"
            defaultValue={profile?.emergency_contact_name ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="emergencyContactPhone"
            placeholder="Emergency contact phone"
            defaultValue={profile?.emergency_contact_phone ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={profile?.date_of_birth ?? ''}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <button type="submit" className="col-span-2 rounded bg-black py-2 text-white">
          Save
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Link each employee's name to their detail page**

In `app/(app)/users/page.tsx`, add the `Link` import at the top (the file currently has no
`Link` import):

```tsx
import Link from 'next/link'
import { cookies } from 'next/headers'
```

Then find this line in the table body:

```tsx
                  <td className="py-2">{u.name}</td>
```

Change it to:

```tsx
                  <td className="py-2">
                    <Link href={`/users/${u.id}`} className="text-blue-600 hover:underline">
                      {u.name}
                    </Link>
                  </td>
```

Nothing else in `app/(app)/users/page.tsx` changes in this task.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors, zero `any`. Route table should include
`/users/[id]`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/users/[id]" "app/(app)/users/page.tsx"
git commit -m "feat: add admin employee detail page with direct profile editing"
```

---

### Task 5: Admin approval queue

**Files:**
- Create: `app/(app)/users/requests/page.tsx`, `app/(app)/users/requests/actions.ts`
- Modify: `app/(app)/layout.tsx` (add the "Requests" nav link)

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/access`; `createAdminSupabaseClient` from
  `@/lib/supabase/admin`; `reviewProfileRequestSchema` from `@/lib/validation`;
  `EmployeeProfileField` from `@/types/database`.
- Produces: `approveProfileRequest(formData)`, `rejectProfileRequest(formData)` Server
  Actions.

- [ ] **Step 1: Write the approve/reject actions**

Create `app/(app)/users/requests/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { reviewProfileRequestSchema } from '@/lib/validation'
import type { EmployeeProfileField } from '@/types/database'

function buildProfileUpdate(field: EmployeeProfileField, value: string): Record<string, string> {
  switch (field) {
    case 'phone':
      return { phone: value }
    case 'address':
      return { address: value }
    case 'emergency_contact_name':
      return { emergency_contact_name: value }
    case 'emergency_contact_phone':
      return { emergency_contact_phone: value }
    case 'date_of_birth':
      return { date_of_birth: value }
  }
}

export async function approveProfileRequest(formData: FormData) {
  const currentUser = await requireAdmin()

  const parsed = reviewProfileRequestSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/users/requests?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('employee_profile_requests')
    .select('id, user_id, field, status, proposed_value')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/users/requests?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  const { error: profileError } = await admin
    .from('employee_profiles')
    .update({
      ...buildProfileUpdate(request.field, request.proposed_value),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', request.user_id)

  if (profileError) {
    redirect('/users/requests?error=' + encodeURIComponent(profileError.message))
  }

  const { error: requestError } = await admin
    .from('employee_profile_requests')
    .update({ status: 'approved', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', request.id)

  if (requestError) {
    redirect('/users/requests?error=' + encodeURIComponent(requestError.message))
  }

  revalidatePath('/users/requests')
  redirect('/users/requests')
}

export async function rejectProfileRequest(formData: FormData) {
  const currentUser = await requireAdmin()

  const parsed = reviewProfileRequestSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/users/requests?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('employee_profile_requests')
    .select('id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/users/requests?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  const { error } = await admin
    .from('employee_profile_requests')
    .update({ status: 'rejected', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', request.id)

  if (error) {
    redirect('/users/requests?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/users/requests')
  redirect('/users/requests')
}
```

- [ ] **Step 2: Write the approval queue page**

Create `app/(app)/users/requests/page.tsx`:

```tsx
import { requireAdmin } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { approveProfileRequest, rejectProfileRequest } from './actions'
import type { EmployeeProfileField } from '@/types/database'

function currentValueFor(
  profile:
    | {
        phone: string | null
        address: string | null
        emergency_contact_name: string | null
        emergency_contact_phone: string | null
        date_of_birth: string | null
      }
    | undefined,
  field: EmployeeProfileField
): string {
  if (!profile) return '—'
  switch (field) {
    case 'phone':
      return profile.phone ?? '—'
    case 'address':
      return profile.address ?? '—'
    case 'emergency_contact_name':
      return profile.emergency_contact_name ?? '—'
    case 'emergency_contact_phone':
      return profile.emergency_contact_phone ?? '—'
    case 'date_of_birth':
      return profile.date_of_birth ?? '—'
  }
}

export default async function ProfileRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdmin()
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: pendingRequests } = await admin
    .from('employee_profile_requests')
    .select('id, user_id, field, proposed_value, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const pending = pendingRequests ?? []
  const userIds = [...new Set(pending.map((request) => request.user_id))]

  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((user) => [user.id, user.name]))

  const { data: profiles } =
    userIds.length > 0
      ? await admin
          .from('employee_profiles')
          .select('user_id, phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth')
          .in('user_id', userIds)
      : { data: [] }
  const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Pending profile change requests</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {pending.length === 0 ? (
        <p className="text-sm text-gray-500">No pending requests.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((request) => (
            <li key={request.id} className="rounded border p-4">
              <p className="text-sm font-medium">
                {nameById.get(request.user_id) ?? 'Unknown'} — {request.field}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Current: {currentValueFor(profileById.get(request.user_id), request.field)} → Proposed:{' '}
                {request.proposed_value}
              </p>
              <div className="mt-2 flex gap-3">
                <form action={approveProfileRequest}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="text-green-700 underline">
                    Approve
                  </button>
                </form>
                <form action={rejectProfileRequest}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="text-red-600 underline">
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add the nav link**

In `app/(app)/layout.tsx`, the admin-gated block currently reads (after Task 3's edit):

```tsx
          {user.role === 'admin' && (
            <>
              <Link href="/users" className="text-sm text-gray-600 hover:text-black">
                Users
              </Link>
              <Link href="/settings" className="text-sm text-gray-600 hover:text-black">
                Settings
              </Link>
            </>
          )}
```

Change it to add a "Requests" link after "Settings":

```tsx
          {user.role === 'admin' && (
            <>
              <Link href="/users" className="text-sm text-gray-600 hover:text-black">
                Users
              </Link>
              <Link href="/settings" className="text-sm text-gray-600 hover:text-black">
                Settings
              </Link>
              <Link href="/users/requests" className="text-sm text-gray-600 hover:text-black">
                Requests
              </Link>
            </>
          )}
```

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors, zero `any`. Route table should include
`/users/requests`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/users/requests" "app/(app)/layout.tsx"
git commit -m "feat: add admin approval queue for profile change requests"
```

---

### Task 6: End-to-end verification (MANUAL — human ran Task 1's migration first)

**Files:** none (verification only)

- [ ] **Step 1: Manually verify the full flow**

```bash
npm run dev
```

Logged in as the seeded admin:

1. Visit `/profile` — job info shows "—" for every field (blank profile row from the
   migration backfill), personal info form is empty, "My requests" shows "No requests
   yet."
2. Invite a fresh test employee (via `/users`) — confirm they also get a blank
   `employee_profiles` row (check via the Supabase table editor or a throwaway script;
   this proves Task 3's `inviteUser` change works, not just the migration's backfill).
3. Click the test employee's name on `/users` — lands on `/users/[id]`, shows their (empty)
   job and personal info.
4. As admin, fill in their job info (designation, department, start date, employment
   type) and save — confirm it's applied immediately, no approval step.
5. As admin, also directly edit one of their personal fields (e.g. phone) and save —
   confirm it applies immediately too (admin edits never need approval, even for personal
   fields).
6. Sign out, sign in as the test employee (using the temp password from step 2's invite).
   Visit `/profile` — confirm the job info you set in step 4 shows correctly, and the
   personal info form is pre-filled with the phone number from step 5.
7. As the employee, change the phone number and submit — confirm it does NOT apply
   immediately (visit `/profile` again, the old value should still show — this proves the
   approval-gating works, not just admin's direct-edit path). Check "My requests" — the
   new request shows with status "pending".
8. Try submitting a change to the same field (phone) again before it's approved — confirm
   you get the "you already have a pending request for phone" error.
9. Sign out, sign back in as admin. Visit `/users/requests` — confirm the pending phone
   request appears, showing the correct current vs proposed value and the employee's
   name.
10. Click Approve — confirm it disappears from the pending list, and (sign in as the
    employee again, or check via the Supabase table editor) the phone number in
    `employee_profiles` actually changed to the proposed value, and the request's status
    is now "approved" in "My requests".
11. As the employee, submit a change to a different field (e.g. address), then as admin
    Reject it on `/users/requests` — confirm the address in `employee_profiles` did NOT
    change, and the employee's "My requests" shows that request as "rejected".
12. Clean up: delete the test employee (both their `users`/`employee_profiles` rows and
    Supabase Auth account, and any leftover `employee_profile_requests` rows) so the live
    database stays clean.

- [ ] **Step 2: No commit** — this task is verification only, nothing to commit.
