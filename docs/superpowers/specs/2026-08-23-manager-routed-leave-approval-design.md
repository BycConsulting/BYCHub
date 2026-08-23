# Manager-Routed Leave Approval — Design Spec

**Date:** 2026-08-23
**Status:** Approved for planning
**Follow-on to the shipped Leave & WFH Requests sub-project**
([spec](2026-08-22-leave-wfh-requests-design.md)) — not part of the
original four-piece HR module decomposition (Configuration → Leave/WFH →
Attendance → Documents), but a gap identified once Leave & WFH shipped:
every pending request routes to a single shared HR queue, with no concept
of "this employee's request goes to their manager specifically."

## Context

The shipped Leave & WFH Requests feature has exactly one approval path:
any `hr`-module-holding user (HR role or Admin) can approve or reject any
employee's pending request, via one shared queue at
`/users/leave-requests`. There is no per-employee routing. This
sub-project adds that: HR/Admin assigns each employee a specific manager,
and once assigned, that employee's requests route to their manager
instead of the shared HR queue — and the manager does not need the `hr`
module at all, since managers are frequently plain `employee`-role staff
(team leads) with no HR access.

## Scope of this sub-project

A `manager_id` field per employee, settable by HR/Admin. A new
manager-facing view (a section on the existing `/leave` page, visible only
to users who actually manage someone) to see and act on their reports'
pending requests. HR's existing queue excludes any request whose employee
now has a manager assigned.

## Decisions from brainstorming

- **One manager per employee** (not multiple allowed approvers) — a
  single nullable `manager_id` field, not a join table. Simpler, matches
  what was actually asked for.
- **A manager can be any employee**, not restricted to `hr`/`admin` roles
  — this is the whole point (team leads without HR access still need to
  approve their reports' leave). This is a genuinely new access dimension
  for this app: authorization based on a relationship (are you this
  person's assigned manager), not a role or the module matrix.
- **Assigning a manager is an HR/Admin action**, set on the existing
  `/users/[id]` employee-edit page (the same page that already edits
  designation, department, employment dates, and personal-info fields
  directly) — not something an employee or a manager can self-assign.
- **Routing is exclusive, not additive**: once an employee has a manager
  assigned, HR's queue stops showing their requests entirely — only the
  manager acts on them. An employee with no manager assigned still falls
  through to HR's existing shared queue exactly as it works today. There
  is no dual-visibility mode where both HR and a manager can act on the
  same request.
- **No new RLS policy for cross-user visibility.** A manager reading
  their reports' pending requests is implemented the same way `/leave`
  already reads `hr_config` for its balance display: through the
  service-role client, filtered in application code by `manager_id`. This
  avoids adding a genuinely new RLS policy (SELECT rows belonging to
  someone else, gated by a relationship rather than ownership) to
  `leave_requests`, which would be new surface area to get right; the
  existing SELECT-own/INSERT-own policies for the regular client are
  untouched.
- **New Server Actions, not reused ones.** The existing
  `approveLeaveRequest`/`rejectLeaveRequest` in
  `app/(app)/users/leave-requests/actions.ts` are gated by
  `requireModule('hr')` — a plain-employee manager would be rejected by
  that gate. A separate pair of actions, authorized by "is the acting
  user this request's assigned manager" (a service-role lookup against
  `employee_profiles.manager_id`, not a module check), is needed instead.
- **Manager UI location**: not a new top-level nav item (would be empty
  for most users, since most people don't manage anyone) — a "My team's
  requests" section added to the bottom of the existing, already-ungated
  `/leave` page, rendered only when the current user is actually
  someone's `manager_id`.

## Architecture

```
employee_profiles.manager_id     nullable, references users(id) — set via /users/[id]
/leave                           existing page, gains a conditional "My team's requests"
                                  section (own requests + balance sections unchanged)
/leave (new actions)              approveTeamRequest / rejectTeamRequest — manager-authorized,
                                  not module-gated
/users/leave-requests            existing HR queue — query gains a filter excluding
                                  requests whose employee has a manager assigned
```

The HR queue's existing query (`status = 'pending'`) gets one additional
condition: exclude any request whose `user_id` has a non-null
`manager_id` in `employee_profiles`. Since `Relationships: []` is this
codebase's established convention (no embedded/joined selects), this is
implemented the same way the existing queue already looks up requester
names — a second query (or a single query against `employee_profiles`
for the relevant `user_id`s) plus in-code filtering, not a SQL join.

The new "My team's requests" section on `/leave` mirrors the existing HR
queue's rendering (requester name, dates, day count, reason, balance
context, Approve/Reject with the same confirmation-dialog pattern already
built for HR's queue) — same visual shape, different data source and
different authorization.

## Data model

```sql
alter table public.employee_profiles add column manager_id uuid references public.users(id);
```

No new table. `employee_profiles` already exists (from the Employee
Details sub-project) and already holds one row per user with a
service-role-only write path — `manager_id` fits the same shape as
`designation`/`department`: an HR/Admin-set, employee-invisible-to-edit
field.

`leave_requests` itself is untouched — no schema change there. The
routing decision (HR queue vs. manager view) is computed by joining
`leave_requests.user_id` against `employee_profiles.manager_id` in
application code, not stored on the request itself. This means
reassigning an employee's manager takes effect immediately for their
*next* pending request lookup — there's no per-request snapshot of who
the manager was at submission time.

## Access control

- Setting `manager_id`: part of the existing `updateEmployeeProfile`
  Server Action's admin-direct-edit form on `/users/[id]` — gated by
  `requireModule('hr')`, same as every other field on that page. The form
  gets a dropdown listing every active user (any role — the whole point
  is a manager doesn't need `hr`/`admin`), plus a blank "no manager"
  option; not a free-text field, to avoid HR fat-fingering a UUID or
  assigning a nonexistent/deactivated user as someone's manager.
- Reading/acting on team requests: `requireUser()` only (same as the rest
  of `/leave` — no module gate), but the new actions additionally verify,
  via a service-role lookup, that `employee_profiles.manager_id` for the
  target request's `user_id` equals the acting user's own id. A manager
  attempting to act on a request that isn't theirs to review (not their
  report, or the report's manager has since been reassigned) is rejected
  the same way `reviewRequest`'s existing self-approval guard rejects a
  mismatch — checked in the Server Action itself, not merely hidden by
  the UI.
- Self-approval: unreachable the same way it already is for HR — a
  manager is never their own `manager_id` in ordinary use, but the new
  actions still explicitly reject `request.user_id === currentUser.id`
  as defense in depth, matching the existing HR-side guard exactly.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision
(no automated test suite): assign a manager to a test employee, confirm
their pending request disappears from HR's queue and appears in the
manager's "My team's requests" section, confirm the manager can
approve/reject with the same balance-deduction behavior as the HR path,
confirm an employee with no manager assigned still routes to HR as today,
confirm a manager cannot act on a report that was reassigned to a
different manager after the request was submitted.

## Out of scope for this sub-project

- Multiple approvers per employee, or an approval chain
  (manager-then-HR) — one manager, one decision, per the brainstorming
  decision above.
- A manager self-assigning or an employee requesting a specific manager —
  assignment stays an HR/Admin action only.
- Any notification to the manager when a new request needs their
  attention — matches the existing platform-wide decision (no
  notification infrastructure exists yet).
- Reassigning a manager mid-request-lifecycle in a way that preserves who
  reviewed a request that later gets reassigned — routing is always
  computed live against the current `manager_id`, not snapshotted.
