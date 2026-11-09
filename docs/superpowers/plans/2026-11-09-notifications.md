# In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bell with unread count and a `/notifications` inbox, fed by Tasks and Leave events.

**Architecture:** Server actions call `notify()` after their main write. Pure builder functions decide recipients and text (unit-tested); `notify` inserts through the service-role client and never throws. The app layout reads the unread count with the RLS client and passes it to the shell.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` first), Supabase, zod 4, vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-notifications-design.md`

## Global Constraints

- Migration `supabase/migrations/0020_notifications.sql`, applied by hand in Supabase.
- RLS: authenticated users may select and update only rows where `user_id = auth.uid()`; no insert or delete policy. Inserts only via `createAdminSupabaseClient()`.
- Notification `type` is one of: `task_assigned`, `task_support`, `task_blocked`, `task_completed`, `task_comment`, `leave_pending`, `leave_approved`, `leave_rejected`.
- The actor is never a recipient; duplicate recipients get one notification; null ids are dropped.
- A failed notification never fails or rolls back the action that caused it.
- `/notifications` gated by `requireUser`; the list shows the latest 100.
- Leave routing (existing invariant): an employee with `employee_profiles.manager_id` routes to that manager only; otherwise to active users with role `hr` or `admin`.
- Theme tokens only, `PageHeader` for headings, tests with vitest (`npm test`), typecheck needs `npx next typegen` first on a clean tree.

## Review Focus

1. A failing insert must not break the calling action (notify resolves, error logged).
2. Assigning a task to yourself, or commenting on your own task, notifies nobody.
3. Owner who is also the creator gets one notification, not two.
4. Unassigned task or null creator: no row with a null recipient, no crash.
5. Saving the task form with an unchanged status or owner creates no notification.
6. Employee without manager and no active HR users: no notification, no crash.
7. A stored link must be a relative path; anything else falls back to `/notifications`.

---

### Task 1: Data and core

**Files:**
- Create: `supabase/migrations/0020_notifications.sql`, `lib/notifications.ts`, `lib/notifications.test.ts`
- Modify: `types/database.ts`

**Interfaces:**
- Produces:
  - `type NotificationType` (the 8 values above)
  - `type NotificationInput = { type: NotificationType; title: string; body?: string; link: string; actorId: string | null; recipientIds: (string | null | undefined)[] }`
  - `buildNotifications(input: NotificationInput): { user_id: string; type: NotificationType; title: string; body: string; link: string; actor_id: string | null }[]`
  - `notify(inputs: NotificationInput | NotificationInput[], client?: { from: SupabaseClient['from'] }): Promise<void>` (server only; default client `createAdminSupabaseClient()`; never throws)
  - `safeLink(link: string): string`

- [ ] **Step 1:** Write the migration: table per spec (`type` check constraint, `read_at`), index `(user_id, created_at desc)`, partial index `where read_at is null`, RLS enabled with select and update policies for `user_id = (select auth.uid())` and none for insert/delete. Add the table's row/insert/update types to `types/database.ts`.
- [ ] **Step 2:** Write failing tests in `lib/notifications.test.ts`: `buildNotifications` drops the actor, dedupes, drops null/undefined recipients and returns `[]` when none remain; `notify` resolves when the injected client's insert returns an error and when it throws, and inserts the built rows once otherwise; `safeLink('/hrm/tasks/1')` is unchanged while `'https://evil.com'`, `'//evil.com'` and `''` return `/notifications`.
- [ ] **Step 3:** Run `npx vitest run lib/notifications.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 4:** Implement the module. `notify` builds rows for each input, skips the insert when there are none, and wraps everything in try/catch with `console.error('[notifications] ...')`.
- [ ] **Step 5:** Run `npx vitest run && npx tsc --noEmit && npx eslint lib types`. Expected: all pass, no output from tsc/eslint.
- [ ] **Step 6:** Commit `feat: notifications table and core`.

### Task 2: Event builders (pure)

**Files:**
- Create: `lib/notification-events.ts`, `lib/notification-events.test.ts`

**Interfaces:**
- Consumes: `NotificationInput` (Task 1).
- Produces (each returns `NotificationInput[]`, empty when nothing to send):
  - `taskAssignmentNotices(a: { taskId: string; title: string; actorId: string; previousOwnerId: string | null; ownerId: string | null; previousSupportIds: string[]; supportIds: string[] })`: `task_assigned` to the owner only when it changed; `task_support` to newly added support ids only.
  - `taskStatusNotices(a: { taskId: string; title: string; actorId: string; previousStatus: string | null; status: string; ownerId: string | null; creatorId: string | null })`: `task_blocked` / `task_completed` to owner and creator only when `status` differs and is `blocked` / `done`.
  - `taskCommentNotices(a: { taskId: string; title: string; actorId: string; ownerId: string | null; creatorId: string | null; supportIds: string[] })`: `task_comment` to owner, creator and support.
  - `leaveSubmittedNotices(a: { requestId: string; employeeName: string; employeeId: string; managerId: string | null; hrIds: string[] })`: to the manager if set (link `/hrm/leave`), otherwise to `hrIds` (link `/hrm/leave/requests`); type `leave_pending`.
  - `leaveDecisionNotice(a: { employeeId: string; actorId: string; status: 'approved' | 'rejected' })`: `leave_approved` / `leave_rejected` to the employee, link `/hrm/leave`.
- Task links are `/hrm/tasks/${taskId}`; titles are short plain sentences naming the task or person.

- [ ] **Step 1:** Write failing tests with exact assertions: assigning to yourself yields no `task_assigned`; unchanged owner yields none; only newly added support ids get `task_support`; status `blocked`→notice to owner and creator, owner===creator gives one recipient after `buildNotifications`; unchanged status or `in_progress` yields `[]`; null owner and null creator yields recipients that `buildNotifications` reduces to `[]`; manager set routes only to the manager; no manager and `hrIds: []` yields no rows after build; decision notice type matches status.
- [ ] **Step 2:** Run `npx vitest run lib/notification-events.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the five functions.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: notification event builders`.

### Task 3: Wire Tasks and Leave

**Files:**
- Modify: `app/(app)/hrm/tasks/actions.ts` (`createTask`, `updateTaskStatus`), `app/(app)/hrm/tasks/[id]/actions.ts` (`updateTask`, `addTaskComment`), `app/(app)/hrm/leave/actions.ts` (`submitLeaveRequest`), `app/(app)/hrm/leave/requests/actions.ts` and `app/(app)/hrm/leave/team-actions.ts` (the shared review function in each)

**Interfaces:**
- Consumes: `notify`, the Task 2 builders.

- [ ] **Step 1:** Tasks: call `notify(...)` after the main write succeeds and before the redirect/return. `createTask`: assignment notices with previous owner/support empty. `updateTaskStatus`: extend its select to `status, title, assignee_id, created_by`; send status notices. `updateTask`: extend its select to include `title, support_ids, created_by`; send assignment and status notices from before/after values. `addTaskComment`: load the task's `title, assignee_id, created_by, support_ids`; send comment notices.
- [ ] **Step 2:** Leave: in `submitLeaveRequest`, look up the employee's `manager_id` and, when none, active user ids with role `hr` or `admin` via the admin client, then send `leaveSubmittedNotices` (employee name from the current user). In both review functions, after the successful update, send `leaveDecisionNotice` to `request.user_id`.
- [ ] **Step 3:** Run `npx next typegen && npx tsc --noEmit && npx eslint app lib && npx vitest run`. Expected: no tsc/eslint output, all tests pass.
- [ ] **Step 4:** Commit `feat: send notifications from task and leave actions`.

### Task 4: Bell, inbox and actions

**Files:**
- Create: `lib/notifications-read.ts`, `components/notification-bell.tsx`, `app/(app)/notifications/page.tsx`, `app/(app)/notifications/actions.ts`
- Modify: `app/(app)/layout.tsx`, `components/app-shell.tsx`

**Interfaces:**
- Consumes: `safeLink` (Task 1).
- Produces:
  - `getUnreadCount(): Promise<number>` (RLS client, `count: 'exact', head: true`, `read_at is null`)
  - `<NotificationBell count: number />` linking to `/notifications`, badge shows `9+` above 9 and is hidden at 0
  - actions `openNotification(formData)` (field `id`: marks that row read where `user_id` is the current user, redirects to `safeLink(link)`) and `markAllRead()`
  - `AppShell` gains prop `unreadCount: number`

- [ ] **Step 1:** Implement `getUnreadCount`, fetch it in `app/(app)/layout.tsx` alongside the existing calls and pass `unreadCount` to `AppShell`; render the bell next to the theme toggle.
- [ ] **Step 2:** Build `/notifications`: latest 100 rows for the user, unread dot and bold title, body, relative time (`Intl.RelativeTimeFormat`), each row a form posting `openNotification`; "Mark all as read" button posting `markAllRead`; empty state "You're all caught up." Both actions use `requireUser`, scope by the current user id, and `revalidatePath('/notifications')`.
- [ ] **Step 3:** Run `npx next typegen && npx tsc --noEmit && npx eslint app components lib && npx vitest run && npx next build`. Expected: no tsc/eslint output, tests pass, build succeeds.
- [ ] **Step 4:** Commit `feat: notification bell and inbox`.

### Task 5: Release check

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Add a "Notifications" README section: apply `0020`, what triggers a notification, and that email via Zoho is planned.
- [ ] **Step 2:** Run the full set: `npx next typegen && npm run lint && npx tsc --noEmit && npm test && npm run build`. Expected: all succeed.
- [ ] **Step 3:** Commit `docs: notifications setup`.
