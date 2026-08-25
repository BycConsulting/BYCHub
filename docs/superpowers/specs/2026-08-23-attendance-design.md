# Attendance — Design Spec

**Date:** 2026-08-23
**Status:** Approved for planning
**Third piece of the HR module** (Configuration → Leave/WFH → Manager-Routed
Leave Approval → **Attendance** → Documents)

## Context

BYC Hub's HR module currently covers employee profiles, leave/WFH requests
(with manager-routed approval), and HR configuration. There is no way to
record when an employee actually starts or ends their workday. This
sub-project adds check-in/check-out attendance tracking with a
company-network gate to prevent trivially spoofed remote check-ins.

## Scope of this sub-project

A daily check-in/check-out button on a new `/attendance` page, gated by an
office IP allowlist (bypassed on approved WFH days), a per-employee history
view, a manager view of direct reports' attendance, and an HR view across
all employees with a manual-correction action for missed checkouts.

## Decisions from brainstorming

- **Check-in/out is a simple button**, not a form — one click records a
  server-side timestamp. No client-supplied time is ever trusted.
- **Gated by an office IP allowlist**, not browser geolocation — the server
  reads the request's IP and checks it against a configured list. No
  permission prompts, no spoofable client-reported coordinates (though a
  spoofed `X-Forwarded-For` is a known limitation of any IP-based gate —
  acceptable for this internal tool, matching the trust level of every
  other unauthenticated-adjacent check in this app).
- **WFH bypasses the gate.** If the employee has an `approved` leave
  request of type `wfh` covering today's date, the IP check is skipped
  entirely and check-in/out succeeds from any network. This reuses
  `leave_requests` — no new table, no new concept of "WFH day" beyond what
  the Leave module already tracks. Computed live on every check-in/out
  attempt, not cached or snapshotted.
- **Single session per day** — one check-in, one check-out, no breaks or
  multiple sessions. Hours worked = `checked_out_at - checked_in_at`. If
  the app later needs breaks, that's a separate sub-project.
- **Missed checkout stays open indefinitely.** No automatic midnight
  closeout, no guessing. HR/Admin gets an explicit manual-edit action to
  set or correct either timestamp on any employee's record for any day.
- **Manager visibility**: managers (per `employee_profiles.manager_id`,
  from the Manager-Routed Leave Approval sub-project) can see their direct
  reports' attendance — mirrors the "My team's requests" pattern already
  built for leave. No new access model; this reuses the existing
  relationship.
- **HR/Admin visibility**: full read access to every employee's attendance
  across the company, plus the manual-correction action. Gated by
  `requireModule('hr')`, same as every other HR page.
- **Office IP allowlist lives on the existing `hr_config` row** — one new
  field (comma-separated IPs/CIDR ranges), editable on the existing
  `/users/config` page alongside leave-type allocations. Not a new
  settings page for one field.

## Architecture

```
attendance_records          new table: one row per employee per calendar day
/attendance                 new page (ungated, like /leave) — check-in/out button,
                             own history, conditional "My team's attendance" section
/attendance (new actions)   checkIn / checkOut — IP-gated (WFH-aware), ownership-checked
/users/attendance-records   new HR page — all employees' records + manual-correction action
hr_config.office_ip_allowlist   new column — comma-separated IPs/CIDR ranges
```

The IP gate and the WFH bypass are both evaluated server-side, inside the
`checkIn`/`checkOut` Server Actions, on every call — never cached, never
trusted from the client.

## Data model

```sql
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  date date not null,
  checked_in_at timestamptz,
  checked_in_ip text,
  checked_out_at timestamptz,
  checked_out_ip text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.hr_config
  add column office_ip_allowlist text not null default '';
```

The `unique (user_id, date)` constraint is what makes "one session per day"
structural rather than merely enforced in application code — a second
check-in attempt the same day fails at the database level if the
application check is ever bypassed.

RLS: `attendance_records` gets the same shape as every other self-service
table in this app — SELECT-own and INSERT-own for the regular authenticated
client (INSERT's `with check` pins `user_id` to the caller and requires
`checked_out_at`/`checked_out_ip` to be null on insert, matching the
`employee_profiles`/`leave_requests` forgery-prevention pattern), no UPDATE
policy at all. Check-out (an UPDATE) and every HR manual-correction go
through `createAdminSupabaseClient()` with explicit authorization checks in
code, never relying on RLS alone.

## Access control

- **Check-in**: `requireUser()` only. Server Action verifies (a) no
  existing row for `(user_id, today)`, or an existing row with
  `checked_in_at` already set → reject "already checked in today"; (b) the
  request IP is in `hr_config.office_ip_allowlist`, OR the employee has an
  `approved` `wfh` leave request covering today — otherwise reject "not on
  office network". The WFH lookup queries the caller's own
  `leave_requests` rows, already covered by that table's existing
  SELECT-own policy, so it uses the regular authenticated client — no
  service-role needed anywhere in the check-in path. On success, the
  regular client inserts the row directly (INSERT-own policy).
- **Check-out**: `requireUser()` only. Server Action verifies a row exists
  for `(user_id, today)` with `checked_in_at` set and `checked_out_at`
  null, re-applies the same IP/WFH gate, then updates via service-role
  (since regular client has no UPDATE policy) with an ownership check
  (`user_id = currentUser.id`) and the same row-count-check pattern used
  everywhere else in this app (`.eq(...).select('id').single()`, handle
  `PGRST116` as "not checked in, or already checked out").
- **Own history**: `requireUser()`, SELECT-own via the regular client.
- **Team view**: `requireUser()` only (not module-gated) — service-role
  lookup filtered by `employee_profiles.manager_id = currentUser.id`, same
  pattern as `/leave`'s team section. Read-only; managers don't get a
  correction action, only HR does.
- **HR records + manual correction**: `requireModule('hr')`. Correction
  action takes a record id and new timestamp(s), writes via service-role,
  no ownership restriction (HR can correct anyone's record) but validates
  the record exists (row-count-check pattern) and that
  `checked_out_at >= checked_in_at` when both are set.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision (no
automated test suite): check in from an allowlisted IP, confirm success and
that a second check-in same day is rejected; check out, confirm hours are
computed and displayed; attempt check-in from a non-allowlisted IP, confirm
rejection; assign an approved WFH request for today and confirm check-in
now succeeds from a non-allowlisted IP; confirm a manager sees a report's
attendance and HR sees everyone's; confirm HR's manual-correction action
can set a missing checkout and that the row-count-check rejects a
correction on a nonexistent record.

## Out of scope for this sub-project

- Multiple check-in/out sessions per day (breaks, lunch).
- Browser geolocation as an alternative/additional gate.
- Overtime, holiday, or shift-schedule calculations.
- Automatic midnight closeout of forgotten checkouts.
- Notifications or reminders to check in/out.
- An audit trail of HR's manual corrections (who changed what, when) —
  the correction itself is authorized and row-count-checked like every
  other write in this app, but no separate history table is added; this
  is consistent with the rest of the app having no audit logging anywhere
  yet.
