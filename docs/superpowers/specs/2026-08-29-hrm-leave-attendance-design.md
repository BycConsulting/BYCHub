# BYC HRM — Leave/Attendance — Design Spec

**Date:** 2026-08-29
**Status:** Approved for planning
**Second sub-project of BYC HRM.** Roadmap: Foundation → **Leave/Attendance** →
Onboarding/Offboarding → Recruitment → Performance Management → Asset
Management → Helpdesk → Payroll.

## Context

Foundation shipped auth + a read-only company directory under `/hrm`.
Midway through Foundation's rollout, BYC HRM was folded from a separate
app/deployment into this same repo (see `app/hrm/*`, merged in
[BYCHub#8](https://github.com/BycConsulting/BYCHub/pull/8)) — one Vercel
project, one URL, shared `AppShell`/`lib/access.ts`. This sub-project is the
first one built entirely inside that merged shape.

Today, Leave & WFH and Attendance already exist as plain, always-visible
pages (`/leave`, `/attendance`, plus HR's `/users/leave-requests` and
`/users/attendance-records`) — no module gate, built and refined over
several earlier sub-projects (`2026-08-22-leave-wfh-requests-design.md`,
`2026-08-23-manager-routed-leave-approval-design.md`,
`2026-08-23-attendance-design.md`). Their core logic (balance calculation,
manager-routed approval, IP-allowlisted check-in/out, HR corrections) is
correct and stays as-is. This sub-project moves that functionality under
`/hrm` (matching Foundation's sidebar/module-gated pattern) and adds the
feature-scope Horilla was originally chosen as a reference for: a leave
calendar, a company holiday calendar, richer HR-side attendance
reporting/export, and shift assignment — then retires the old pages.

## Scope of this sub-project

- Port existing Leave & WFH and Attendance functionality (requests,
  balances, manager approval, check-in/out, HR corrections) to
  `/hrm/leave` and `/hrm/attendance`, now behind a real module gate.
- Add: leave calendar view, HR-managed holiday calendar (display-only,
  does not affect balance math), HR attendance reports with date-range
  filter + CSV export, and shift template assignment (informational only
  — no attendance-validation enforcement).
- Delete `/leave`, `/attendance`, `/users/leave-requests`,
  `/users/attendance-records` once the new pages are verified working.

## Decisions from brainstorming

- **New module key: `leave_attendance`.** Gates both `/hrm/leave` and
  `/hrm/attendance` (and their sub-pages) — one key, several routes,
  same pattern as `hr` already gating `/users` + its four sub-pages.
  Enabled by default for both `hr` and `employee` roles in the migration,
  matching today's always-visible behavior (no regression: everyone who
  can see `/leave` and `/attendance` today keeps access).
- **Holidays are additive and display-only.** A new `holidays` table
  (HR-managed) feeds the leave calendar and the holiday-management page.
  They are never subtracted from leave-day counts — confirmed explicitly:
  a holiday falling inside an approved leave range still counts as a used
  leave day, exactly like today. `computeBalance`/`dayCount` in
  `lib/leave.ts` are untouched.
- **Shifts are informational, not enforced.** A new `shifts` table (named
  templates: start time, end time, working days) and a nullable
  `employee_profiles.shift_id`. Unassigned employees keep using the
  existing global `hr_config` working-days/hours — shifts never become a
  hard requirement. No late-checkin flags, no per-shift attendance
  validation in this sub-project; shifts exist purely so the team view and
  the new attendance reports can group/filter by shift.
- **Retire old pages immediately, same PR.** No parallel-running period.
  `/leave`, `/attendance`, `/users/leave-requests`,
  `/users/attendance-records` and their route folders are deleted once
  the new `/hrm/leave` and `/hrm/attendance` pages are verified working
  end-to-end. Sidebar links (`components/nav-links.tsx`) repoint to the
  new routes.
- **CSV export via a Route Handler**, not a client library — the export
  page's "Download CSV" link hits a `GET` Route Handler
  (`app/hrm/attendance/reports/export/route.ts`) that re-runs the same
  `requireModule('leave_attendance')` gate, queries the same date range,
  builds a CSV string by hand (no new dependency), and returns it with
  `Content-Disposition: attachment`.

## Architecture

```
app/hrm/
  leave/
    page.tsx                 requests + balances (ported from app/(app)/leave)
    calendar/page.tsx         NEW: month grid, approved leave + holidays
    holidays/
      page.tsx                NEW: HR-only holiday list/add/delete
      actions.ts
    actions.ts                ported from app/(app)/leave/actions.ts
    team-actions.ts           ported from app/(app)/leave/team-actions.ts
  attendance/
    page.tsx                  check-in/out + history (ported)
    actions.ts                ported from app/(app)/attendance/actions.ts
    team/page.tsx              NEW: manager's team-today view (ported content
                                from the old /attendance page's team section)
                                + shift column
    reports/
      page.tsx                 NEW: HR-only, date-range filter, per-employee
                                summary
      export/route.ts          NEW: CSV Route Handler
    shifts/
      page.tsx                 NEW: HR-only, define shifts + assign to
                                employees
      actions.ts
lib/
  leave.ts                    unchanged (allocationForType, computeBalance,
                                dayCount, LEAVE_TYPE_LABELS)
  attendance.ts                unchanged (formatIstTime, hoursWorked,
                                todayDate, utcIsoToIstWallClock) + new
                                csvForAttendanceRecords() helper
supabase/migrations/
  000X_leave_attendance_module.sql   widens role_module_access CHECK,
                                      grants 'leave_attendance' to hr +
                                      employee, creates holidays + shifts
                                      tables, adds employee_profiles.shift_id
```

`components/nav-links.tsx`'s `NAV_ITEMS` drops the two always-visible
`{ module: null }` entries for Leave/Attendance and replaces them with two
`{ module: 'leave_attendance' }` entries pointing at `/hrm/leave` and
`/hrm/attendance`.

## Data model

One migration, additive only — no existing table's columns change shape,
no data migration needed (both new tables start empty; `shift_id` defaults
to `null` for every existing employee):

```sql
-- Widen role_module_access.module's CHECK constraint (same drop/recreate
-- pattern as every prior module-key migration in this repo).
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
  check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance'));

insert into public.role_module_access (role, module, enabled) values
  ('hr', 'leave_attendance', true),
  ('employee', 'leave_attendance', true)
on conflict (role, module) do nothing;

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  working_monday boolean not null default true,
  working_tuesday boolean not null default true,
  working_wednesday boolean not null default true,
  working_thursday boolean not null default true,
  working_friday boolean not null default true,
  working_saturday boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.employee_profiles
  add column shift_id uuid references public.shifts(id) on delete set null;
```

`holidays` and `shifts` are read via the existing "admin client + explicit
column list" pattern (service-role, code-level scoping) — same as every
other cross-table read in this codebase. No RLS policy work needed since
neither table has a self-service write path (HR-only mutation via Server
Actions gated by `requireModule('leave_attendance')` + a role check, same
pattern `updateHrConfig`/`updateModuleAccess` already use).

## Key flows

- **Leave calendar** (`/hrm/leave/calendar`): Server Component queries
  `leave_requests` (status `approved`, date range = current month ±1) and
  `holidays` (same range), renders a month grid. Default view is "my
  team" (same `manager_id` lookup pattern as the existing "My team's
  requests" section); a toggle switches to company-wide for `hr`/`admin`
  roles only (checked server-side, not just hidden in the UI).
- **Holidays** (`/hrm/leave/holidays`): plain list + add form (date, name)
  + delete button, gated `requireModule('leave_attendance')` +
  role-in-`('hr','admin')` check inside the Server Actions (list page
  itself is visible to everyone so the calendar's holiday overlay always
  has something to show, but only HR/admin see the add/delete controls).
- **Attendance reports** (`/hrm/attendance/reports`): HR-only page,
  `searchParams` carries `from`/`to` dates (default: current month),
  queries `attendance_records` in range + resolves names via the existing
  Map pattern, computes hours worked per record via the existing
  `hoursWorked()`, groups into a per-employee summary table (days present,
  total hours). "Download CSV" links to
  `/hrm/attendance/reports/export?from=...&to=...`, which re-derives the
  same rows server-side (never trusts a client-supplied CSV blob) and
  streams them as `text/csv`.
- **Shifts** (`/hrm/attendance/shifts`): HR-only, a form to create a shift
  (name, start/end time, working days) and a table to assign each active
  employee to a shift via a `<select>` (mirrors the existing manager-id
  assignment `<select>` pattern in `/users/[id]`). The existing
  `/hrm/attendance/team` view adds a "Shift" column next to each report's
  name, reading `employee_profiles.shift_id` → `shifts.name`.

## Access control

- `requireModule('leave_attendance')` gates every route under
  `/hrm/leave` and `/hrm/attendance`.
- HR-only sub-pages (`holidays` mutations, `reports`, `shifts`) add an
  explicit `currentUser.role === 'hr' || currentUser.role === 'admin'`
  check inside their Server Actions and redirect otherwise — the module
  gate alone isn't enough since `employee` also has `leave_attendance`
  enabled by default. This mirrors the existing `/users` page's own
  admin-only branches (e.g. inviting an `admin` role is gated on
  `currentUser.role === 'admin'` inside the same page that `hr` can also
  reach).
- All existing invariants carry over unchanged: manager-routed requests
  never appear in HR's queue and vice versa; deactivated managers are
  never shown as a live reporting line; the office-IP allowlist and WFH
  bypass logic for check-in/out is untouched.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision
(no automated test suite): submit and cancel a leave request; approve/
reject as a manager and separately as HR (unmanaged employee); add a
holiday and confirm it appears on the calendar without changing any
balance; check in/out and confirm the IP-allowlist/WFH-bypass behavior is
unchanged; create a shift and assign it to an employee, confirm it shows
on the team view and in reports; generate an attendance report for a date
range and download the CSV, confirm it matches the on-screen numbers;
confirm `/leave`, `/attendance`, `/users/leave-requests`, and
`/users/attendance-records` all 404 after removal; confirm the sidebar's
Leave/Attendance links land on the new pages and are hidden entirely for
a role with `leave_attendance` disabled (live-toggle test via
`role_module_access`, same pattern used in Foundation's QA).

## Out of scope for this sub-project

- Shift-based attendance enforcement (late-checkin flags, per-shift
  validation) — shifts are informational only in this sub-project.
- Holidays affecting leave balance math — explicitly confirmed out of
  scope; a holiday inside an approved leave range still counts as used.
- Recurring/yearly-repeating holidays — each holiday is a single date;
  re-adding for the next year is a manual HR action.
- Onboarding, recruitment, performance, assets, helpdesk, payroll — each
  its own future sub-project.
