# BYC HRM Onboarding/Offboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two small, independent HR-only checklist modules — Onboarding
and Offboarding — under `/hrm/onboarding` and `/hrm/offboarding`, each a
fixed checklist (6 steps / 5 steps) an HR/admin user starts, checks off,
annotates with notes, and marks complete.

**Architecture:** Two new tables using fixed boolean columns (one per
step, matching the existing `hr_config`/`shifts` pattern for small known
sets), two new module keys enabled by default only for `hr`, and two
structurally-identical page trees (list + detail + actions) reusing the
existing `requireModule`/`createAdminSupabaseClient` patterns. Fully
isolated from the existing invite/deactivate flow — no changes to
`app/(app)/users/actions.ts`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres +
service-role client), Tailwind CSS v4, zod. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-30-hrm-onboarding-offboarding-design.md`

## Global Constraints

- No automated test suite — `npm run build` succeeding with zero
  TypeScript errors is the acceptance bar for every task.
- Migrations are MANUAL — write the SQL file; running it against
  Supabase is a step the human operator performs by hand in the SQL
  editor.
- Both modules are HR-only end to end — `requireModule` alone is a
  sufficient gate (unlike Leave/Attendance's `leave_attendance`, no other
  role has these keys enabled by default), so no extra per-action role
  re-check is needed.
- Primary color `#1e293b` (Tailwind `slate-800`), white `rounded-xl`
  cards, `lucide-react` icons — match every other page in this app.
- No employee-facing view, no file upload, no configurable templates —
  out of scope per the spec.

---

### Task 1: Migration + types + validation

**Files:**
- Create: `supabase/migrations/0013_onboarding_offboarding.sql`
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`
- Modify: `lib/access.ts:57-65`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Module` type includes `'onboarding' | 'offboarding'`;
  `moduleKeys` includes both; `MODULE_PATHS['onboarding'] =
  '/hrm/onboarding'`, `MODULE_PATHS['offboarding'] = '/hrm/offboarding'`;
  `Database['public']['Tables']['onboarding_checklists']` and
  `['offboarding_checklists']` row/insert/update shapes; zod schemas
  `startOnboardingSchema`, `updateOnboardingChecklistSchema`,
  `completeOnboardingSchema`, `startOffboardingSchema`,
  `updateOffboardingChecklistSchema`, `completeOffboardingSchema` — Tasks
  2 and 3 import these exact names from `@/lib/validation`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0013_onboarding_offboarding.sql

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
  check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding'));

-- Only 'hr' gets these by default -- this module is HR-only end to end,
-- unlike leave_attendance which every role uses.
insert into public.role_module_access (role, module, enabled) values
  ('hr', 'onboarding', true),
  ('hr', 'offboarding', true)
on conflict (role, module) do nothing;

create table public.onboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  started_at timestamptz not null default now(),
  started_by uuid references public.users(id),
  step_offer_letter_signed boolean not null default false,
  step_id_proof_collected boolean not null default false,
  step_equipment_assigned boolean not null default false,
  step_accounts_provisioned boolean not null default false,
  step_orientation_completed boolean not null default false,
  step_documents_filed boolean not null default false,
  notes text not null default '',
  completed_at timestamptz
);

alter table public.onboarding_checklists enable row level security;

create table public.offboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  started_at timestamptz not null default now(),
  started_by uuid references public.users(id),
  step_resignation_recorded boolean not null default false,
  step_exit_interview_done boolean not null default false,
  step_assets_returned boolean not null default false,
  step_accounts_deprovisioned boolean not null default false,
  step_final_settlement_done boolean not null default false,
  notes text not null default '',
  completed_at timestamptz
);

alter table public.offboarding_checklists enable row level security;
```

- [ ] **Step 2: Run the migration manually**

By hand in the Supabase SQL editor (no automated migration runner — see
`README.md`). Confirm "Success. No rows returned."

- [ ] **Step 3: Update `types/database.ts`**

Change:
```typescript
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory' | 'leave_attendance'
```
to:
```typescript
export type Module = 'dashboard' | 'leads' | 'clients' | 'hr' | 'settings' | 'directory' | 'leave_attendance' | 'onboarding' | 'offboarding'
```

Add two new table entries inside `Database['public']['Tables']`:

```typescript
      onboarding_checklists: {
        Row: {
          id: string
          user_id: string
          started_at: string
          started_by: string | null
          step_offer_letter_signed: boolean
          step_id_proof_collected: boolean
          step_equipment_assigned: boolean
          step_accounts_provisioned: boolean
          step_orientation_completed: boolean
          step_documents_filed: boolean
          notes: string
          completed_at: string | null
        }
        Insert: { user_id: string; started_by?: string | null }
        Update: Partial<{
          step_offer_letter_signed: boolean
          step_id_proof_collected: boolean
          step_equipment_assigned: boolean
          step_accounts_provisioned: boolean
          step_orientation_completed: boolean
          step_documents_filed: boolean
          notes: string
          completed_at: string | null
        }>
        Relationships: []
      }
      offboarding_checklists: {
        Row: {
          id: string
          user_id: string
          started_at: string
          started_by: string | null
          step_resignation_recorded: boolean
          step_exit_interview_done: boolean
          step_assets_returned: boolean
          step_accounts_deprovisioned: boolean
          step_final_settlement_done: boolean
          notes: string
          completed_at: string | null
        }
        Insert: { user_id: string; started_by?: string | null }
        Update: Partial<{
          step_resignation_recorded: boolean
          step_exit_interview_done: boolean
          step_assets_returned: boolean
          step_accounts_deprovisioned: boolean
          step_final_settlement_done: boolean
          notes: string
          completed_at: string | null
        }>
        Relationships: []
      }
```

- [ ] **Step 4: Update `lib/validation.ts`**

Change:
```typescript
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance'] as const
```
to:
```typescript
export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding'] as const
```

Append these new schemas at the end of the file:

```typescript
export const startOnboardingSchema = z.object({
  userId: z.string().uuid(),
})

export const updateOnboardingChecklistSchema = z.object({
  checklistId: z.string().uuid(),
  stepOfferLetterSigned: z.boolean(),
  stepIdProofCollected: z.boolean(),
  stepEquipmentAssigned: z.boolean(),
  stepAccountsProvisioned: z.boolean(),
  stepOrientationCompleted: z.boolean(),
  stepDocumentsFiled: z.boolean(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const completeOnboardingSchema = z.object({
  checklistId: z.string().uuid(),
})

export const startOffboardingSchema = z.object({
  userId: z.string().uuid(),
})

export const updateOffboardingChecklistSchema = z.object({
  checklistId: z.string().uuid(),
  stepResignationRecorded: z.boolean(),
  stepExitInterviewDone: z.boolean(),
  stepAssetsReturned: z.boolean(),
  stepAccountsDeprovisioned: z.boolean(),
  stepFinalSettlementDone: z.boolean(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const completeOffboardingSchema = z.object({
  checklistId: z.string().uuid(),
})
```

- [ ] **Step 5: Update `lib/access.ts`**

In `MODULE_PATHS` (around line 57), add the two new keys:

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
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: compiles with zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0013_onboarding_offboarding.sql types/database.ts lib/validation.ts lib/access.ts
git commit -m "feat: add onboarding/offboarding modules and checklist tables"
```

---

### Task 2: Onboarding module

**Files:**
- Create: `app/hrm/onboarding/actions.ts`
- Create: `app/hrm/onboarding/page.tsx`
- Create: `app/hrm/onboarding/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireModule('onboarding')` from `@/lib/access` (Task 1);
  `startOnboardingSchema`, `updateOnboardingChecklistSchema`,
  `completeOnboardingSchema` from `@/lib/validation` (Task 1);
  `ConfirmSubmitButton` from `@/app/(app)/confirm-submit-button` (already
  exists).
- Produces: nothing consumed by later tasks (Offboarding in Task 3 is a
  structurally parallel but independent module, not a consumer of this
  one).

- [ ] **Step 1: Create `app/hrm/onboarding/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { startOnboardingSchema, updateOnboardingChecklistSchema, completeOnboardingSchema } from '@/lib/validation'

export async function startOnboarding(formData: FormData) {
  const currentUser = await requireModule('onboarding')

  const parsed = startOnboardingSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/hrm/onboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('onboarding_checklists')
    .insert({ user_id: parsed.data.userId, started_by: currentUser.id })
    .select('id')
    .single()

  if (!created) {
    redirect('/hrm/onboarding?error=' + encodeURIComponent(error?.message ?? 'Could not start onboarding'))
  }

  revalidatePath('/hrm/onboarding')
  redirect(`/hrm/onboarding/${created.id}`)
}

export async function updateOnboardingChecklist(formData: FormData) {
  await requireModule('onboarding')

  const checklistIdRaw = String(formData.get('checklistId') ?? '')

  const parsed = updateOnboardingChecklistSchema.safeParse({
    checklistId: formData.get('checklistId'),
    stepOfferLetterSigned: formData.get('stepOfferLetterSigned') === 'on',
    stepIdProofCollected: formData.get('stepIdProofCollected') === 'on',
    stepEquipmentAssigned: formData.get('stepEquipmentAssigned') === 'on',
    stepAccountsProvisioned: formData.get('stepAccountsProvisioned') === 'on',
    stepOrientationCompleted: formData.get('stepOrientationCompleted') === 'on',
    stepDocumentsFiled: formData.get('stepDocumentsFiled') === 'on',
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(`/hrm/onboarding/${checklistIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('onboarding_checklists')
    .update({
      step_offer_letter_signed: parsed.data.stepOfferLetterSigned,
      step_id_proof_collected: parsed.data.stepIdProofCollected,
      step_equipment_assigned: parsed.data.stepEquipmentAssigned,
      step_accounts_provisioned: parsed.data.stepAccountsProvisioned,
      step_orientation_completed: parsed.data.stepOrientationCompleted,
      step_documents_filed: parsed.data.stepDocumentsFiled,
      notes: parsed.data.notes || '',
    })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/onboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/onboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/onboarding/${parsed.data.checklistId}`)
}

export async function completeOnboarding(formData: FormData) {
  await requireModule('onboarding')

  const parsed = completeOnboardingSchema.safeParse({ checklistId: formData.get('checklistId') })

  if (!parsed.success) {
    redirect('/hrm/onboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('onboarding_checklists')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/onboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath('/hrm/onboarding')
  revalidatePath(`/hrm/onboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/onboarding/${parsed.data.checklistId}`)
}
```

- [ ] **Step 2: Create `app/hrm/onboarding/page.tsx`**

```typescript
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { startOnboarding } from './actions'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('onboarding')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: checklists, error: checklistsError } = await admin
    .from('onboarding_checklists')
    .select('id, user_id, started_at, completed_at')
    .order('started_at', { ascending: false })

  const { data: activeUsers, error: usersError } = await admin
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const checklistUserIds = [...new Set((checklists ?? []).map((c) => c.user_id))]
  const { data: checklistUsers } =
    checklistUserIds.length > 0
      ? await admin.from('users').select('id, name').in('id', checklistUserIds)
      : { data: [] }
  const nameById = new Map((checklistUsers ?? []).map((u) => [u.id, u.name]))

  const inProgressUserIds = new Set((checklists ?? []).filter((c) => !c.completed_at).map((c) => c.user_id))
  const availableUsers = (activeUsers ?? []).filter((u) => !inProgressUserIds.has(u.id))

  const inProgress = (checklists ?? []).filter((c) => !c.completed_at)
  const completed = (checklists ?? []).filter((c) => c.completed_at)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Onboarding</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={startOnboarding}
        className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex-1 text-sm text-slate-700">
          Start onboarding for
          <select
            name="userId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="" disabled>
              Select an employee
            </option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Start
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">In progress</h2>
        {checklistsError || usersError ? (
          <p className="p-4 text-sm text-red-700">Could not load onboarding checklists</p>
        ) : inProgress.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No onboarding in progress.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {inProgress.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/hrm/onboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                  {nameById.get(c.user_id) ?? 'Unknown'}
                </Link>
                <span className="ml-2 text-slate-400">started {c.started_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {completed.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">Completed</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {completed.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/hrm/onboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                  {nameById.get(c.user_id) ?? 'Unknown'}
                </Link>
                <span className="ml-2 text-slate-400">completed {c.completed_at!.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `app/hrm/onboarding/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import { updateOnboardingChecklist, completeOnboarding } from '../actions'

const STEPS = [
  { key: 'stepOfferLetterSigned', column: 'step_offer_letter_signed', label: 'Offer letter signed' },
  { key: 'stepIdProofCollected', column: 'step_id_proof_collected', label: 'ID/document proof collected' },
  { key: 'stepEquipmentAssigned', column: 'step_equipment_assigned', label: 'Equipment/laptop assigned' },
  {
    key: 'stepAccountsProvisioned',
    column: 'step_accounts_provisioned',
    label: 'System accounts provisioned (email, tools)',
  },
  { key: 'stepOrientationCompleted', column: 'step_orientation_completed', label: 'HR orientation completed' },
  { key: 'stepDocumentsFiled', column: 'step_documents_filed', label: 'Documents filed / paperwork complete' },
] as const

export default async function OnboardingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('onboarding')
  const { id } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: checklist } = await admin.from('onboarding_checklists').select('*').eq('id', id).single()

  if (!checklist) notFound()

  const { data: employee } = await admin.from('users').select('id, name').eq('id', checklist.user_id).single()

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/hrm/onboarding" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Onboarding
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">{employee?.name ?? 'Unknown'}</h1>
      <p className="text-sm text-slate-500">
        Started {checklist.started_at.slice(0, 10)}
        {checklist.completed_at && <> · Completed {checklist.completed_at.slice(0, 10)}</>}
      </p>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={updateOnboardingChecklist}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="checklistId" value={checklist.id} />
        <div className="space-y-2">
          {STEPS.map((step) => (
            <label key={step.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name={step.key} defaultChecked={checklist[step.column]} />
              {step.label}
            </label>
          ))}
        </div>
        <label className="block text-sm text-slate-700">
          Notes
          <textarea
            name="notes"
            defaultValue={checklist.notes}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save
        </button>
      </form>

      {!checklist.completed_at && (
        <form action={completeOnboarding}>
          <input type="hidden" name="checklistId" value={checklist.id} />
          <ConfirmSubmitButton
            confirmMessage="Mark onboarding complete? This cannot be undone."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Mark complete
          </ConfirmSubmitButton>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors. Route list should include `/hrm/onboarding` and `/hrm/onboarding/[id]`.

- [ ] **Step 5: Commit**

```bash
git add app/hrm/onboarding
git commit -m "feat: add onboarding checklist module"
```

---

### Task 3: Offboarding module

**Files:**
- Create: `app/hrm/offboarding/actions.ts`
- Create: `app/hrm/offboarding/page.tsx`
- Create: `app/hrm/offboarding/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireModule('offboarding')` from `@/lib/access` (Task 1);
  `startOffboardingSchema`, `updateOffboardingChecklistSchema`,
  `completeOffboardingSchema` from `@/lib/validation` (Task 1);
  `ConfirmSubmitButton` from `@/app/(app)/confirm-submit-button` (already
  exists).
- Produces: nothing consumed by later tasks.

This module is structurally identical to Task 2's Onboarding module —
same 3-file shape, same action/page pattern — with a different table
name, module key, route prefix, and step list (5 steps instead of 6, no
"employment start" framing since this is an exit process).

- [ ] **Step 1: Create `app/hrm/offboarding/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  startOffboardingSchema,
  updateOffboardingChecklistSchema,
  completeOffboardingSchema,
} from '@/lib/validation'

export async function startOffboarding(formData: FormData) {
  const currentUser = await requireModule('offboarding')

  const parsed = startOffboardingSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/hrm/offboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('offboarding_checklists')
    .insert({ user_id: parsed.data.userId, started_by: currentUser.id })
    .select('id')
    .single()

  if (!created) {
    redirect('/hrm/offboarding?error=' + encodeURIComponent(error?.message ?? 'Could not start offboarding'))
  }

  revalidatePath('/hrm/offboarding')
  redirect(`/hrm/offboarding/${created.id}`)
}

export async function updateOffboardingChecklist(formData: FormData) {
  await requireModule('offboarding')

  const checklistIdRaw = String(formData.get('checklistId') ?? '')

  const parsed = updateOffboardingChecklistSchema.safeParse({
    checklistId: formData.get('checklistId'),
    stepResignationRecorded: formData.get('stepResignationRecorded') === 'on',
    stepExitInterviewDone: formData.get('stepExitInterviewDone') === 'on',
    stepAssetsReturned: formData.get('stepAssetsReturned') === 'on',
    stepAccountsDeprovisioned: formData.get('stepAccountsDeprovisioned') === 'on',
    stepFinalSettlementDone: formData.get('stepFinalSettlementDone') === 'on',
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(`/hrm/offboarding/${checklistIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('offboarding_checklists')
    .update({
      step_resignation_recorded: parsed.data.stepResignationRecorded,
      step_exit_interview_done: parsed.data.stepExitInterviewDone,
      step_assets_returned: parsed.data.stepAssetsReturned,
      step_accounts_deprovisioned: parsed.data.stepAccountsDeprovisioned,
      step_final_settlement_done: parsed.data.stepFinalSettlementDone,
      notes: parsed.data.notes || '',
    })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/offboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/offboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/offboarding/${parsed.data.checklistId}`)
}

export async function completeOffboarding(formData: FormData) {
  await requireModule('offboarding')

  const parsed = completeOffboardingSchema.safeParse({ checklistId: formData.get('checklistId') })

  if (!parsed.success) {
    redirect('/hrm/offboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('offboarding_checklists')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/offboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath('/hrm/offboarding')
  revalidatePath(`/hrm/offboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/offboarding/${parsed.data.checklistId}`)
}
```

- [ ] **Step 2: Create `app/hrm/offboarding/page.tsx`**

```typescript
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { startOffboarding } from './actions'

export default async function OffboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('offboarding')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: checklists, error: checklistsError } = await admin
    .from('offboarding_checklists')
    .select('id, user_id, started_at, completed_at')
    .order('started_at', { ascending: false })

  const { data: activeUsers, error: usersError } = await admin
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const checklistUserIds = [...new Set((checklists ?? []).map((c) => c.user_id))]
  const { data: checklistUsers } =
    checklistUserIds.length > 0
      ? await admin.from('users').select('id, name').in('id', checklistUserIds)
      : { data: [] }
  const nameById = new Map((checklistUsers ?? []).map((u) => [u.id, u.name]))

  const inProgressUserIds = new Set((checklists ?? []).filter((c) => !c.completed_at).map((c) => c.user_id))
  const availableUsers = (activeUsers ?? []).filter((u) => !inProgressUserIds.has(u.id))

  const inProgress = (checklists ?? []).filter((c) => !c.completed_at)
  const completed = (checklists ?? []).filter((c) => c.completed_at)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Offboarding</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={startOffboarding}
        className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex-1 text-sm text-slate-700">
          Start offboarding for
          <select
            name="userId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="" disabled>
              Select an employee
            </option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Start
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">In progress</h2>
        {checklistsError || usersError ? (
          <p className="p-4 text-sm text-red-700">Could not load offboarding checklists</p>
        ) : inProgress.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No offboarding in progress.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {inProgress.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/hrm/offboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                  {nameById.get(c.user_id) ?? 'Unknown'}
                </Link>
                <span className="ml-2 text-slate-400">started {c.started_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {completed.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">Completed</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {completed.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/hrm/offboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                  {nameById.get(c.user_id) ?? 'Unknown'}
                </Link>
                <span className="ml-2 text-slate-400">completed {c.completed_at!.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `app/hrm/offboarding/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import { updateOffboardingChecklist, completeOffboarding } from '../actions'

const STEPS = [
  { key: 'stepResignationRecorded', column: 'step_resignation_recorded', label: 'Resignation/termination recorded' },
  { key: 'stepExitInterviewDone', column: 'step_exit_interview_done', label: 'Exit interview done' },
  { key: 'stepAssetsReturned', column: 'step_assets_returned', label: 'Assets returned' },
  {
    key: 'stepAccountsDeprovisioned',
    column: 'step_accounts_deprovisioned',
    label: 'System accounts deprovisioned',
  },
  { key: 'stepFinalSettlementDone', column: 'step_final_settlement_done', label: 'Final settlement done' },
] as const

export default async function OffboardingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('offboarding')
  const { id } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: checklist } = await admin.from('offboarding_checklists').select('*').eq('id', id).single()

  if (!checklist) notFound()

  const { data: employee } = await admin.from('users').select('id, name').eq('id', checklist.user_id).single()

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/hrm/offboarding" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Offboarding
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">{employee?.name ?? 'Unknown'}</h1>
      <p className="text-sm text-slate-500">
        Started {checklist.started_at.slice(0, 10)}
        {checklist.completed_at && <> · Completed {checklist.completed_at.slice(0, 10)}</>}
      </p>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={updateOffboardingChecklist}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="checklistId" value={checklist.id} />
        <div className="space-y-2">
          {STEPS.map((step) => (
            <label key={step.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name={step.key} defaultChecked={checklist[step.column]} />
              {step.label}
            </label>
          ))}
        </div>
        <label className="block text-sm text-slate-700">
          Notes
          <textarea
            name="notes"
            defaultValue={checklist.notes}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save
        </button>
      </form>

      {!checklist.completed_at && (
        <form action={completeOffboarding}>
          <input type="hidden" name="checklistId" value={checklist.id} />
          <ConfirmSubmitButton
            confirmMessage="Mark offboarding complete? This cannot be undone."
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Mark complete
          </ConfirmSubmitButton>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors. Route list should include `/hrm/offboarding` and `/hrm/offboarding/[id]`.

- [ ] **Step 5: Commit**

```bash
git add app/hrm/offboarding
git commit -m "feat: add offboarding checklist module"
```

---

### Task 4: Nav update

**Files:**
- Modify: `components/nav-links.tsx`

**Interfaces:**
- Consumes: Tasks 1-3 (the two new module keys and route trees now
  exist).
- Produces: nothing (last code task).

- [ ] **Step 1: Update `components/nav-links.tsx`**

Add `UserPlus` and `UserMinus` to the `lucide-react` import (alongside
the existing icons), and add two new entries to `NAV_ITEMS`, positioned
right after the existing `HR` entry:

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
  Settings as SettingsIcon,
} from 'lucide-react'
```

Change:
```typescript
  { href: '/users', label: 'HR', icon: ShieldCheck, module: 'hr' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, module: 'settings' },
```
to:
```typescript
  { href: '/users', label: 'HR', icon: ShieldCheck, module: 'hr' },
  { href: '/hrm/onboarding', label: 'Onboarding', icon: UserPlus, module: 'onboarding' },
  { href: '/hrm/offboarding', label: 'Offboarding', icon: UserMinus, module: 'offboarding' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, module: 'settings' },
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/nav-links.tsx
git commit -m "feat: add Onboarding/Offboarding nav links"
```

---

### Task 5: Manual end-to-end QA

**Files:** none (verification only).

**Interfaces:**
- Consumes: the fully merged feature from Tasks 1-4.
- Produces: nothing.

- [ ] **Step 1: Confirm the migration ran**

In the Supabase SQL editor, confirm `role_module_access` has rows for
`('hr', 'onboarding', true)` and `('hr', 'offboarding', true)`, and that
`onboarding_checklists`/`offboarding_checklists` tables exist.

- [ ] **Step 2: Run through the onboarding flow**

Start the dev server (`npm run dev`). Log in as `hr` or `admin`. On
`/hrm/onboarding`, start a checklist for an active employee, confirm they
disappear from the "Start" picker while it's incomplete. Check off a few
steps, add notes, save — confirm the checkboxes and notes persist on
reload. Click "Mark complete", confirm it moves to the "Completed"
section and the employee reappears in the "Start" picker.

- [ ] **Step 3: Run through the offboarding flow**

Same sequence on `/hrm/offboarding` with its 5 steps.

- [ ] **Step 4: Confirm isolation from existing flows**

Invite a new user via `/users` and confirm no onboarding checklist is
auto-created. Deactivate a user via `/users` and confirm no offboarding
checklist is auto-created.

- [ ] **Step 5: Confirm the module gates independently**

In the Supabase SQL editor, temporarily set
`update role_module_access set enabled = false where role = 'hr' and module = 'onboarding';`.
Confirm "Onboarding" disappears from the sidebar for an `hr`-role user
while "Offboarding" still shows, and `/hrm/onboarding` redirects away.
Restore the row:
`update role_module_access set enabled = true where role = 'hr' and module = 'onboarding';`.
Confirm a plain `employee`-role user never sees either link (neither
module is enabled for `employee` by default).
