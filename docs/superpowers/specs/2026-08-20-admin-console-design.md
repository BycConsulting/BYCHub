# Admin Console — Design Spec

**Date:** 2026-08-20
**Status:** Approved for planning
**Addition to the BYC internal SaaS platform's sub-project decomposition** (see
[2026-08-19-foundation-crm-core-design.md](2026-08-19-foundation-crm-core-design.md)) —
discovered mid-stream while wiring up the multi-model chatbot router's API keys, not part
of the original 7-way split. Scoped and treated as its own sub-project.

## Context

The admin-only `/users` page (sub-project 1) currently supports only inviting new
employees. There is no way to offboard someone who leaves the company, no way to reset a
forgotten password, and no visibility into whether the chatbot router's provider API keys
are actually configured without checking Vercel's dashboard directly. This sub-project
adds all three, scoped tightly to avoid becoming an open-ended "settings" catch-all.

## Scope of this sub-project

- **Deactivate a user** (not a hard delete — see the "delete vs deactivate" decision
  below), with mandatory reassignment of their owned leads/clients if they have any.
- **Reactivate** a deactivated user (safety valve for mistakes or an employee returning).
- **Reset a user's password** (admin generates a new temp password, shown once — same
  pattern as invite).
- **API key configuration status** (read-only: "Configured" / "Not configured" for
  `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`, checked server-side) on a new small `/settings`
  page.

## Decision: delete means deactivate, not a hard row delete

A true hard delete of a `users` row is blocked by the database the moment that employee
has logged any `activities` row: `activities.user_id` is a `NOT NULL` foreign key to
`users(id)` with no cascade rule, and the decision below (activities keep their original
author, never reassigned) means that FK reference must stay valid forever. Rather than
work around this with a nullable foreign key (losing "who did this" on historical
activity entries) or forcing every activity to be reassigned/deleted before a user can be
removed (extra admin burden, easy to get stuck), "delete" in this admin console actually
means **deactivate**: a new `is_active` flag disables login and hides the employee from
active-employee pickers, while the row and every historical reference to it stays intact.
This is the standard pattern for employee offboarding in most CRMs and is fully
reversible via the Reactivate button.

## Data reassignment on deactivation

- **Leads and clients** the departing employee owns/is assigned to: the admin must pick
  another active employee to reassign them to before deactivation completes, *unless* the
  departing employee owns zero leads/clients, in which case deactivation is immediate
  with no reassignment step.
- **Activities** (notes/calls they logged): never reassigned. `activities.user_id` keeps
  pointing at the deactivated employee — this is a historical record of who actually did
  what, and rewriting it to a different name would be dishonest, not just inconvenient.
- **Private chat conversations/messages** (sub-project 6): left untouched. They become
  unreachable once the employee can't log in (their chats' RLS is `auth.uid() = user_id`,
  and that account can no longer authenticate) — there's no reason to delete or reassign
  private scratch space that was never company data in the CRM sense.

## Architecture

Extends the existing `/users` page (`app/(app)/users/page.tsx`, `app/(app)/users/actions.ts`
from sub-project 1) with two new Server Actions — `deactivateUser` and
`resetUserPassword` — reusing the httpOnly-cookie one-time-display pattern already built
for the invite flow's temp password, rather than inventing a second mechanism for the
same kind of secret.

A new, separate `/settings` page (also gated by `requireAdmin()`) is a thin read-only
view checking `process.env.ANTHROPIC_API_KEY`/`process.env.OPENAI_API_KEY` presence
server-side. No new table, no client-side JavaScript, no key storage anywhere — the app
keeps using Vercel's environment variables as the only place secrets live, consistent
with how `SUPABASE_SERVICE_ROLE_KEY` is already handled.

`lib/access.ts`'s `getCurrentUser()` (used by every protected page and by the chatbot's
Route Handler) gains one more check: if the profile row's `is_active` is `false`, treat
it exactly like "no profile row found" — sign the session out and return `null`. This is
the actual enforcement for deactivation. No Supabase Auth session-revocation API call is
needed, because every request already re-reads the profile row fresh.

```
/users page (existing, extended): invite (existing) + deactivate + reactivate + reset password
/settings page (new): API key configuration status, read-only
lib/access.ts getCurrentUser(): existing check + new is_active check
```

## Data model

```
users.is_active   boolean, not null, default true   (new column, existing table)
```

No other schema changes. `leads.assigned_user_id` and `clients.owner_user_id` (both
already exist, sub-project 1) are what gets updated during reassignment — no new foreign
keys, no new tables.

## Guardrails

- An admin cannot deactivate their own account (checked server-side, not only hidden in
  the UI).
- The reassign-to target must be an existing *active* employee, and cannot be the same
  person being deactivated.
- Deactivated employees are excluded from the reassign-to dropdown and from any other
  future active-employee picker in the app.

## Error handling

- Reassignment and the `is_active` update happen as sequential writes (reassign leads,
  reassign clients, then flip `is_active`) — if a later step fails, the admin sees a clear
  inline error and the already-reassigned records simply keep their new owner (safe,
  idempotent to retry: re-running deactivation on the same user with 0 remaining
  owned records just skips straight to the flag flip).
- Reset-password and deactivate/reactivate all follow the existing app-wide pattern:
  validate input, redirect with `?error=` on failure, never a silent failure.

## Testing

Manual QA in the dev server, consistent with the platform-wide decision (no automated
test suite). Deactivation-with-reassignment is the one flow worth deliberately exercising
with a user who actually owns a lead and a client, not just the zero-data path, since
that's where the real logic lives.

## Out of scope for this sub-project

- Any editable/database-stored API key management — status display only, env vars remain
  the only place secrets live.
- Email-based password reset — admin-generated temp password only, matching the existing
  invite pattern; no email-sending infrastructure exists in this app.
- Hard user deletion — deactivate/reactivate only, per the decision above.
- Branding, notification settings, or any other "configuration" beyond the three items
  named in scope — explicit cap, to be added later as its own small addition if actually
  needed.
