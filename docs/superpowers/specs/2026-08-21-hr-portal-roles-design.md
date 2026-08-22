# HR Portal: Roles & Module Access — Design Spec

**Date:** 2026-08-21
**Status:** Approved for planning
**First round of the "proper HR Portal" request** — decomposed into: this
sub-project (roles, configurable module access, read-only employee profile,
renamed HR nav), then PTO/WFH requests, then CEO dashboard integration. Builds
directly on the shipped Employee Details sub-project
([spec](2026-08-21-hr-employee-details-design.md)).

## Context

The user asked for a "proper HR Portal": a new `hr` role as a superuser
alongside `admin`, employees with no edit access (view-only, can raise
PTO/WFH requests), and a CEO dashboard showing everything. That request was
decomposed (agreed order: this sub-project → PTO/WFH → CEO dashboard) and
then refined through brainstorming: Admin remains the sole fixed superuser;
`hr` gets scoped access via a **configurable role → module matrix**, editable
at runtime by Admin, rather than hardcoded role checks. Mid-brainstorm, the
user also decided employees should have **no edit access at all** — the
personal-info change-request workflow shipped in the prior sub-project is
being removed, not extended.

## Scope of this sub-project

1. Add an `hr` role.
2. A `role_module_access` table + an Admin-only editor page: a role × module
   checkbox matrix, runtime-editable, no redeploy needed to change who can
   see what.
3. Replace every hardcoded `role === 'admin'` gate (pages, Server Actions,
   nav visibility) with a module check against that matrix.
4. Remove the employee-initiated profile change-request system entirely
   (table, actions, pages, nav link) — `/profile` becomes read-only.
5. Rename the "Users"/"Requests" nav area to "HR", gated by the new `hr`
   module instead of `role === 'admin'`.

## Decisions from brainstorming

- **Admin is fixed, not configurable.** Admin always has every module.
  This is hardcoded (`role === 'admin'` short-circuits before consulting the
  matrix), never stored as a togglable row — so no combination of matrix
  edits can lock Admin out of the app.
- **`hr` role scope**: access is whatever the matrix says (default: `hr`
  module only). Not full parity with Admin — that was the first answer
  given during brainstorming, but was superseded once the user clarified
  "Admin is the super user but HR will have access to hr module."
- **Modules**: `dashboard`, `leads`, `clients`, `hr`, `settings`. `hr` is
  deliberately coarse for now (one module, not split into
  employees/requests/PTO/attendance/salary sub-modules) — it will absorb
  PTO/WFH and later HR sub-projects without a schema change, since a module
  is just a string key in the matrix.
- **`hr` module meaning**: *management* capability — the employee list,
  invite/deactivate/reset-password, admin-direct-edit of any profile. This
  is deliberately NOT the same thing as "view my own profile": every
  authenticated user can always see their own `/profile` regardless of the
  matrix, because that is account-scoped (like signing out), not a
  togglable module. Conflating the two would mean giving `employee` the
  `hr` module (today's default employee-facing behavior) accidentally hands
  them the employee list and invite/deactivate powers — a real privilege
  escalation, not a display tweak. Splitting them avoids that.
- **Default matrix** (all editable afterward via the UI, Admin's row fixed):
  - `hr` role → `hr`: on. Everything else off.
  - `employee` role → `dashboard`, `leads`, `clients`: on. `hr`, `settings`:
    off.
- **Employees cannot edit anything, anywhere.** The personal-info
  change-request workflow (shipped: `employee_profile_requests` table,
  `/profile`'s edit form + "My requests" list, `/users/requests` approval
  queue, the `submitProfileChangeRequest` action) is removed outright — not
  hidden, not defanged. `/profile` becomes pure read-only display (job info
  + personal info, no form). Only `admin`/`hr` (via the `hr` module) can
  change any profile field, directly, through the existing `/users/[id]`
  admin-edit page — no approval step needed any more since there's no
  employee-submitted proposal to approve.
- **Nav renaming**: "Users" + "Requests" collapse into a single "HR" link
  (pointing at the existing `/users` route, unchanged), gated by the `hr`
  module. "Profile" stays a separate, always-visible link (not
  module-gated). "Settings" stays separate, gated by the `settings` module,
  and gets a new sub-page for editing the permission matrix.

## Architecture

```
role_module_access          runtime-editable role -> module -> enabled matrix
requireModule(moduleKey)     replaces requireAdmin(); Admin bypasses the matrix
/settings/permissions        Admin-only matrix editor (checkbox grid)
/profile                     read-only for everyone (job info + personal info)
/users, /users/[id]          unchanged routes, now gated by the `hr` module
```

`requireModule(moduleKey: Module)` in `lib/access.ts`:
1. Calls `requireUser()` (existing — 401s to `/login` if unauthenticated).
2. If `user.role === 'admin'`, returns immediately — no matrix lookup.
3. Otherwise queries `role_module_access` (service-role client, single row
   lookup on `(role, module)`) for `enabled`. If true, returns the user.
4. If false or no row, redirects to the user's first accessible module
   (computed by checking `dashboard` → `leads` → `clients` → `hr` →
   `settings` in that order against the matrix, first `true` wins; if none
   are enabled — a misconfigured matrix — redirects to `/profile`, which is
   always safe since it's ungated).

The nav (`app/(app)/layout.tsx`) fetches the current user's enabled modules
once per request (same matrix lookup, batched — one query for all 5 modules
rather than 5 separate calls) and renders each link only if its module is
enabled (Admin: all 5, unconditionally). "Profile" always renders.

## Data model

```sql
-- 0007_role_module_access.sql

alter table public.users drop constraint users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('admin', 'hr', 'employee'));

create table public.role_module_access (
  role text not null check (role in ('hr', 'employee')),
  module text not null check (module in ('dashboard', 'leads', 'clients', 'hr', 'settings')),
  enabled boolean not null default false,
  primary key (role, module)
);

-- No RLS policies for `authenticated` — this table is read and written
-- exclusively through the service-role client (requireModule's lookup, the
-- nav's batched lookup, and the Admin editor's save action), matching how
-- `users` writes already work in this app. `enable row level security`
-- with zero policies means the regular client gets zero rows either way;
-- this is a deliberate lockdown, not an oversight.
alter table public.role_module_access enable row level security;

insert into public.role_module_access (role, module, enabled) values
  ('hr', 'hr', true),
  ('employee', 'dashboard', true),
  ('employee', 'leads', true),
  ('employee', 'clients', true);
-- Every other (role, module) pair is implicitly false (absent row).

-- Remove the employee change-request system (shipped in the prior
-- sub-project, now superseded — employees cannot edit anything).
drop policy if exists "employee_profile_requests_select_own" on public.employee_profile_requests;
drop policy if exists "employee_profile_requests_insert_own" on public.employee_profile_requests;
drop table if exists public.employee_profile_requests;
```

`employee_profiles` (job info + personal info columns, its own RLS) is
untouched — employees still read their own row on `/profile`, just through
a page with no write path any more.

## Validation

No new user-facing input beyond the permission matrix editor, which is a
grid of checkboxes (booleans) — no free-text validation needed. The
existing `inviteUserSchema`'s `role` enum grows from `['admin', 'employee']`
to `['admin', 'hr', 'employee']`.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision (no
automated test suite): verify Admin's fixed access, verify the default
matrix for `hr` and `employee`, verify editing the matrix takes effect
immediately (no redeploy), verify `/profile` has no edit form for any role,
verify `/users`/`/users/[id]` are reachable by `hr` role and blocked for
`employee`.

## Out of scope for this sub-project

- PTO/WFH request feature — next sub-project; will introduce its own table
  and likely live under the `hr` module rather than a new one.
- CEO dashboard — separate sub-project; will read from `employee_profiles`
  and whatever PTO/WFH ships, once those exist.
- Changing an existing user's role after invite — no UI for this today (an
  admin can only set role at invite time); still not addressed here.
- Splitting the `hr` module into finer-grained sub-modules (e.g. separate
  toggles for "can invite users" vs "can approve PTO") — the matrix is
  module-level, not action-level, for this round.
