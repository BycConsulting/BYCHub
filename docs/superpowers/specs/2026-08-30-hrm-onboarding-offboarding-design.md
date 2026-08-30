# BYC HRM — Onboarding/Offboarding — Design Spec

**Date:** 2026-08-30
**Status:** Approved for planning
**Third sub-project of BYC HRM.** Roadmap: Foundation → Leave/Attendance →
**Onboarding/Offboarding** → Recruitment → Performance Management → Asset
Management → Helpdesk → Payroll.

## Context

The first two sub-projects (Foundation, Leave/Attendance) each ported and
extended functionality that already existed somewhere in BYC Hub. This one
is genuinely new: today, the employee lifecycle is just invite (`/users`
creates an auth user + `users` row), profile fill-in
(`/users/[id]` edits `employee_profiles`), and deactivate (`/users`, with
owned-record reassignment). There is no structured onboarding checklist,
no document/paperwork tracking, no IT/equipment handoff tracking, and no
structured offboarding process at all — an employee is either active or
deactivated, with nothing in between.

This sub-project adds two small, independent HR-only checklist modules —
Onboarding and Offboarding — inspired by Horilla's feature scope (the
original reference product for this whole BYC HRM project) but built as
our own code, matching the module-gated, service-role-admin-client
architecture already established by Foundation and Leave/Attendance.

## Scope of this sub-project

- `/hrm/onboarding`: HR starts a fixed onboarding checklist for any active
  employee who doesn't have one yet, checks off steps as they're
  completed, adds free-text notes, and marks the checklist complete.
- `/hrm/offboarding`: identical shape, a separate fixed checklist, for
  employees who are leaving.
- Two new module keys (`onboarding`, `offboarding`), two new tables, no
  changes to any existing invite/profile/deactivate code.

## Decisions from brainstorming

- **Fixed checklist, not configurable templates.** One built-in list of
  steps per process (below) — no template-editor UI, no per-hire
  customization. If a future sub-project needs configurable templates,
  that's a redesign of this one, not a v1 requirement.
- **HR-only, both ends.** Every step is checked off by HR/admin, not the
  employee. No employee-facing view, no self-service, no file upload —
  keeps this sub-project's surface area small and avoids introducing
  Supabase Storage as a new dependency.
- **Manually triggered, fully independent of existing flows.** Starting
  onboarding/offboarding is a deliberate HR action from the new module's
  own page — inviting a user via `/users` does NOT auto-create an
  onboarding checklist, and deactivating a user does NOT auto-create an
  offboarding checklist. `app/(app)/users/actions.ts` (`inviteUser`,
  `deactivateUser`) is untouched by this sub-project. This means HR could
  in principle deactivate someone without ever starting offboarding, or
  start offboarding and never deactivate — that's an accepted tradeoff for
  keeping this module fully isolated from already-shipped, tested code;
  a future sub-project can wire them together if that gap proves painful
  in practice.
- **Fixed boolean columns, not a generic checklist-items table.** Since
  the step list is fixed and small (5-6 steps, known at build time), each
  checklist is one row with one boolean column per step — the same
  pattern already used twice in this codebase for fixed small sets
  (`hr_config`'s `working_monday`..`working_saturday`, `shifts`'
  `working_monday`..`working_saturday`). This avoids a join and a second
  table for what is, structurally, a fixed record shape. If steps ever
  need to become configurable, that's a genuine schema redesign for a
  later sub-project, not a small addition.
- **Two separate tables and two separate module keys**, not one shared
  "lifecycle" concept — onboarding and offboarding are conceptually
  distinct processes that may evolve independently (e.g. offboarding may
  later integrate with the future Assets module for real asset-return
  tracking), and a role might plausibly have one enabled without the
  other (e.g. a hiring coordinator with `onboarding` but not
  `offboarding`).

## Onboarding steps (fixed)

1. Offer letter signed
2. ID/document proof collected
3. Equipment/laptop assigned
4. System accounts provisioned (email, tools)
5. HR orientation completed
6. Documents filed / paperwork complete

## Offboarding steps (fixed)

1. Resignation/termination recorded
2. Exit interview done
3. Assets returned
4. System accounts deprovisioned
5. Final settlement done

## Architecture

```
app/hrm/
  onboarding/
    page.tsx       list: in-progress + completed checklists, "Start
                    onboarding" picker (active employees with no checklist
                    yet)
    [id]/
      page.tsx      one checklist: 6 step checkboxes, notes field, "Mark
                    complete" button
      actions.ts    startOnboarding, toggleOnboardingStep,
                    updateOnboardingNotes, completeOnboarding
  offboarding/
    page.tsx        identical shape
    [id]/
      page.tsx
      actions.ts    startOffboarding, toggleOffboardingStep,
                    updateOffboardingNotes, completeOffboarding
supabase/migrations/
  0013_onboarding_offboarding.sql   widens role_module_access CHECK to add
                                    'onboarding' and 'offboarding', grants
                                    both to 'hr' by default (not
                                    'employee' -- this whole module is
                                    HR-only, so there is no reason for an
                                    employee-role user to have it enabled),
                                    creates the two checklist tables
```

`components/nav-links.tsx`'s `NAV_ITEMS` gains two new entries
(`Onboarding` → `/hrm/onboarding`, module `'onboarding'`; `Offboarding` →
`/hrm/offboarding`, module `'offboarding'`), positioned next to the
existing `HR` entry.

## Data model

```sql
-- Widen role_module_access.module's CHECK constraint (same lookup-by-
-- definition pattern as every prior module-key migration).
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

No `unique` constraint on `user_id` in either table — an employee could
in principle be offboarded, rehired, and offboarded again; the "Start"
picker on each list page simply excludes employees who already have an
**incomplete** (`completed_at is null`) checklist of that type, not
employees who have ever had one.

Both tables get RLS enabled with zero `authenticated` policies (same
lockdown pattern as `role_module_access`, `holidays`, `shifts`) — read
and written exclusively through the service-role client inside
`requireModule`-gated Server Components/Actions.

## Access control

- `requireModule('onboarding')` / `requireModule('offboarding')` gate
  their respective route trees. Since only `hr` (and `admin`, which
  bypasses the module matrix entirely per the existing pattern) has
  either key enabled by default, there is no "module enabled for
  everyone" case to additionally re-check inside Server Actions this
  time — unlike `leave_attendance`, which `employee` also has. HR/admin
  is therefore already the full set of people who can reach these pages
  at all. No extra per-action role check is needed beyond the module
  gate — this is a simpler access model than Leave/Attendance's, and
  intentionally so, since nothing here is ever employee-visible.
- All reads/writes use `createAdminSupabaseClient()` with explicit column
  lists.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision
(no automated test suite): start an onboarding checklist for an active
employee with none, confirm they no longer appear in the "Start" picker
while it's incomplete; check off each of the 6 steps individually, add
notes, mark complete; confirm a completed checklist still shows in the
list (in a "completed" section) and the same employee reappears in the
"Start" picker (since completion doesn't block starting a new one);
repeat for offboarding's 5 steps; confirm the module gate hides each nav
link independently when only one of the two keys is enabled for a role
(live-toggle test via `role_module_access`); confirm neither `inviteUser`
nor `deactivateUser` on `/users` is affected in any way (no new checklist
rows appear as a side effect of those actions).

## Out of scope for this sub-project

- Configurable checklist templates.
- Employee-facing self-service steps or views.
- File/document upload for any step.
- Real asset-inventory tracking for "assets returned" (that's the future
  Assets Management sub-project) — this is a single checkbox here.
- Automatically linking onboarding/offboarding to the invite/deactivate
  actions.
- Recruitment, performance, assets, helpdesk, payroll — each its own
  future sub-project.
