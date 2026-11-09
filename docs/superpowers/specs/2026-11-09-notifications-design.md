# In-App Notifications — Design Spec

**Date:** 2026-11-09
**Status:** Draft for approval

## Intent

Nothing in BYC Hub tells a person when something concerns them: a task is
assigned, a task they own is blocked, leave needs approval. People find out
by looking. This adds an in-app notification inbox with a bell in the top
bar. Email through Zoho Mail is planned for later, so notifications are
stored as typed records that an email step can read.

## Goals

- A bell icon in the top bar with an unread count, linking to `/notifications`.
- A `/notifications` page listing the signed-in user's notifications, newest
  first, with unread ones marked; opening one marks it read and goes to the
  related page; "Mark all as read".
- Notifications created for the agreed first-version events (below).
- Each person sees only their own notifications.

## Non-goals

- No email or other external delivery now (Zoho Mail later).
- No live updates: the count refreshes on page load and navigation.
- No per-user settings (muting, digests), no deleting or archiving.
- No notifications for modules other than Tasks and Leave.
- No pruning of old notifications.

## Anti-goals

- A failed notification must never make the underlying action fail or lose data.
- Nobody is notified about their own action.
- An employee must not be able to create notifications for someone else
  through the browser.

## Constraints

- Next.js 16 (read `node_modules/next/dist/docs/` first), Supabase, Vercel.
- Migration file `supabase/migrations/0020_notifications.sql`, applied by hand.
- Follow existing patterns: theme tokens, `PageHeader`, server actions with
  `requireModule` / `requireUser`, zod in `lib/validation/`, types in
  `types/database.ts`.

## Approaches considered

**Creation:** (A) server actions write notifications after the main write,
(B) database triggers, (C) a background job over `task_events`. **Chosen: A.**
It is explicit and testable, and leave routing ("manager, else HR") already
lives in app code.

**Freshness:** (1) count refreshes on every page load / navigation,
(2) Supabase Realtime. **Chosen: 1.** Realtime can be added later without
changing the stored data.

## How it works

### Data (`0020_notifications.sql`)

`notifications`: `id`, `user_id` (recipient, references `users`), `type`
(text, check-constrained to the types below), `title`, `body` (default `''`),
`link` (relative path), `actor_id` (nullable, who caused it), `created_at`,
`read_at` (null = unread). Index on `(user_id, created_at desc)` and a
partial index on unread rows.

RLS: authenticated users may **select** and **update** only rows where
`user_id = auth.uid()`; there is **no insert or delete policy**. Rows are
created only through the service-role client in `lib/notifications.ts`.

### Creating notifications

`lib/notifications.ts` exports `buildNotifications(input)` (pure: removes the
actor and duplicate recipients, returns rows) and `notify(input)` (server
only: inserts via the admin client; catches and logs any error, never
throws). Server actions call `notify` after their main write succeeds.

### Events and recipients

| Type | Trigger | Recipients | Link |
|---|---|---|---|
| `task_assigned` | task created, or owner changed | the new owner | `/hrm/tasks/[id]` |
| `task_support` | support person newly added | the added people | `/hrm/tasks/[id]` |
| `task_blocked` | status becomes Blocked | owner and creator | `/hrm/tasks/[id]` |
| `task_completed` | status becomes Completed | owner and creator | `/hrm/tasks/[id]` |
| `task_comment` | comment added | owner, creator and support | `/hrm/tasks/[id]` |
| `leave_pending` | leave request submitted | the employee's manager if set, otherwise active HR users | leave page |
| `leave_approved` / `leave_rejected` | decision made (HR or manager) | the employee | `/hrm/leave` |

The actor is never a recipient. Status changes from both the board drag and
the task edit form notify only when the status actually changed.

### UI

Bell (server-rendered count from the app layout, passed into the shell) next
to the theme toggle; `/notifications` page (not a menu tab; reachable from
the bell) with unread dot, title, body, relative time, and a "Mark all as
read" button. Clicking an item runs a server action that marks it read and
redirects to its link.

## Decided by the user

In-app only for now, email via Zoho Mail later; events as listed; creation
in server actions; count refreshes on navigation.

## Builder's calls (please check)

- Gate `/notifications` with `requireUser` only (everyone has it).
- Leave approver link: `/hrm/leave/requests` for HR, `/hrm/leave` for a manager.
- No retention limit; the list shows the latest 100.
- Notification text is plain strings built in the action (no templating).

## Left to the builder

Exact copy of titles and bodies, relative-time formatting, empty state, and
visual styling within the BYC Hub theme.
