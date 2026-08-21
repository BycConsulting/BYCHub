# HR Module: Employee Details — Design Spec

**Date:** 2026-08-21
**Status:** Approved for planning
**Sub-project 1 of 4 in the HR Module** (Employee details, Salary details, Attendance,
PTO/WFH requests — each a separate sub-project; see decomposition discussion). Also an
addition to the platform's overall decomposition, alongside the Admin Console.

## Context

The user asked for an "HR Module" covering employee details, salary, attendance, and
PTO/WFH requests — too large for one spec, so it's decomposed into four sub-projects,
starting here since employee details is the foundational record the other three will
reference. Salary in particular needs stricter access control than anything built so far
(the CRM's "any employee sees all" model cannot apply to salary), so that sub-project
deserves its own careful design later, not a rushed inheritance from this one's decisions.

## Scope of this sub-project

An employee's own HR profile: job info (designation, department, employment start date,
employment type) set only by an admin, and personal info (phone, address, emergency
contact, date of birth) that the employee can propose changes to, subject to admin
approval. Admin can view and directly edit any employee's full profile (both job and
personal fields) without needing their own approval — the approval requirement applies
specifically to an employee editing their own personal fields.

## Decisions from brainstorming

- **Field editability**: job info (designation, department, employment start date,
  employment type) is admin-only, direct edit, never touched by the employee. Personal
  info (phone, address, emergency contact name/phone, date of birth) is employee-proposed
  via a change request, admin-approved.
- **Pending-state display**: while a request is pending, the profile shows only the
  current (last-approved) value — not a "pending: X" inline hint. The employee's
  visibility into their own pending/approved/rejected requests lives in a separate "My
  requests" list, not inline on the field itself.
- **Admin edits bypass approval**: when an admin directly edits any field (job or
  personal) via the admin employee-detail page, it applies immediately. The
  request/approval workflow exists only for employee self-service edits to their own
  personal fields.

## Architecture

Three surfaces, plus a new table pair:

- **`/profile`** (any employee, their own record): job info shown read-only; personal
  info shown with an edit form that submits a change *request* (not a direct write) per
  changed field; a "My requests" section listing the employee's own requests with status.
- **`/users/[id]`** (admin-only, new): full profile view/edit for any employee. Admin
  edits all fields (job and personal) directly via the service-role client — no approval
  step, matching how every other admin write to the `users` table already works in this
  app.
- **`/users/requests`** (admin-only, new): queue of pending change requests across all
  employees, showing old vs. proposed value per request, with Approve/Reject actions.

```
employee_profiles            job info (admin-direct-edit) + personal info (current, approved values)
employee_profile_requests    one row per submitted change: field, proposed value, status, reviewed_by/at
```

## Data model

```
employee_profiles
  user_id (primary key, references users(id))
  phone text
  address text
  emergency_contact_name text
  emergency_contact_phone text
  date_of_birth date
  designation text
  department text
  employment_start_date date
  employment_type text (check: full_time | part_time | contract)
  created_at, updated_at

employee_profile_requests
  id (primary key)
  user_id (references users(id)) -- who is requesting the change
  field text (check: phone | address | emergency_contact_name | emergency_contact_phone | date_of_birth)
  proposed_value text            -- stored as text for all field types, cast on apply
  status text (check: pending | approved | rejected), default 'pending'
  reviewed_by (references users(id), nullable)
  reviewed_at (timestamptz, nullable)
  created_at (timestamptz)
```

**RLS**, matching the `users` table's existing pattern (SELECT-only for the regular
authenticated client, all writes via the service-role client):

- `employee_profiles`: an employee can `SELECT` only their own row. No `INSERT`/`UPDATE`
  for the regular authenticated client at all — even admin edits go through the
  service-role client (Server Action), exactly like every other write to the `users`
  table already does in this app.
- `employee_profile_requests`: an employee can `SELECT` their own requests and `INSERT`
  their own (submitting a request is a normal self-service action, unlike the profile
  data itself). No `UPDATE`/`DELETE` for the regular client — approving/rejecting is an
  admin action, goes through the service-role client.

## Approval workflow

1. Employee submits one or more changed personal fields on `/profile` → one
   `employee_profile_requests` row is created per changed field, `status = 'pending'`.
2. If a field already has a pending request for that employee, a new submission for the
   same field is rejected client-side with a clear message ("you already have a pending
   request for phone") — no stacking of conflicting pending edits for the same field.
3. Admin's `/users/requests` lists each pending request with the current value (read from
   `employee_profiles`) alongside the proposed value, and Approve/Reject buttons.
4. **Approve**: applies the proposed value to the corresponding `employee_profiles`
   column, marks the request `approved`, records `reviewed_by` and `reviewed_at`.
5. **Reject**: marks the request `rejected`, records `reviewed_by`/`reviewed_at`, no data
   change. The employee can submit a fresh request for that field afterward (the earlier
   rejected row no longer counts as "pending," so it doesn't block a resubmission).

## Validation

Zod, matching the light-touch validation already used elsewhere in this app: `date_of_birth`
must be a valid date; text fields (`phone`, `address`, `emergency_contact_name`,
`emergency_contact_phone`) have a minimum length of 1 and a sane maximum (e.g. 200
characters) — no format-specific validation (phone number formats vary too much
internationally to be worth enforcing a strict pattern here).

## Testing

Manual QA in the dev server, consistent with the platform-wide decision (no automated
test suite).

## Out of scope for this sub-project

- Salary details, attendance tracking, PTO/WFH requests — each is a separate sub-project
  in the HR Module decomposition, to be brainstormed individually.
- Bulk-editing multiple employees' job info at once — one employee at a time via
  `/users/[id]`.
- Notifications (email/in-app) when a request is approved or rejected — the employee
  checks the "My requests" list themselves; no notification infrastructure exists in this
  app yet.
- Any org-chart or cross-employee visibility of personal info — an employee can only ever
  see their own `employee_profiles` row.
