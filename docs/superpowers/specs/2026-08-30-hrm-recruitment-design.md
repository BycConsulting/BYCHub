# BYC HRM — Recruitment — Design Spec

**Date:** 2026-08-30
**Status:** Approved for planning
**Fourth sub-project of BYC HRM.** Roadmap: Foundation → Leave/Attendance →
Onboarding/Offboarding → **Recruitment** → Performance Management → Asset
Management → Helpdesk → Payroll.

## Context

Today, employees only enter the system via HR's manual invite on `/users`
(name, email, role — creates an auth user directly). There is no job
posting concept, no candidate/applicant tracking, and no pipeline between
"someone we're considering" and "someone with an account." This
sub-project adds that missing middle: HR can track open roles and the
candidates moving through them, up to the point of hiring — where the
existing `/users` invite flow takes over, unchanged.

This was flagged during brainstorming as the sub-project most likely to
need a genuinely new kind of surface (a public, unauthenticated
application form, since every module built so far sits entirely behind
the existing internal login). That path was explicitly declined for v1:
candidates are entered by HR, not by the candidates themselves. If a
public apply form is wanted later, it is a new sub-project built on top
of this one's `candidates` table, not a redesign of it.

## Scope of this sub-project

- `/hrm/recruitment`: list of job openings, create new ones, toggle
  open/closed.
- `/hrm/recruitment/[openingId]`: candidates for one opening, add a new
  candidate.
- `/hrm/recruitment/candidates/[id]`: one candidate's detail — move
  between 5 fixed pipeline stages or reject, edit notes.
- One new module key (`recruitment`), HR-only by default, two new tables.

## Decisions from brainstorming

- **HR enters candidates manually — no public application form.** Stays
  entirely behind the existing internal login, consistent with every
  module built so far. No new unauthenticated surface, no spam/rate-limit
  concerns, no file upload, no Supabase Storage dependency.
- **Job openings are a real entity, not a free-text field.** HR creates
  an opening (title, department, open/closed status) before adding
  candidates to it. This lets HR see "who's in the pipeline for this
  role" and close a role once filled. A candidate belongs to exactly one
  opening (`opening_id`, not a many-to-many join) — applying to a second
  role later means a new candidate record, not linking one candidate to
  two openings. This is a deliberate simplification: real-world
  candidates sometimes apply to multiple roles, but modeling that
  correctly needs a join table and re-litigates which opening's pipeline
  "owns" the candidate's stage, which is unwarranted complexity for a
  first version with no data yet to prove the need.
- **Fixed 5-stage pipeline, no configurable stages.** `applied` →
  `screening` → `interview` → `offer` → `hired`, plus a `rejected` status
  reachable from any of the first four stages. No interview date/time
  tracking, no interviewer assignment — HR moves a candidate forward with
  a plain stage selector. If richer interview scheduling is needed later,
  that is a refinement to this sub-project's `candidates` table
  (`ALTER TABLE ... ADD COLUMN`), not a rebuild.
- **Hiring never touches the existing invite flow.** Marking a candidate
  `hired` is a terminal pipeline status, nothing more. HR still creates
  the actual employee account via the existing `/users` invite flow
  separately and manually. `app/(app)/users/actions.ts` (`inviteUser`) is
  untouched by this sub-project — same isolation principle already used
  by Onboarding/Offboarding (which never auto-wired into invite/
  deactivate either).
- **One module key (`recruitment`)**, not two — job openings and
  candidates are two views of one cohesive process (you can't meaningfully
  see a candidate without the opening they belong to), unlike Onboarding/
  Offboarding, which are two genuinely independent processes. HR-only by
  default in the migration, same access-control shape as Onboarding/
  Offboarding: `requireModule('recruitment')` alone is a sufficient gate
  (no other role has this key enabled by default), so no extra per-action
  role re-check is needed.

## Architecture

```
app/hrm/recruitment/
  page.tsx                     job openings list, create-opening form,
                                open/close toggle
  actions.ts                   createOpening, toggleOpeningStatus
  [openingId]/
    page.tsx                   candidates for this opening, add-candidate
                                form
    actions.ts                 addCandidate
  candidates/
    [id]/
      page.tsx                 one candidate: stage selector, reject
                                button, notes field
      actions.ts               updateCandidateStage, rejectCandidate,
                                updateCandidateNotes
supabase/migrations/
  0014_recruitment.sql          widens role_module_access CHECK to add
                                 'recruitment', grants it to 'hr' by
                                 default, creates job_openings and
                                 candidates tables
```

`components/nav-links.tsx`'s `NAV_ITEMS` gains one new entry
(`Recruitment` → `/hrm/recruitment`, module `'recruitment'`), positioned
next to the existing `Offboarding` entry.

## Data model

```sql
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

Both tables get RLS enabled with zero `authenticated` policies (same
lockdown pattern as every prior module's tables) — read and written
exclusively through the service-role client inside `requireModule`-gated
Server Components/Actions.

## Access control

- `requireModule('recruitment')` gates every route under
  `/hrm/recruitment`. As with Onboarding/Offboarding, only `hr` (and
  `admin`, which bypasses the module matrix) has this key enabled by
  default, so the module gate alone is sufficient — no extra per-action
  role check.
- All reads/writes use `createAdminSupabaseClient()` with explicit column
  lists.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision
(no automated test suite): create a job opening, confirm it appears as
open; add a candidate to it; move the candidate through each stage in
order (applied → screening → interview → offer → hired); confirm
"reject" works from an earlier stage and the candidate shows as rejected;
close the job opening and confirm it's visually distinguished from open
ones on the list page; confirm marking a candidate "hired" does not
create any row in `users` or affect `/users` in any way; confirm the
module gate hides the nav link and redirects away when `recruitment` is
disabled for `hr` (live-toggle test via `role_module_access`).

## Out of scope for this sub-project

- Public/unauthenticated application form.
- Resume file upload (Supabase Storage).
- Interview date/time scheduling, interviewer assignment.
- Configurable pipeline stages.
- Auto-creating the employee account when a candidate is marked hired.
- A candidate applying to more than one opening.
- Performance, assets, helpdesk, payroll — each its own future
  sub-project.
