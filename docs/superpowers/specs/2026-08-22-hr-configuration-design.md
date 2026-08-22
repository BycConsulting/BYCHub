# HR Configuration — Design Spec

**Date:** 2026-08-22
**Status:** Approved for planning
**First round of the full HR module** — decomposed into: this sub-project
(HR Configuration) → Leave & WFH requests → Attendance → Documents. Builds
on the shipped HR Portal roles/permissions sub-project
([spec](2026-08-22-hr-portal-roles-design.md) — note: filename says
2026-08-21, the sub-project it documents shipped and merged 2026-08-22).

## Context

The user asked for a full company HR portal: employee-facing leave
application, leave balance tracking, WFH requests, daily check-in/check-out,
payslip download, offer-letter download; HR-facing letter/payslip upload,
request approval, and configuration of working days and leave counts. That
request was decomposed into four independent sub-projects (agreed order:
Configuration → Leave/WFH → Attendance → Documents), starting here because
the Leave sub-project's balance tracker needs to read an annual leave
allocation that has to exist first.

## Scope of this sub-project

A single, HR-editable settings record: which weekdays count as working
days, and the annual allocation (in days) for five leave types. Nothing
else reads or writes this data yet — the Leave sub-project will be the
first consumer.

## Decisions from brainstorming

- **Leave types**: five, fixed set — Casual Leave, Sick Leave, Earned/
  Privilege Leave, Maternity Leave, Paternity Leave. Maternity and
  Paternity are separate counts (not a shared bucket), since they differ
  by a large margin in practice.
- **Allocation scope**: one global number per leave type, applying to
  every active employee — not split by employment type (full_time/
  part_time/contract). Editable at runtime by HR/Admin, not hardcoded.
- **Working days**: which of Monday–Saturday count as working days,
  editable — not a fixed count. Default matches the company's current
  Monday–Saturday operating schedule. Sunday is not offered as a working
  day (out of scope to generalize further right now — see Out of Scope).
- **Access**: gated by the existing `hr` module (same access level as the
  rest of the employee-management area), not the harder `settings`
  module — this is HR policy, not system security configuration, so it
  doesn't warrant the same admin-only lockdown the permission matrix has.
- **Audit trail**: `updated_at`/`updated_by` on the settings row. The
  prior sub-project's final review flagged the permission matrix's lack
  of an audit trail as a deferred gap; adding it here from the start
  costs nothing and closes that gap class for this new table.

## Architecture

```
hr_config                    singleton row: working days + 5 leave allocations
/users/config                HR-module-gated settings page (view/edit form)
```

One new route under the existing "HR" nav area (which already points at
`/users`): `/users/config`, linked from `/users`. No new nav-level
top-level link — this is a sub-page of the existing HR area, the same
relationship `/settings/permissions` has to `/settings`.

## Data model

```sql
hr_config
  id (fixed singleton — see below)
  working_monday    boolean, default true
  working_tuesday   boolean, default true
  working_wednesday boolean, default true
  working_thursday  boolean, default true
  working_friday    boolean, default true
  working_saturday  boolean, default true
  working_sunday    boolean, default false  -- always false; not exposed in the form, see below
  casual_leave_days    integer, default 12
  sick_leave_days      integer, default 12
  earned_leave_days    integer, default 15
  maternity_leave_days integer, default 182  -- ~26 weeks, Maternity Benefit Act default
  paternity_leave_days integer, default 15
  updated_at (timestamptz)
  updated_by (references users(id), nullable)
```

Default leave-day values above are placeholders for a reasonable Indian-
company starting policy — the whole point of this table is that HR
changes them immediately after this ships, so the exact defaults are not
load-bearing.

**Singleton enforcement**: `id boolean primary key default true check (id)`
— the standard Postgres singleton-table idiom, since a boolean primary key
can only ever hold one distinct value, making a second row structurally
impossible rather than merely convention. Seeded once by the migration
(the single row, `id = true`). The edit form always operates on that one
row — no create/delete UI, ever.

**RLS**: matching `role_module_access`'s established pattern — enabled,
zero policies for the regular `authenticated` client. All reads (by the
config page) and writes (by the update action) go through the service-
role client. This table isn't queried by any other part of the app yet in
this sub-project, so there's no broader read requirement to weigh against
that lockdown.

`working_sunday` exists in the schema (for a uniform 7-column shape,
avoiding a special-cased 6-day boolean set) but is not rendered as an
editable checkbox in the form and is not settable — Sunday-as-a-working-day
is out of scope for this round; the column defaults to and stays `false`.
If a future sub-project needs it, removing that restriction is a one-line
change (render the checkbox), not a schema change.

## Access control

`requireModule('hr')` gates both the page and its Server Action —
identical pattern to `/users`, `/users/[id]`, and their actions. No new
access-control code needed; this sub-project only adds a new gated page,
it doesn't touch `lib/access.ts`.

## Validation

Zod, matching the light-touch validation already used elsewhere: each
leave-day count is a non-negative integer with a sane upper bound (e.g.
0–365, catching fat-fingered entry without being paternalistic about
actual policy values). At least one weekday must remain a working day
(reject a submission that would zero out the whole week) — a real, cheap
guard against a config that would make the eventual Attendance/Leave
math nonsensical.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision
(no automated test suite).

## Out of scope for this sub-project

- Actually computing any employee's leave balance, or any leave request
  workflow — that's the next sub-project (Leave & WFH requests); it reads
  this table, this sub-project doesn't write anything that consumes it.
- A holiday calendar (specific dates off, not just which weekdays) —
  bigger feature, not requested yet.
- Sunday as a configurable working day — schema allows it trivially
  later; no UI for it now.
- Per-employment-type leave allocation — global-only per the brainstorming
  decision above.
- Attendance, Documents — separate sub-projects per the agreed order.
