# BYC HRM Recruitment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HR-only Recruitment module under `/hrm/recruitment`: job
openings HR creates and opens/closes, and candidates HR adds to an
opening and moves through a fixed 5-stage pipeline (or rejects).

**Architecture:** Two new tables (`job_openings`, `candidates`, the
latter with a required `opening_id` foreign key — a candidate belongs to
exactly one opening), one new module key (`recruitment`, HR-only by
default), and three page trees (openings list, one opening's candidate
list, one candidate's detail) reusing the existing
`requireModule`/`createAdminSupabaseClient` patterns. Fully isolated from
the existing invite flow — marking a candidate "hired" is a terminal
pipeline status only; `app/(app)/users/actions.ts` is untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres +
service-role client), Tailwind CSS v4, zod. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-hrm-recruitment-design.md`

## Global Constraints

- No automated test suite — `npm run build` succeeding with zero
  TypeScript errors is the acceptance bar for every task.
- Migrations are MANUAL — write the SQL file; running it against
  Supabase is a step the human operator performs by hand in the SQL
  editor.
- This module is HR-only end to end — `requireModule('recruitment')`
  alone is a sufficient gate (no other role has this key enabled by
  default), so no extra per-action role re-check is needed.
- Primary color `#1e293b` (Tailwind `slate-800`), white `rounded-xl`
  cards, `lucide-react` icons — match every other page in this app.
- A candidate belongs to exactly one opening — no many-to-many linking.
- No public application form, no file upload, no interview scheduling,
  no configurable stages, no auto-invite on hire — out of scope per the
  spec.
- Every read of a single row by id must discriminate a genuine "not
  found" (`PGRST116`) from a real query error and throw on the latter —
  do not silently render a 404 for a DB failure (this is an established
  convention already used in `app/hrm/directory/[id]/page.tsx` and
  fixed retroactively in two prior sub-projects after their final
  reviews caught the same mistake; get it right the first time here).

---

### Task 1: Migration + types + validation

**Files:**
- Create: `supabase/migrations/0014_recruitment.sql`
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`
- Modify: `lib/access.ts:57-67`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Module` type includes `'recruitment'`; `moduleKeys`
  includes it; `MODULE_PATHS['recruitment'] = '/hrm/recruitment'`;
  `JobOpeningStatus = 'open' | 'closed'` and `CandidateStage = 'applied'
  | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'` type
  aliases; `Database['public']['Tables']['job_openings']` and
  `['candidates']` row/insert/update shapes; zod schemas
  `createOpeningSchema`, `toggleOpeningStatusSchema`,
  `addCandidateSchema`, `updateCandidateStageSchema`,
  `rejectCandidateSchema`, `updateCandidateNotesSchema` — Tasks 2-4
  import these exact names from `@/lib/validation`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0014_recruitment.sql

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
  check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment'));

insert into public.role_module_access (role, module, enabled) values
  ('hr', 'recruitment', true)
on conflict (role, module) do nothing;

create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

alter table public.job_openings enable row level security;

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references public.job_openings(id),
  name text not null,
  email text not null default '',
  phone text not null default '',
  resume_notes text not null default '',
  stage text not null default 'applied'
    check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  notes text not null default '',
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidates enable row level security;
```

- [ ] **Step 2: Run the migration manually**

By hand in the Supabase SQL editor (no automated migration runner — see
`README.md`). Confirm "Success. No rows returned."

- [ ] **Step 3: Update `types/database.ts`**

Change:
```typescript
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory' | 'leave_attendance' | 'onboarding' | 'offboarding'
```
to:
```typescript
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory' | 'leave_attendance' | 'onboarding' | 'offboarding' | 'recruitment'
```

Add two new type aliases near the other type aliases at the top of the
file (e.g. next to `LeaveRequestStatus`):
```typescript
export type JobOpeningStatus = 'open' | 'closed'
export type CandidateStage = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'
```

Add two new table entries inside `Database['public']['Tables']`:

```typescript
      job_openings: {
        Row: {
          id: string
          title: string
          department: string
          status: JobOpeningStatus
          created_at: string
          created_by: string | null
        }
        Insert: { title: string; department?: string; created_by?: string | null }
        Update: Partial<{ title: string; department: string; status: JobOpeningStatus }>
        Relationships: []
      }
      candidates: {
        Row: {
          id: string
          opening_id: string
          name: string
          email: string
          phone: string
          resume_notes: string
          stage: CandidateStage
          notes: string
          applied_at: string
          updated_at: string
        }
        Insert: { opening_id: string; name: string; email?: string; phone?: string; resume_notes?: string }
        Update: Partial<{ stage: CandidateStage; notes: string; updated_at: string }>
        Relationships: []
      }
```

- [ ] **Step 4: Update `lib/validation.ts`**

Change:
```typescript
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding'] as const
```
to:
```typescript
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment'] as const
```

Append these new schemas at the end of the file:

```typescript
export const candidateStages = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const

export const createOpeningSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  department: z.string().trim().max(200).optional().or(z.literal('')),
})

export const toggleOpeningStatusSchema = z.object({
  openingId: z.string().uuid(),
  status: z.enum(['open', 'closed']),
})

export const addCandidateSchema = z.object({
  openingId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  resumeNotes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const updateCandidateStageSchema = z.object({
  candidateId: z.string().uuid(),
  stage: z.enum(candidateStages),
})

export const rejectCandidateSchema = z.object({
  candidateId: z.string().uuid(),
})

export const updateCandidateNotesSchema = z.object({
  candidateId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
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
  onboarding: '/hrm/onboarding',
  offboarding: '/hrm/offboarding',
  recruitment: '/hrm/recruitment',
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: compiles with zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0014_recruitment.sql types/database.ts lib/validation.ts lib/access.ts
git commit -m "feat: add recruitment module, job_openings and candidates tables"
```

---

### Task 2: Job openings list

**Files:**
- Create: `app/hrm/recruitment/actions.ts`
- Create: `app/hrm/recruitment/page.tsx`

**Interfaces:**
- Consumes: `requireModule('recruitment')` from `@/lib/access` (Task 1);
  `createOpeningSchema`, `toggleOpeningStatusSchema` from
  `@/lib/validation` (Task 1).
- Produces: page links to `/hrm/recruitment/[openingId]` — Task 3 adds
  that page.

- [ ] **Step 1: Create `app/hrm/recruitment/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createOpeningSchema, toggleOpeningStatusSchema } from '@/lib/validation'

export async function createOpening(formData: FormData) {
  const currentUser = await requireModule('recruitment')

  const parsed = createOpeningSchema.safeParse({
    title: formData.get('title'),
    department: formData.get('department'),
  })

  if (!parsed.success) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('job_openings')
    .insert({ title: parsed.data.title, department: parsed.data.department || '', created_by: currentUser.id })
    .select('id')
    .single()

  if (!created) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(error?.message ?? 'Could not create opening'))
  }

  revalidatePath('/hrm/recruitment')
  redirect(`/hrm/recruitment/${created.id}`)
}

export async function toggleOpeningStatus(formData: FormData) {
  await requireModule('recruitment')

  const parsed = toggleOpeningStatusSchema.safeParse({
    openingId: formData.get('openingId'),
    status: formData.get('status'),
  })

  if (!parsed.success) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('job_openings')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.openingId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Opening not found' : error.message
    redirect('/hrm/recruitment?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/recruitment')
  redirect('/hrm/recruitment')
}
```

- [ ] **Step 2: Create `app/hrm/recruitment/page.tsx`**

```typescript
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createOpening, toggleOpeningStatus } from './actions'

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: openings, error: openingsError } = await admin
    .from('job_openings')
    .select('id, title, department, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Recruitment</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={createOpening}
        className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex-1 text-sm text-slate-700">
          Title
          <input
            name="title"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <label className="flex-1 text-sm text-slate-700">
          Department
          <input
            name="department"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Create
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {openingsError ? (
          <p className="p-4 text-sm text-red-700">Could not load job openings</p>
        ) : openings && openings.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {openings.map((opening) => (
              <li key={opening.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <Link
                    href={`/hrm/recruitment/${opening.id}`}
                    className="font-medium text-slate-800 hover:underline"
                  >
                    {opening.title}
                  </Link>
                  <span className="ml-2 text-slate-400">{opening.department || '—'}</span>
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                      opening.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {opening.status}
                  </span>
                </div>
                <form action={toggleOpeningStatus}>
                  <input type="hidden" name="openingId" value={opening.id} />
                  <input type="hidden" name="status" value={opening.status === 'open' ? 'closed' : 'open'} />
                  <button type="submit" className="text-slate-600 underline hover:text-slate-900">
                    {opening.status === 'open' ? 'Close' : 'Reopen'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No job openings yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors. (`/hrm/recruitment/[openingId]` link
exists but the route doesn't yet — that's fine, Next.js doesn't fail the
build over a `<Link>` to a not-yet-existing route.)

- [ ] **Step 4: Commit**

```bash
git add app/hrm/recruitment/actions.ts app/hrm/recruitment/page.tsx
git commit -m "feat: add job openings list"
```

---

### Task 3: Opening detail / candidate list

**Files:**
- Create: `app/hrm/recruitment/[openingId]/actions.ts`
- Create: `app/hrm/recruitment/[openingId]/page.tsx`

**Interfaces:**
- Consumes: `requireModule('recruitment')` from `@/lib/access` (Task 1);
  `addCandidateSchema` from `@/lib/validation` (Task 1); the
  `job_openings` table (Task 1) — this page reads an opening created by
  Task 2's `createOpening`, but does not import any code from Task 2.
- Produces: page links to `/hrm/recruitment/candidates/[id]` — Task 4
  adds that page.

- [ ] **Step 1: Create `app/hrm/recruitment/[openingId]/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addCandidateSchema } from '@/lib/validation'

export async function addCandidate(formData: FormData) {
  await requireModule('recruitment')

  const openingIdRaw = String(formData.get('openingId') ?? '')

  const parsed = addCandidateSchema.safeParse({
    openingId: formData.get('openingId'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    resumeNotes: formData.get('resumeNotes'),
  })

  if (!parsed.success) {
    redirect(`/hrm/recruitment/${openingIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('candidates')
    .insert({
      opening_id: parsed.data.openingId,
      name: parsed.data.name,
      email: parsed.data.email || '',
      phone: parsed.data.phone || '',
      resume_notes: parsed.data.resumeNotes || '',
    })
    .select('id')
    .single()

  if (!created) {
    redirect(
      `/hrm/recruitment/${parsed.data.openingId}?error=` +
        encodeURIComponent(error?.message ?? 'Could not add candidate')
    )
  }

  revalidatePath(`/hrm/recruitment/${parsed.data.openingId}`)
  redirect(`/hrm/recruitment/${parsed.data.openingId}`)
}
```

- [ ] **Step 2: Create `app/hrm/recruitment/[openingId]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addCandidate } from './actions'

const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

export default async function OpeningDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ openingId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { openingId } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: opening, error: openingError } = await admin
    .from('job_openings')
    .select('id, title, department, status')
    .eq('id', openingId)
    .single()

  if (openingError && openingError.code !== 'PGRST116') {
    throw new Error(`Could not load job opening: ${openingError.message}`)
  }

  if (!opening) notFound()

  const { data: candidates, error: candidatesError } = await admin
    .from('candidates')
    .select('id, name, email, stage, applied_at')
    .eq('opening_id', openingId)
    .order('applied_at', { ascending: false })

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/hrm/recruitment" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Recruitment
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{opening.title}</h1>
        <p className="text-sm text-slate-500">
          {opening.department || '—'} · {opening.status}
        </p>
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={addCandidate}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="openingId" value={opening.id} />
        <div className="grid grid-cols-2 gap-3">
          <input
            name="name"
            placeholder="Name"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            name="email"
            placeholder="Email"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            name="phone"
            placeholder="Phone"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            name="resumeNotes"
            placeholder="Resume link or notes"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add candidate
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {candidatesError ? (
          <p className="p-4 text-sm text-red-700">Could not load candidates</p>
        ) : candidates && candidates.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link
                  href={`/hrm/recruitment/candidates/${candidate.id}`}
                  className="font-medium text-slate-800 hover:underline"
                >
                  {candidate.name}
                </Link>
                <span className="text-slate-500">{STAGE_LABELS[candidate.stage]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No candidates yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors. Route list should include
`/hrm/recruitment/[openingId]`.

- [ ] **Step 4: Commit**

```bash
git add app/hrm/recruitment/[openingId]
git commit -m "feat: add opening detail page with candidate list"
```

---

### Task 4: Candidate detail

**Files:**
- Create: `app/hrm/recruitment/candidates/[id]/actions.ts`
- Create: `app/hrm/recruitment/candidates/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireModule('recruitment')` from `@/lib/access` (Task 1);
  `updateCandidateStageSchema`, `rejectCandidateSchema`,
  `updateCandidateNotesSchema` from `@/lib/validation` (Task 1);
  `ConfirmSubmitButton` from `@/app/(app)/confirm-submit-button` (already
  exists); the `candidates`/`job_openings` tables (Task 1) — this page
  reads a candidate created by Task 3's `addCandidate`, but does not
  import any code from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `app/hrm/recruitment/candidates/[id]/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateCandidateStageSchema, rejectCandidateSchema, updateCandidateNotesSchema } from '@/lib/validation'

export async function updateCandidateStage(formData: FormData) {
  await requireModule('recruitment')

  const candidateIdRaw = String(formData.get('candidateId') ?? '')

  const parsed = updateCandidateStageSchema.safeParse({
    candidateId: formData.get('candidateId'),
    stage: formData.get('stage'),
  })

  if (!parsed.success) {
    redirect(
      `/hrm/recruitment/candidates/${candidateIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message)
    )
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('candidates')
    .update({ stage: parsed.data.stage, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.candidateId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Candidate not found' : error.message
    redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
  redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
}

export async function rejectCandidate(formData: FormData) {
  await requireModule('recruitment')

  const parsed = rejectCandidateSchema.safeParse({ candidateId: formData.get('candidateId') })

  if (!parsed.success) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('candidates')
    .update({ stage: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.candidateId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Candidate not found' : error.message
    redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
  redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
}

export async function updateCandidateNotes(formData: FormData) {
  await requireModule('recruitment')

  const candidateIdRaw = String(formData.get('candidateId') ?? '')

  const parsed = updateCandidateNotesSchema.safeParse({
    candidateId: formData.get('candidateId'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(
      `/hrm/recruitment/candidates/${candidateIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message)
    )
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('candidates')
    .update({ notes: parsed.data.notes || '', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.candidateId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Candidate not found' : error.message
    redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
  redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
}
```

- [ ] **Step 2: Create `app/hrm/recruitment/candidates/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import { updateCandidateStage, rejectCandidate, updateCandidateNotes } from './actions'

const STAGES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
] as const

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { id } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: candidate, error: candidateError } = await admin
    .from('candidates')
    .select('*')
    .eq('id', id)
    .single()

  if (candidateError && candidateError.code !== 'PGRST116') {
    throw new Error(`Could not load candidate: ${candidateError.message}`)
  }

  if (!candidate) notFound()

  const { data: opening } = await admin
    .from('job_openings')
    .select('id, title')
    .eq('id', candidate.opening_id)
    .single()

  return (
    <div className="max-w-2xl space-y-4">
      <Link
        href={`/hrm/recruitment/${candidate.opening_id}`}
        className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
      >
        ← Back to {opening?.title ?? 'opening'}
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">{candidate.name}</h1>
      <p className="text-sm text-slate-500">
        {candidate.email || '—'} · {candidate.phone || '—'}
      </p>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500">Stage</h2>
        <p className="mt-1 text-lg font-semibold text-slate-800 capitalize">{candidate.stage}</p>

        {candidate.stage !== 'rejected' && (
          <div className="mt-3 flex items-center gap-3">
            <form action={updateCandidateStage} className="flex items-center gap-2">
              <input type="hidden" name="candidateId" value={candidate.id} />
              <select
                name="stage"
                defaultValue={candidate.stage}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Update stage
              </button>
            </form>
            <form action={rejectCandidate}>
              <input type="hidden" name="candidateId" value={candidate.id} />
              <ConfirmSubmitButton
                confirmMessage="Reject this candidate? This cannot be undone."
                className="text-red-600 underline"
              >
                Reject
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500">Resume / notes</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{candidate.resume_notes || '—'}</p>
      </div>

      <form
        action={updateCandidateNotes}
        className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="candidateId" value={candidate.id} />
        <label className="block text-sm text-slate-700">
          Notes
          <textarea
            name="notes"
            defaultValue={candidate.notes}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save notes
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors. Route list should include
`/hrm/recruitment/candidates/[id]`.

- [ ] **Step 4: Commit**

```bash
git add app/hrm/recruitment/candidates
git commit -m "feat: add candidate detail page with stage/reject/notes"
```

---

### Task 5: Nav update

**Files:**
- Modify: `components/nav-links.tsx`

**Interfaces:**
- Consumes: Tasks 1-4 (the new module key and route tree now exist).
- Produces: nothing (last code task).

- [ ] **Step 1: Update `components/nav-links.tsx`**

Add `Briefcase` to the `lucide-react` import (alongside the existing
icons), and add one new entry to `NAV_ITEMS`, positioned right after the
existing `Offboarding` entry.

Change:
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
  Settings as SettingsIcon,
} from 'lucide-react'
```
to:
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
  Settings as SettingsIcon,
} from 'lucide-react'
```

Change:
```typescript
  { href: '/hrm/offboarding', label: 'Offboarding', icon: UserMinus, module: 'offboarding' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, module: 'settings' },
```
to:
```typescript
  { href: '/hrm/offboarding', label: 'Offboarding', icon: UserMinus, module: 'offboarding' },
  { href: '/hrm/recruitment', label: 'Recruitment', icon: Briefcase, module: 'recruitment' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, module: 'settings' },
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/nav-links.tsx
git commit -m "feat: add Recruitment nav link"
```

---

### Task 6: Manual end-to-end QA

**Files:** none (verification only).

**Interfaces:**
- Consumes: the fully merged feature from Tasks 1-5.
- Produces: nothing.

- [ ] **Step 1: Confirm the migration ran**

In the Supabase SQL editor, confirm `role_module_access` has a row for
`('hr', 'recruitment', true)`, and that `job_openings`/`candidates`
tables exist.

- [ ] **Step 2: Run through the recruitment flow**

Start the dev server (`npm run dev`). Log in as `hr` or `admin`. On
`/hrm/recruitment`, create a job opening. Click into it, add a candidate.
Click into the candidate, move them through each stage in order (Applied
→ Screening → Interview → Offer → Hired) via the stage dropdown, confirm
each save persists on reload. Add a second candidate to the same
opening, reject them, confirm the stage selector disappears once
rejected (only the "Stage: rejected" text remains).

- [ ] **Step 3: Confirm opening open/close**

Close the job opening from the list page, confirm its badge changes and
the "Close"/"Reopen" button toggles. Reopen it.

- [ ] **Step 4: Confirm isolation from the invite flow**

Mark a candidate "Hired" and confirm no row appears in `users` and no
change occurs anywhere on `/users`. Confirm `app/(app)/users/actions.ts`
was never touched by this branch (`git diff master... -- app/\(app\)/users/actions.ts`
shows no output).

- [ ] **Step 5: Confirm the module gate**

In the Supabase SQL editor, temporarily set
`update role_module_access set enabled = false where role = 'hr' and module = 'recruitment';`.
Confirm "Recruitment" disappears from the sidebar for an `hr`-role user
and `/hrm/recruitment` redirects away. Restore the row:
`update role_module_access set enabled = true where role = 'hr' and module = 'recruitment';`.
