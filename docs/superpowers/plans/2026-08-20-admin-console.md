# Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin deactivate/reactivate an employee (with mandatory lead/client reassignment when they own data), reset a password, and see whether the chatbot's provider API keys are configured — without touching the app's "activate = a fresh session's `users` row lookup" security model.

**Architecture:** Extends the existing admin-only `/users` page with new Server Actions; adds one new column (`is_active`); adds one new small `/settings` page. No new tables.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase, Tailwind CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-20-admin-console-design.md](../specs/2026-08-20-admin-console-design.md)

## Global Constraints

- "Delete" means deactivate, never a hard row delete — a true delete is blocked by `activities.user_id`'s `NOT NULL` foreign key the moment that employee has logged any activity, and activities must keep their original author (never reassigned).
- Deactivating a user who owns leads (`assigned_user_id`) or clients (`owner_user_id`) requires the admin to pick another *active* employee to reassign that data to first; zero owned records means immediate deactivation with no reassignment step.
- Activities are never reassigned. Chat conversations/messages (if the chatbot sub-project has landed) are left untouched — they just become unreachable once the account can't log in.
- An admin cannot deactivate their own account.
- Password reset generates a new temp password shown once (same pattern as invite), no email infrastructure.
- API key status is read-only (env var presence check), no key storage in the database.
- Testing: manual QA in the dev server (platform-wide decision) — no automated test suite.
- All writes to the `users` table go through the service-role client (`createAdminSupabaseClient` from `@/lib/supabase/admin`) — the table's RLS has no INSERT/UPDATE/DELETE policy for the regular authenticated role, only a SELECT policy. `leads`/`clients` updates (reassignment) go through the regular authenticated client, since those tables' RLS already grants any employee full read/write.

---

### Task 1: Database migration (MANUAL — human step)

This task requires running SQL against the live Supabase project, which the agent has no
programmatic access to. A human runs this step; the agent's job is to produce the exact
SQL and commit it as a migration file.

**Files:**
- Create: `supabase/migrations/0004_user_deactivation.sql`

**Interfaces:**
- Produces: `users.is_active` column that Tasks 2-5 depend on.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0004_user_deactivation.sql`:

```sql
alter table public.users add column is_active boolean not null default true;
```

- [ ] **Step 2: Human runs the migration**

Hand these instructions to the user:

1. Go to the Supabase dashboard for the `yvnfiihppvderdjhzdyy` project.
2. SQL Editor → paste the contents of `supabase/migrations/0004_user_deactivation.sql` → Run.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0004_user_deactivation.sql
git commit -m "feat: add users.is_active column for employee deactivation"
```

---

### Task 2: Types and validation schemas

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`

**Interfaces:**
- Produces: `is_active: boolean` added to the `users` table's `Row`/`Insert`/`Update`
  types; `deactivateUserSchema` and `userIdSchema` (zod) exported from
  `@/lib/validation`, consumed by Task 4's Server Actions.

- [ ] **Step 1: Add `is_active` to the `users` table type in `types/database.ts`**

Find the `users` entry inside `Database['public']['Tables']`, which currently reads:

```ts
      users: {
        Row: { id: string; email: string; name: string; role: UserRole; created_at: string }
        Insert: { id: string; email: string; name: string; role?: UserRole }
        Update: { name?: string; role?: UserRole }
        Relationships: []
      }
```

Change it to:

```ts
      users: {
        Row: {
          id: string
          email: string
          name: string
          role: UserRole
          is_active: boolean
          created_at: string
        }
        Insert: { id: string; email: string; name: string; role?: UserRole; is_active?: boolean }
        Update: { name?: string; role?: UserRole; is_active?: boolean }
        Relationships: []
      }
```

Nothing else in the file changes — the `clients`/`leads`/`activities` entries, `Views`,
and `Functions` stay exactly as they are.

- [ ] **Step 2: Add the validation schemas to `lib/validation.ts`**

Add at the end of the file:

```ts
export const deactivateUserSchema = z.object({
  userId: z.string().uuid(),
  reassignToUserId: z.string().uuid().optional(),
})

export const userIdSchema = z.object({
  userId: z.string().uuid(),
})
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds (these types/schemas aren't wired into any page yet).

- [ ] **Step 4: Commit**

```bash
git add types/database.ts lib/validation.ts
git commit -m "feat: add is_active user type and deactivation validation schemas"
```

---

### Task 3: Enforce deactivation in the session check

**Files:**
- Modify: `lib/access.ts`

**Interfaces:**
- Consumes: `is_active` field on the `users` table (Task 2).
- Produces: no interface change — `getCurrentUser()`'s existing signature
  (`Promise<CurrentUser | null>`) and the `CurrentUser` interface are unchanged; only its
  internal behavior gains the deactivation check. Every page/action in the app that
  already calls `requireUser()`/`requireAdmin()`/`getCurrentUser()` is automatically
  covered — this task touches no other file.

- [ ] **Step 1: Add the `is_active` check**

`lib/access.ts` currently reads:

```ts
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // Valid Auth session but no employee profile (orphaned invite, bad seed).
    // Returning null alone would make requireUser() bounce to /login, where
    // middleware sees the still-valid session and sends them back — an
    // unbreakable loop in which the layout (and its sign-out button) never
    // renders. Dropping the session turns that loop into a clean stop.
    await supabase.auth.signOut()
    return null
  }

  return profile
}
```

Change it to:

```ts
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    // Valid Auth session but no active employee profile (orphaned invite,
    // bad seed, or a deactivated employee). Returning null alone would make
    // requireUser() bounce to /login, where middleware sees the still-valid
    // session and sends them back — an unbreakable loop in which the layout
    // (and its sign-out button) never renders. Dropping the session turns
    // that loop into a clean stop.
    await supabase.auth.signOut()
    return null
  }

  return { id: profile.id, email: profile.email, name: profile.name, role: profile.role }
}
```

(Everything else in the file — `requireUser`, `requireAdmin`, the `CurrentUser`
interface — stays unchanged. Note the `return` statement now constructs an explicit
object instead of returning `profile` directly, so `is_active` doesn't leak into
`CurrentUser` — nothing downstream needs it.)

- [ ] **Step 2: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add lib/access.ts
git commit -m "feat: deny session access to deactivated users"
```

---

### Task 4: Deactivate/reactivate/reset-password Server Actions

**Files:**
- Modify: `app/(app)/users/actions.ts`
- Modify: `app/(app)/users/invite-result.ts`

**Interfaces:**
- Consumes: `deactivateUserSchema`, `userIdSchema` from `@/lib/validation` (Task 2);
  `createAdminSupabaseClient` from `@/lib/supabase/admin` (already used by the existing
  `inviteUser`); `createClient` from `@/lib/supabase/server`.
- Produces:
  - `deactivateUser(formData)`, `reactivateUser(formData)`, `resetUserPassword(formData)`
    Server Actions — consumed by Task 5's page.
  - `InviteResult.action: 'invited' | 'reset'` (extends the existing `InviteResult`
    interface) — Task 5's page reads this to show the right wording.

- [ ] **Step 1: Extend `invite-result.ts` with an `action` field**

`app/(app)/users/invite-result.ts` currently reads:

```ts
// Shared between the invite Server Action and the /users page. Lives outside
// actions.ts because a 'use server' module may only export async functions.
export const INVITE_RESULT_COOKIE = 'invite_result'

export interface InviteResult {
  email: string
  tempPassword: string
}

export function parseInviteResult(raw: string | undefined): InviteResult | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as InviteResult).email === 'string' &&
      typeof (parsed as InviteResult).tempPassword === 'string'
    ) {
      const { email, tempPassword } = parsed as InviteResult
      return { email, tempPassword }
    }
  } catch {
    // Malformed cookie (hand-edited or truncated) — show nothing.
  }

  return null
}
```

Replace the whole file with:

```ts
// Shared between the invite/reset-password Server Actions and the /users page.
// Lives outside actions.ts because a 'use server' module may only export
// async functions. Reused for both invite and reset-password results since
// both hand back the same shape (an email + a one-time temp password) — the
// `action` field is only there to pick the right wording on display.
export const INVITE_RESULT_COOKIE = 'invite_result'

export interface InviteResult {
  email: string
  tempPassword: string
  action: 'invited' | 'reset'
}

export function parseInviteResult(raw: string | undefined): InviteResult | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as InviteResult).email === 'string' &&
      typeof (parsed as InviteResult).tempPassword === 'string' &&
      ((parsed as InviteResult).action === 'invited' || (parsed as InviteResult).action === 'reset')
    ) {
      const { email, tempPassword, action } = parsed as InviteResult
      return { email, tempPassword, action }
    }
  } catch {
    // Malformed cookie (hand-edited or truncated) — show nothing.
  }

  return null
}
```

- [ ] **Step 2: Update `inviteUser` to set `action: 'invited'`, and add the three new actions**

`app/(app)/users/actions.ts` currently reads:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { INVITE_RESULT_COOKIE } from './invite-result'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { inviteUserSchema } from '@/lib/validation'

function generateTempPassword(): string {
  return Math.random().toString(36).slice(2, 10) + 'A1!'
}

export async function inviteUser(formData: FormData) {
  await requireAdmin()

  const parsed = inviteUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const tempPassword = generateTempPassword()
  const admin = createAdminSupabaseClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
  })

  if (createError || !created.user) {
    redirect('/users?error=' + encodeURIComponent(createError?.message ?? 'Failed to create user'))
  }

  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
  })

  if (profileError) {
    redirect('/users?error=' + encodeURIComponent(profileError.message))
  }

  // The temp password must never travel in the URL — query strings land in
  // browser history, server access logs and Referer headers. Hand it over in a
  // short-lived httpOnly cookie instead; /users reads it once and clears it.
  const cookieStore = await cookies()
  cookieStore.set(INVITE_RESULT_COOKIE, JSON.stringify({ email: parsed.data.email, tempPassword }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/users',
    maxAge: 60,
  })

  revalidatePath('/users')
  redirect('/users')
}

// Clears the one-time invite cookie. A Server Component cannot delete a cookie
// mid-render, so the banner renders with this action wired to its dismiss form.
export async function clearInviteResult() {
  await requireAdmin()
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_RESULT_COOKIE, path: '/users' })
  revalidatePath('/users')
}
```

Replace the whole file with:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { INVITE_RESULT_COOKIE } from './invite-result'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { deactivateUserSchema, inviteUserSchema, userIdSchema } from '@/lib/validation'

function generateTempPassword(): string {
  return Math.random().toString(36).slice(2, 10) + 'A1!'
}

async function setInviteResultCookie(email: string, tempPassword: string, action: 'invited' | 'reset') {
  const cookieStore = await cookies()
  cookieStore.set(INVITE_RESULT_COOKIE, JSON.stringify({ email, tempPassword, action }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/users',
    maxAge: 60,
  })
}

export async function inviteUser(formData: FormData) {
  await requireAdmin()

  const parsed = inviteUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const tempPassword = generateTempPassword()
  const admin = createAdminSupabaseClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
  })

  if (createError || !created.user) {
    redirect('/users?error=' + encodeURIComponent(createError?.message ?? 'Failed to create user'))
  }

  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
  })

  if (profileError) {
    redirect('/users?error=' + encodeURIComponent(profileError.message))
  }

  // The temp password must never travel in the URL — query strings land in
  // browser history, server access logs and Referer headers. Hand it over in a
  // short-lived httpOnly cookie instead; /users reads it once and clears it.
  await setInviteResultCookie(parsed.data.email, tempPassword, 'invited')

  revalidatePath('/users')
  redirect('/users')
}

// Clears the one-time invite/reset-password cookie. A Server Component cannot
// delete a cookie mid-render, so the banner renders with this action wired to
// its dismiss form.
export async function clearInviteResult() {
  await requireAdmin()
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_RESULT_COOKIE, path: '/users' })
  revalidatePath('/users')
}

export async function deactivateUser(formData: FormData) {
  const currentUser = await requireAdmin()

  const parsed = deactivateUserSchema.safeParse({
    userId: formData.get('userId'),
    reassignToUserId: formData.get('reassignToUserId') || undefined,
  })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { userId, reassignToUserId } = parsed.data

  if (userId === currentUser.id) {
    redirect('/users?error=' + encodeURIComponent('You cannot deactivate your own account'))
  }

  const supabase = await createClient()
  const admin = createAdminSupabaseClient()

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_user_id', userId)

  const { count: clientsCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId)

  const ownedCount = (leadsCount ?? 0) + (clientsCount ?? 0)

  if (ownedCount > 0) {
    if (!reassignToUserId || reassignToUserId === userId) {
      redirect(
        '/users?error=' + encodeURIComponent('Pick a different active employee to reassign their leads/clients to')
      )
    }

    const { data: target } = await admin
      .from('users')
      .select('id, is_active')
      .eq('id', reassignToUserId)
      .single()

    if (!target || !target.is_active) {
      redirect('/users?error=' + encodeURIComponent('Reassignment target must be an active employee'))
    }

    await supabase.from('leads').update({ assigned_user_id: reassignToUserId }).eq('assigned_user_id', userId)
    await supabase.from('clients').update({ owner_user_id: reassignToUserId }).eq('owner_user_id', userId)
  }

  const { error } = await admin.from('users').update({ is_active: false }).eq('id', userId)

  if (error) {
    redirect('/users?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/users')
  redirect('/users')
}

export async function reactivateUser(formData: FormData) {
  await requireAdmin()

  const parsed = userIdSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('users').update({ is_active: true }).eq('id', parsed.data.userId)

  if (error) {
    redirect('/users?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/users')
  redirect('/users')
}

export async function resetUserPassword(formData: FormData) {
  await requireAdmin()

  const parsed = userIdSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('users').select('email').eq('id', parsed.data.userId).single()

  if (!profile) {
    redirect('/users?error=' + encodeURIComponent('User not found'))
  }

  const tempPassword = generateTempPassword()
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password: tempPassword })

  if (error) {
    redirect('/users?error=' + encodeURIComponent(error.message))
  }

  await setInviteResultCookie(profile.email, tempPassword, 'reset')

  revalidatePath('/users')
  redirect('/users')
}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors, zero `any`. This file isn't wired into any UI
change yet (Task 5 adds the buttons) — verifying the build is the acceptance bar.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/users/actions.ts" "app/(app)/users/invite-result.ts"
git commit -m "feat: add deactivate, reactivate, and reset-password Server Actions"
```

---

### Task 5: Users page UI — status, deactivate/reactivate/reset buttons, reassignment

**Files:**
- Modify: `app/(app)/users/page.tsx`

**Interfaces:**
- Consumes: `deactivateUser`, `reactivateUser`, `resetUserPassword` from
  `./actions` (Task 4); `InviteResult.action` (Task 4) for the banner wording.

- [ ] **Step 1: Rewrite the page**

`app/(app)/users/page.tsx` currently reads:

```tsx
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { clearInviteResult, inviteUser } from './actions'
import { INVITE_RESULT_COOKIE, parseInviteResult } from './invite-result'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdmin()
  const { error } = await searchParams

  // The temp password arrives in a short-lived httpOnly cookie, never the URL.
  const cookieStore = await cookies()
  const inviteResult = parseInviteResult(cookieStore.get(INVITE_RESULT_COOKIE)?.value)

  const supabase = await createClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Invite user</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        {inviteResult && (
          <div className="mt-2 rounded bg-green-50 p-2 text-sm text-green-700">
            <p>
              Created {inviteResult.email}. Temporary password:{' '}
              <strong>{inviteResult.tempPassword}</strong> — share this with them directly, it will not be
              shown again.
            </p>
            <form action={clearInviteResult}>
              <button type="submit" className="mt-2 underline">
                Dismiss
              </button>
            </form>
          </div>
        )}
        <form action={inviteUser} className="mt-3 grid grid-cols-3 gap-3">
          <input name="name" placeholder="Full name" required className="rounded border px-3 py-2" />
          <input name="email" type="email" placeholder="Email" required className="rounded border px-3 py-2" />
          <select name="role" className="rounded border px-3 py-2">
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="col-span-3 rounded bg-black py-2 text-white">
            Create user
          </button>
        </form>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

Replace the whole file with:

```tsx
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { clearInviteResult, deactivateUser, inviteUser, reactivateUser, resetUserPassword } from './actions'
import { INVITE_RESULT_COOKIE, parseInviteResult } from './invite-result'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireAdmin()
  const { error } = await searchParams

  // The temp password arrives in a short-lived httpOnly cookie, never the URL.
  const cookieStore = await cookies()
  const inviteResult = parseInviteResult(cookieStore.get(INVITE_RESULT_COOKIE)?.value)

  const supabase = await createClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, email, name, role, is_active, created_at')
    .order('created_at', { ascending: false })

  const allUsers = users ?? []
  const activeUsers = allUsers.filter((u) => u.is_active)

  const ownedCounts = new Map<string, number>()
  for (const u of allUsers) {
    const { count: leadsCount } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_user_id', u.id)
    const { count: clientsCount } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', u.id)
    ownedCounts.set(u.id, (leadsCount ?? 0) + (clientsCount ?? 0))
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Invite user</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        {inviteResult && (
          <div className="mt-2 rounded bg-green-50 p-2 text-sm text-green-700">
            <p>
              {inviteResult.action === 'invited' ? 'Created' : 'Reset password for'} {inviteResult.email}. Temporary
              password: <strong>{inviteResult.tempPassword}</strong> — share this with them directly, it will not be
              shown again.
            </p>
            <form action={clearInviteResult}>
              <button type="submit" className="mt-2 underline">
                Dismiss
              </button>
            </form>
          </div>
        )}
        <form action={inviteUser} className="mt-3 grid grid-cols-3 gap-3">
          <input name="name" placeholder="Full name" required className="rounded border px-3 py-2" />
          <input name="email" type="email" placeholder="Email" required className="rounded border px-3 py-2" />
          <select name="role" className="rounded border px-3 py-2">
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="col-span-3 rounded bg-black py-2 text-white">
            Create user
          </button>
        </form>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => {
              const isSelf = u.id === currentUser.id
              const owned = ownedCounts.get(u.id) ?? 0
              const reassignTargets = activeUsers.filter((other) => other.id !== u.id)

              return (
                <tr key={u.id} className="border-b align-top">
                  <td className="py-2">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.is_active ? 'Active' : 'Deactivated'}</td>
                  <td className="space-y-2 py-2">
                    {isSelf && <span className="text-gray-400">You</span>}
                    {!isSelf && u.is_active && (
                      <>
                        <form action={resetUserPassword}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="text-blue-600 underline">
                            Reset password
                          </button>
                        </form>
                        <form action={deactivateUser} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={u.id} />
                          {owned > 0 && (
                            <select name="reassignToUserId" required defaultValue="" className="rounded border px-2 py-1 text-xs">
                              <option value="" disabled>
                                Reassign {owned} record{owned === 1 ? '' : 's'} to…
                              </option>
                              {reassignTargets.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button type="submit" className="text-red-600 underline">
                            Deactivate
                          </button>
                        </form>
                      </>
                    )}
                    {!isSelf && !u.is_active && (
                      <form action={reactivateUser}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button type="submit" className="text-green-700 underline">
                          Reactivate
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors, zero `any`.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/users/page.tsx"
git commit -m "feat: add deactivate/reactivate/reset-password UI to the users page"
```

---

### Task 6: Settings page (API key status) + nav link

**Files:**
- Create: `app/(app)/settings/page.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/access`.

- [ ] **Step 1: Write the settings page**

Create `app/(app)/settings/page.tsx`:

```tsx
import { requireAdmin } from '@/lib/access'

export default async function SettingsPage() {
  await requireAdmin()

  const providers = [
    { name: 'Claude', configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    { name: 'ChatGPT', configured: Boolean(process.env.OPENAI_API_KEY) },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <div>
        <h2 className="text-sm font-medium text-gray-500">AI provider API keys</h2>
        <ul className="mt-2 space-y-2">
          {providers.map((provider) => (
            <li key={provider.name} className="flex items-center gap-2 rounded border p-3 text-sm">
              <span className="w-24">{provider.name}</span>
              <span className={provider.configured ? 'text-green-700' : 'text-yellow-700'}>
                {provider.configured ? 'Configured' : 'Not configured'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          Add ANTHROPIC_API_KEY / OPENAI_API_KEY as environment variables on Vercel (and locally in .env.local) to
          configure a provider.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the nav link**

In `app/(app)/layout.tsx`, the nav currently has the admin-gated Users link reading:

```tsx
          {user.role === 'admin' && (
            <Link href="/users" className="text-sm text-gray-600 hover:text-black">
              Users
            </Link>
          )}
```

Change it to add a "Settings" link right after "Users", inside the same admin-gated
block:

```tsx
          {user.role === 'admin' && (
            <>
              <Link href="/users" className="text-sm text-gray-600 hover:text-black">
                Users
              </Link>
              <Link href="/settings" className="text-sm text-gray-600 hover:text-black">
                Settings
              </Link>
            </>
          )}
```

(Everything else in the file stays unchanged.)

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds. Route table should include `/settings`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/settings/page.tsx" "app/(app)/layout.tsx"
git commit -m "feat: add settings page with API key configuration status"
```

---

### Task 7: End-to-end verification (MANUAL — human ran Task 1's migration first)

**Files:** none (verification only)

- [ ] **Step 1: Manually verify the full flow**

```bash
npm run dev
```

Logged in as the seeded admin:

1. Visit `/users` — table now has Status and Actions columns; every existing user shows
   "Active".
2. Invite a fresh test employee (via the existing invite form) — confirm the temp
   password banner still says "Created ... Temporary password: ..." (the `invited`
   wording), same as before this sub-project. Note the test employee's id from the
   Supabase `users` table (or from the page's rendered row) for the next steps.
3. With the test employee still owning zero leads/clients, click "Deactivate" next to
   them — confirm no reassignment dropdown appears (since they own nothing) and
   deactivation completes immediately; their row now shows "Deactivated" and a
   "Reactivate" button instead of Reset/Deactivate.
4. Click "Reactivate" — confirm they're back to "Active" with Reset/Deactivate buttons
   again.
5. Click "Reset password" for the test employee — confirm the banner now says "Reset
   password for ... Temporary password: ..." (the `reset` wording, distinct from
   `invited`).
6. To test the reassignment path, give the test employee something to reassign. Using a
   small one-off script (same pattern as earlier sub-projects' QA scripts) with the
   service-role client:
   ```js
   import { createClient } from '@supabase/supabase-js'
   const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
   await admin.from('leads').insert({ contact_name: 'Reassignment test lead', assigned_user_id: '<test employee id>' })
   ```
   Run it with `node --env-file=.env.local <script>.mjs`, then delete the script file
   (don't commit it — same convention as prior sub-projects' throwaway verification
   scripts).
7. Click "Deactivate" on the test employee again — confirm the reassignment dropdown now
   appears listing other active employees, that submitting without selecting one shows an
   error, and that selecting a target and submitting both reassigns the lead (check
   `/leads` afterward — it should now show the target employee, not the deactivated one)
   and completes the deactivation.
8. Confirm an admin cannot deactivate themselves — no Deactivate button should appear
   next to your own row (just "You").
9. Sign out and attempt to log in as the deactivated test employee (using the temp
   password from step 5) — confirm login fails or immediately bounces back to `/login`
   rather than granting access.
10. Visit `/settings` — confirm it shows "Not configured" for both providers if the
    chatbot sub-project's API keys aren't set yet in this environment, or "Configured" if
    they are.
11. Clean up: delete the test lead and the test employee (both the `users` row and their
    Supabase Auth account, via the service-role client) so the live database stays clean.

- [ ] **Step 2: No commit** — this task is verification only, nothing to commit.
