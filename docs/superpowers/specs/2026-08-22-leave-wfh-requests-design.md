# Leave & WFH Requests — Design Spec

**Date:** 2026-08-22
**Status:** Approved for planning
**Second round of the HR module** — after HR Configuration (working days +
5 leave-type annual allocations). Attendance and Documents follow this in
the agreed order. Builds on the shipped HR Portal roles/permissions
([spec](2026-08-21-hr-portal-roles-design.md)) and HR Configuration
([spec](2026-08-22-hr-configuration-design.md)).

## Context

HR Configuration set the annual allocation for five leave types (Casual,
Sick, Earned/Privilege, Maternity, Paternity) and which weekdays are
working days, but nothing reads that data yet. This sub-project is the
first consumer: employees apply for leave or WFH, see their own balance,
and HR approves or rejects. Leave and WFH are paired into one sub-project
because they're the same request/approval shape — WFH just never deducts
a balance.

## Scope of this sub-project

Employee-facing: submit a leave or WFH request (date range + reason), view
current-year balance per leave type, view/cancel own requests. HR-facing:
an approval queue (approve/reject any pending request).

## Decisions from brainstorming

- **Balance model**: calendar-year, computed live — balance for a leave
  type in year Y = HR Configuration's annual allocation for that type
  minus the days of every `approved` request of that type whose dates
  fall in year Y. Nothing is stored; a "new year" needs no reset job,
  since the math is naturally scoped by request dates. This app has no
  scheduled-job infrastructure at all, so a stored-and-decremented model
  would have required building one just for this.
- **Day counting**: every calendar day in `[start_date, end_date]`
  inclusive, not just working days. (Rejected the working-days-only
  alternative, which would have reused HR Configuration's weekday flags —
  the human decision was calendar days.)
- **Cross-year requests are rejected at submission** — `start_date` and
  `end_date` must fall in the same calendar year. Keeps the balance math
  from ever needing to split one request across two years' allocations;
  an employee splits it into two requests instead.
- **One unified table**, not separate Leave/WFH tables — `type` is one of
  six values (`casual`, `sick`, `earned`, `maternity`, `paternity`,
  `wfh`). `wfh` never deducts a balance; the other five do. Same
  request/approval/cancel code path for all six.
- **Overlap blocking**: a new request is rejected if its date range
  overlaps any of the requester's own existing `pending` or `approved`
  requests — checked across all types (an employee can't be on Casual
  Leave and WFH the same day), not just within the same type.
- **Multiple concurrent pending requests are allowed** (for
  non-overlapping dates) — unlike the old profile-change-request system's
  "one pending per field" rule, there's no artificial one-at-a-time limit
  here.
- **Cancel**: an employee can cancel their own request only while it's
  still `pending`. Once HR has approved or rejected it, it's locked —
  no employee-initiated undo after a decision (matches how `deactivateUser`
  etc. treat decided actions as final in this app).
- **Balance is advisory, not enforced at submission**: a request that
  would push a leave type's balance negative is not blocked — it submits
  normally, and the shortfall is visible (current balance shown alongside
  the request) to both the employee and HR at approval time. HR decides
  whether to approve it anyway (e.g. an advance against next year's
  allocation). No hard cap anywhere in this sub-project.
- **Navigation**: a new, always-visible **"Leave"** nav link — reachable
  by every authenticated user regardless of the module matrix, the same
  status `/profile` has (not a togglable module; leave is a personal,
  ongoing employee entitlement, not an HR-management capability). HR's
  approval queue is a separate page under the existing `hr`-module-gated
  area.

## Architecture

```
leave_requests                one row per request; id, user_id, type, start_date,
                               end_date, reason, status, reviewed_by, reviewed_at,
                               created_at
/leave                        ungated (every authenticated user): submit form,
                               own balance display, own request list with Cancel
/users/leave-requests         hr-module-gated: pending-request queue, Approve/Reject
```

Balance is computed, not stored: for each of the 5 leave types, sum the
day-counts of the current user's `approved` requests of that type whose
`start_date` falls in the current calendar year, subtract from HR
Configuration's allocation for that type. `/leave` reads both
`leave_requests` (own rows) and `hr_config` (the allocations) to compute
this. `hr_config` has zero RLS policies for the regular client (from the
prior sub-project, since it was only ever expected to be read by
`hr`-gated pages) — `/leave` being ungated but still needing those numbers
means its balance computation reads `hr_config` through the service-role
client, same as the approval queue does. This is a read of non-sensitive
policy numbers (annual leave-day counts), not employee data, so no new
exposure concern — just worth stating plainly rather than leaving it
implicit, since it's a first: an ungated page reading a service-role-only
table.

## Data model

```
leave_requests
  id (primary key)
  user_id (references users(id))          -- who requested it
  type text (check: casual | sick | earned | maternity | paternity | wfh)
  start_date date
  end_date date
  reason text                              -- required, non-empty
  status text (check: pending | approved | rejected | cancelled), default 'pending'
  reviewed_by (references users(id), nullable)
  reviewed_at (timestamptz, nullable)
  created_at (timestamptz)
```

Day count for a request = `end_date - start_date + 1` (inclusive), computed
in application code, not stored as a column.

**RLS**, matching the pattern already established for self-service
submission (`employee_profile_requests`'s SELECT-own/INSERT-own shape,
before that specific table was dropped — the *pattern* is reused here for
a genuinely different feature, not a resurrection of that table):

- `SELECT`: a user can read only their own rows (`user_id = auth.uid()`),
  gated by the same `is_active` employee-membership check every other CRM
  policy in this app already uses.
- `INSERT`: a user can insert only their own rows (`user_id = auth.uid()`)
  — submitting a request is a normal, ongoing self-service action (not the
  "employees can't edit anything" restriction from the roles sub-project,
  which was specifically about *profile* data; requesting leave is a
  different domain, same trust level as creating a lead or an activity).
- No `UPDATE` policy for the regular client — approve, reject, and cancel
  all go through the service-role client via Server Actions, each with an
  explicit ownership/role check in code (cancel verifies the request
  belongs to the acting user and is still `pending`; approve/reject
  require the `hr` module).

## Validation

Zod: `start_date`/`end_date` are valid dates, `start_date <= end_date`,
both in the same calendar year, `reason` is non-empty (light length cap,
matching the light-touch validation used elsewhere). The overlap check
(against the user's own pending/approved requests) is a business-rule
check in the Server Action, not expressible as a pure per-field zod
schema — it's the only thing that blocks submission. Balance is never a
submission-time constraint (see Decisions above): a request that would go
negative still submits, and both the employee's own view and HR's
approval queue show the resulting balance alongside the request so it's
visible before HR decides.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision
(no automated test suite).

## Out of scope for this sub-project

- Half-day leave — full days only, per the date-range model above.
- Any leave-balance carry-forward or expiry logic across years — the
  calendar-year model makes this moot for now (a year's balance is
  whatever the math produces for dates in that year; there's no "unused
  days" concept to carry).
- Attendance (check-in/check-out, working-hours tracking) and Documents
  (offer letters, payslips) — separate sub-projects per the agreed order.
- Editing a request after submission (only cancel-while-pending is
  supported; changing dates or type means cancelling and resubmitting).
- Notifications (email/in-app) when a request is approved or rejected —
  matches the same decision made for the profile-request system; no
  notification infrastructure exists in this app yet.
