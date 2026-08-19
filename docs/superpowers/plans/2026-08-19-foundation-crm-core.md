# Foundation + CRM Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the employee-only Next.js + Supabase app with auth, roles, and a CRM (leads pipeline through to active clients).

**Architecture:** Single Next.js 14 App Router (TypeScript) app on Vercel. Supabase provides Postgres, Auth, and Storage. No separate backend — Server Actions talk to Supabase directly.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, @supabase/ssr, @supabase/supabase-js, zod, Node v24.

**Spec:** [docs/superpowers/specs/2026-08-19-foundation-crm-core-design.md](../specs/2026-08-19-foundation-crm-core-design.md)

## Global Constraints

- Employees-only: no public signup route exists anywhere in the app.
- Auth: Supabase Auth, email + password (not magic link, not OAuth).
- Team size 2-10: RLS grants any authenticated user full read/write on `clients`/`leads`/`activities`. No per-client access walls.
- `role` column (`admin`|`employee`) exists now but only gates the `/users` admin page in this sub-project — no other per-role restrictions yet.
- Testing: manual QA in the dev server for this sub-project (explicit spec decision). No automated test suite — that starts with the dashboards/reporting sub-project where calculation logic creates real risk.
- Won lead → client conversion is one continuous record (per spec): a `clients` row is created when a lead's stage becomes `won`, and the lead's `client_id` is set.
- The existing `BYC Agent` folder (lead-chatbot demo, LinkedIn leadgen tool) is a separate, unrelated codebase — not touched by this plan.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `.env.local.example`

**Interfaces:**
- Produces: a buildable Next.js 14 App Router project at the repo root that later tasks add files into.

- [ ] **Step 1: Scaffold the Next.js app**

Run from the repo root (`C:\Users\siree\Downloads\BYC Platform`):

```bash
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --no-turbopack
```

If prompted about existing files (`.git`, `docs/`), confirm continuing — those don't conflict with the scaffold.

- [ ] **Step 2: Install Supabase and validation dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr zod
```

- [ ] **Step 3: Add the env var template**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: build succeeds against the default scaffolded home page.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind and Supabase deps"
```

---

### Task 2: Supabase project + schema (MANUAL — human step)

This task requires creating a Supabase account/project, which is an account-creation action the agent must not perform. A human does this step; the agent's job is to produce the exact SQL to hand them.

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: the `users`, `clients`, `leads`, `activities` tables and RLS policies that every later task's Supabase queries depend on.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0001_init.sql`:

```sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'prospect' check (status in ('prospect', 'active', 'paused', 'lost')),
  owner_user_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  source text,
  contact_name text not null,
  contact_email text,
  contact_company text,
  stage text not null default 'new' check (stage in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  fit_score integer,
  assigned_user_id uuid references public.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id),
  client_id uuid references public.clients(id),
  user_id uuid not null references public.users(id),
  type text not null check (type in ('note', 'call', 'email', 'stage_change')),
  body text,
  created_at timestamptz not null default now(),
  constraint activity_has_target check (lead_id is not null or client_id is not null)
);

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;

-- Any authenticated employee can read all profiles (needed for assignee dropdowns).
-- Writes to `users` go through the service-role key only (admin invite action) — no
-- insert/update policy here is intentional, not an oversight.
create policy "users_select_authenticated" on public.users
  for select using (auth.role() = 'authenticated');

create policy "clients_all_authenticated" on public.clients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "leads_all_authenticated" on public.leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "activities_all_authenticated" on public.activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Human creates the Supabase project and runs the migration**

Hand these instructions to the user — do not attempt to create the account or project:

1. Go to supabase.com, create a project (name it e.g. `byc-platform`).
2. In the Supabase dashboard: SQL Editor → paste the contents of `supabase/migrations/0001_init.sql` → Run.
3. Project Settings → API: copy the Project URL, the `anon` public key, and the `service_role` key.
4. Locally, copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (server-only secret — never expose to the browser, never commit it)

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: add initial Supabase schema (users, clients, leads, activities)"
```

---

### Task 3: Supabase client helpers, types, and route protection

**Files:**
- Create: `types/database.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `middleware.ts`

**Interfaces:**
- Consumes: env vars from Task 2 (`.env.local`).
- Produces:
  - `createClient()` from `@/lib/supabase/client` — browser Supabase client.
  - `createClient()` from `@/lib/supabase/server` (async) — server Supabase client bound to request cookies.
  - `createAdminSupabaseClient()` from `@/lib/supabase/admin` — service-role client, server-only.
  - `Database` type from `@/types/database`.

- [ ] **Step 1: Write the database types**

Create `types/database.ts`:

```ts
export type UserRole = 'admin' | 'employee'
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'lost'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
export type ActivityType = 'note' | 'call' | 'email' | 'stage_change'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; name: string; role: UserRole; created_at: string }
        Insert: { id: string; email: string; name: string; role?: UserRole }
        Update: { name?: string; role?: UserRole }
      }
      clients: {
        Row: { id: string; name: string; status: ClientStatus; owner_user_id: string | null; created_at: string }
        Insert: { name: string; status?: ClientStatus; owner_user_id?: string | null }
        Update: { name?: string; status?: ClientStatus; owner_user_id?: string | null }
      }
      leads: {
        Row: {
          id: string
          client_id: string | null
          source: string | null
          contact_name: string
          contact_email: string | null
          contact_company: string | null
          stage: LeadStage
          fit_score: number | null
          assigned_user_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          source?: string | null
          contact_name: string
          contact_email?: string | null
          contact_company?: string | null
          stage?: LeadStage
          fit_score?: number | null
          assigned_user_id?: string | null
          notes?: string | null
        }
        Update: Partial<{
          client_id: string | null
          stage: LeadStage
          fit_score: number | null
          assigned_user_id: string | null
          notes: string | null
          updated_at: string
        }>
      }
      activities: {
        Row: {
          id: string
          lead_id: string | null
          client_id: string | null
          user_id: string
          type: ActivityType
          body: string | null
          created_at: string
        }
        Insert: {
          lead_id?: string | null
          client_id?: string | null
          user_id: string
          type: ActivityType
          body?: string | null
        }
        Update: never
      }
    }
  }
}
```

- [ ] **Step 2: Write the browser client**

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Write the server client**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component render; middleware refreshes
            // the session on the next request instead.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 4: Write the admin (service-role) client**

Create `lib/supabase/admin.ts`:

```ts
import { createClient as createRawClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service-role client: bypasses RLS. Import only from server-only code
// (Server Actions), never from a Client Component.
export function createAdminSupabaseClient() {
  return createRawClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 5: Write the middleware for session refresh and route protection**

Create `middleware.ts` (repo root):

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname === '/login'

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/leads'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 6: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add types/database.ts lib/supabase middleware.ts
git commit -m "feat: add Supabase client helpers, DB types, and route protection middleware"
```

---

### Task 4: Auth helpers, login page, logout

**Files:**
- Create: `lib/access.ts`, `app/login/actions.ts`, `app/login/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (Task 3).
- Produces:
  - `getCurrentUser()`, `requireUser()`, `requireAdmin()` from `@/lib/access` — used by every authenticated page/layout from here on.
  - `login(formData)`, `logout()` server actions from `@/app/login/actions`.

- [ ] **Step 1: Write the access-control helpers**

Create `lib/access.ts`:

```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: UserRole
}

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

  return profile
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/leads')
  return user
}
```

- [ ] **Step 2: Write the login/logout Server Actions**

Create `app/login/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email and password are required'))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  redirect('/leads')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 3: Write the login page**

Create `app/login/page.tsx`:

```tsx
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">BYC Platform</h1>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <button type="submit" className="w-full rounded bg-black py-2 text-white">
          Sign in
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`, open `http://localhost:3000/login`. Expected: redirected here automatically (middleware) since no session exists yet. Login won't succeed until Task 11 seeds an admin user — that's expected at this point; just confirm the page renders and an invalid login shows the Supabase error message inline.

- [ ] **Step 5: Commit**

```bash
git add lib/access.ts app/login
git commit -m "feat: add login page and auth helpers"
```

---

### Task 5: Authenticated app shell

**Files:**
- Create: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `requireUser` from `@/lib/access` (Task 4), `logout` from `@/app/login/actions` (Task 4).
- Produces: the layout every page under `app/(app)/` renders inside (nav with Leads/Clients/Users links, sign-out).

- [ ] **Step 1: Write the layout**

Create `app/(app)/layout.tsx`:

```tsx
import Link from 'next/link'
import { requireUser } from '@/lib/access'
import { logout } from '@/app/login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">BYC Platform</span>
          <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
            Leads
          </Link>
          <Link href="/clients" className="text-sm text-gray-600 hover:text-black">
            Clients
          </Link>
          {user.role === 'admin' && (
            <Link href="/users" className="text-sm text-gray-600 hover:text-black">
              Users
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user.name}</span>
          <form action={logout}>
            <button type="submit" className="text-gray-600 underline hover:text-black">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
```

Expected: succeeds. (No routes render inside this layout yet until Task 7.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat: add authenticated app shell with nav"
```

---

### Task 6: Validation schemas

**Files:**
- Create: `lib/validation.ts`

**Interfaces:**
- Produces: `leadStages`, `clientStatuses`, `activityTypes` (const arrays), and `createLeadSchema`, `updateStageSchema`, `addActivitySchema`, `inviteUserSchema` (zod schemas) — consumed by every Server Action in Tasks 7-10 and by the lead-detail page's stage `<select>` (Task 8).

- [ ] **Step 1: Write the schemas**

Create `lib/validation.ts`:

```ts
import { z } from 'zod'

export const leadStages = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const
export const clientStatuses = ['prospect', 'active', 'paused', 'lost'] as const
export const activityTypes = ['note', 'call', 'email', 'stage_change'] as const

export const createLeadSchema = z.object({
  contact_name: z.string().trim().min(1, 'Contact name is required'),
  contact_email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  contact_company: z.string().trim().optional().or(z.literal('')),
  source: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})

export const updateStageSchema = z.object({
  leadId: z.string().uuid(),
  stage: z.enum(leadStages),
})

export const addActivitySchema = z
  .object({
    leadId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    type: z.enum(activityTypes),
    body: z.string().trim().min(1, 'Activity body is required'),
  })
  .refine((data) => data.leadId || data.clientId, {
    message: 'Activity must be attached to a lead or a client',
  })

export const inviteUserSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  name: z.string().trim().min(1, 'Name is required'),
  role: z.enum(['admin', 'employee']),
})
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
```

Expected: succeeds (schemas aren't wired to any page yet, but must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add lib/validation.ts
git commit -m "feat: add zod validation schemas for leads, activities, and user invites"
```

---

### Task 7: Leads list + create

**Files:**
- Create: `app/(app)/leads/actions.ts`, `app/(app)/leads/page.tsx`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `requireUser` (`@/lib/access`), `createLeadSchema` (`@/lib/validation`).
- Produces: `createLead(formData)` Server Action — also consumed nowhere else, but establishes the pattern Task 8 extends in the same file.

- [ ] **Step 1: Write the create-lead action**

Create `app/(app)/leads/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/access'
import { createLeadSchema } from '@/lib/validation'

export async function createLead(formData: FormData) {
  const user = await requireUser()

  const parsed = createLeadSchema.safeParse({
    contact_name: formData.get('contact_name'),
    contact_email: formData.get('contact_email'),
    contact_company: formData.get('contact_company'),
    source: formData.get('source'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect('/leads?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { error } = await supabase.from('leads').insert({
    contact_name: parsed.data.contact_name,
    contact_email: parsed.data.contact_email || null,
    contact_company: parsed.data.contact_company || null,
    source: parsed.data.source || null,
    notes: parsed.data.notes || null,
    assigned_user_id: user.id,
  })

  if (error) {
    redirect('/leads?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/leads')
  redirect('/leads')
}
```

- [ ] **Step 2: Write the leads list + create-form page**

Create `app/(app)/leads/page.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createLead } from './actions'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, contact_name, contact_company, stage, source, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">New lead</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <form action={createLead} className="mt-3 grid grid-cols-2 gap-3">
          <input name="contact_name" placeholder="Contact name" required className="rounded border px-3 py-2" />
          <input name="contact_email" placeholder="Email" className="rounded border px-3 py-2" />
          <input name="contact_company" placeholder="Company" className="rounded border px-3 py-2" />
          <input name="source" placeholder="Source" className="rounded border px-3 py-2" />
          <textarea name="notes" placeholder="Notes" className="col-span-2 rounded border px-3 py-2" />
          <button type="submit" className="col-span-2 rounded bg-black py-2 text-white">
            Add lead
          </button>
        </form>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Leads</h1>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Contact</th>
              <th>Company</th>
              <th>Stage</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {(leads ?? []).map((lead) => (
              <tr key={lead.id} className="border-b">
                <td className="py-2">
                  <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline">
                    {lead.contact_name}
                  </Link>
                </td>
                <td>{lead.contact_company ?? '—'}</td>
                <td>{lead.stage}</td>
                <td>{lead.source ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Manually verify**

This requires Task 2's Supabase project and Task 11's seeded admin to be live. If those aren't done yet, skip live verification and just confirm `npm run build` succeeds; come back and click through once the full stack is wired (end of Task 11).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/leads/actions.ts" "app/(app)/leads/page.tsx"
git commit -m "feat: add leads list and create-lead form"
```

---

### Task 8: Lead detail — stage changes, activity log, client conversion

**Files:**
- Modify: `app/(app)/leads/actions.ts` (add `updateLeadStage`, `addActivity`, and the internal `convertLeadToClient` helper)
- Create: `app/(app)/leads/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateStageSchema`, `addActivitySchema` (`@/lib/validation`), `leadStages` (`@/lib/validation`).
- Produces: `updateLeadStage(formData)`, `addActivity(formData)` — `addActivity` is reused by the client-detail page in Task 9, so its `FormData` contract must stay exactly: optional `leadId`, optional `clientId` (at least one required), required `type`, required `body`.

- [ ] **Step 1: Extend the actions file**

Append to `app/(app)/leads/actions.ts` (after the existing `createLead` function, keeping the existing imports and adding to them):

```ts
// Add to the existing import from '@/lib/validation':
// import { createLeadSchema, updateStageSchema, addActivitySchema } from '@/lib/validation'

export async function updateLeadStage(formData: FormData) {
  const user = await requireUser()

  const parsed = updateStageSchema.safeParse({
    leadId: formData.get('leadId'),
    stage: formData.get('stage'),
  })

  if (!parsed.success) {
    redirect(`/leads/${formData.get('leadId')}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { leadId, stage } = parsed.data

  const { error: updateError } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (updateError) {
    redirect(`/leads/${leadId}?error=` + encodeURIComponent(updateError.message))
  }

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'stage_change',
    body: `Stage changed to ${stage}`,
  })

  if (stage === 'won') {
    await convertLeadToClient(leadId, supabase)
  }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  redirect(`/leads/${leadId}`)
}

async function convertLeadToClient(leadId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: lead } = await supabase
    .from('leads')
    .select('id, client_id, contact_company, contact_name, assigned_user_id')
    .eq('id', leadId)
    .single()

  if (!lead || lead.client_id) return

  const { data: client } = await supabase
    .from('clients')
    .insert({
      name: lead.contact_company || lead.contact_name,
      status: 'active',
      owner_user_id: lead.assigned_user_id,
    })
    .select('id')
    .single()

  if (client) {
    await supabase.from('leads').update({ client_id: client.id }).eq('id', leadId)
  }
}

export async function addActivity(formData: FormData) {
  const user = await requireUser()

  const rawLeadId = formData.get('leadId')
  const rawClientId = formData.get('clientId')

  const parsed = addActivitySchema.safeParse({
    leadId: rawLeadId ? String(rawLeadId) : undefined,
    clientId: rawClientId ? String(rawClientId) : undefined,
    type: formData.get('type'),
    body: formData.get('body'),
  })

  const returnPath = rawLeadId ? `/leads/${rawLeadId}` : `/clients/${rawClientId}`

  if (!parsed.success) {
    redirect(`${returnPath}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { error } = await supabase.from('activities').insert({
    lead_id: parsed.data.leadId ?? null,
    client_id: parsed.data.clientId ?? null,
    user_id: user.id,
    type: parsed.data.type,
    body: parsed.data.body,
  })

  if (error) {
    redirect(`${returnPath}?error=` + encodeURIComponent(error.message))
  }

  revalidatePath(returnPath)
  redirect(returnPath)
}
```

Update the top of `app/(app)/leads/actions.ts` so the import line reads:

```ts
import { createLeadSchema, updateStageSchema, addActivitySchema } from '@/lib/validation'
```

- [ ] **Step 2: Write the lead detail page**

Create `app/(app)/leads/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { leadStages } from '@/lib/validation'
import { updateLeadStage, addActivity } from '../actions'

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, contact_name, contact_company, contact_email, stage, source, notes, client_id')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, body, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div>
        <h1 className="text-lg font-semibold">{lead.contact_name}</h1>
        <p className="text-sm text-gray-600">
          {lead.contact_company} · {lead.contact_email}
        </p>
        <p className="mt-2 text-sm">{lead.notes}</p>

        {lead.client_id ? (
          <p className="mt-2 text-sm text-green-700">Converted to client.</p>
        ) : (
          <form action={updateLeadStage} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="stage" defaultValue={lead.stage} className="rounded border px-3 py-2">
              {leadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              Update stage
            </button>
          </form>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <form action={addActivity} className="mt-3 space-y-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <select name="type" className="rounded border px-3 py-2">
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
          <textarea name="body" placeholder="What happened?" required className="w-full rounded border px-3 py-2" />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Add activity
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(activities ?? []).map((activity) => (
            <li key={activity.id} className="rounded border p-2 text-sm">
              <span className="font-medium">{activity.type}</span> — {activity.body}
              <div className="text-xs text-gray-500">{new Date(activity.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/leads"
git commit -m "feat: add lead detail page with stage changes, activity log, and client conversion"
```

---

### Task 9: Clients list + detail

**Files:**
- Create: `app/(app)/clients/page.tsx`, `app/(app)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `addActivity` from `@/app/(app)/leads/actions` (Task 8) — same Server Action, called with `clientId` instead of `leadId`.

- [ ] **Step 1: Write the clients list page**

Create `app/(app)/clients/page.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-lg font-semibold">Clients</h1>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="py-2">Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(clients ?? []).map((client) => (
            <tr key={client.id} className="border-b">
              <td className="py-2">
                <Link href={`/clients/${client.id}`} className="text-blue-600 hover:underline">
                  {client.name}
                </Link>
              </td>
              <td>{client.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Write the client detail page**

Create `app/(app)/clients/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addActivity } from '../../leads/actions'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase.from('clients').select('id, name, status').eq('id', id).single()

  if (!client) notFound()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, body, created_at')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">{client.name}</h1>
        <p className="text-sm text-gray-600">Status: {client.status}</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Activity</h2>
        <form action={addActivity} className="mt-3 space-y-2">
          <input type="hidden" name="clientId" value={client.id} />
          <select name="type" className="rounded border px-3 py-2">
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
          <textarea name="body" placeholder="What happened?" required className="w-full rounded border px-3 py-2" />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Add activity
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(activities ?? []).map((activity) => (
            <li key={activity.id} className="rounded border p-2 text-sm">
              <span className="font-medium">{activity.type}</span> — {activity.body}
              <div className="text-xs text-gray-500">{new Date(activity.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/clients"
git commit -m "feat: add clients list and detail pages"
```

---

### Task 10: Admin user management

**Files:**
- Create: `app/(app)/users/actions.ts`, `app/(app)/users/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/access`), `createAdminSupabaseClient` (`@/lib/supabase/admin`), `inviteUserSchema` (`@/lib/validation`).
- Produces: `inviteUser(formData)` Server Action, admin-only.

- [ ] **Step 1: Write the invite action**

Create `app/(app)/users/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
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

  revalidatePath('/users')
  redirect('/users?tempPassword=' + encodeURIComponent(tempPassword) + '&for=' + encodeURIComponent(parsed.data.email))
}
```

- [ ] **Step 2: Write the users page**

Create `app/(app)/users/page.tsx`:

```tsx
import { requireAdmin } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { inviteUser } from './actions'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tempPassword?: string; for?: string }>
}) {
  await requireAdmin()
  const { error, tempPassword, for: invitedEmail } = await searchParams

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
        {tempPassword && (
          <p className="mt-2 rounded bg-green-50 p-2 text-sm text-green-700">
            Created {invitedEmail}. Temporary password: <strong>{tempPassword}</strong> — share this with them
            directly, it will not be shown again.
          </p>
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

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/users"
git commit -m "feat: add admin user invite and management page"
```

---

### Task 11: Seed the first admin, then verify end-to-end

**Files:**
- Create: `scripts/seed-admin.mjs`

**Interfaces:**
- Produces: a one-off CLI script, not imported by app code.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-admin.mjs`:

```js
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const [, , email, name, password] = process.argv

if (!url || !serviceKey || !email || !name || !password) {
  console.error('Usage: node --env-file=.env.local scripts/seed-admin.mjs <email> <name> <password>')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})

if (createError || !created.user) {
  console.error('Failed to create auth user:', createError?.message)
  process.exit(1)
}

const { error: profileError } = await admin.from('users').insert({
  id: created.user.id,
  email,
  name,
  role: 'admin',
})

if (profileError) {
  console.error('Failed to create profile row:', profileError.message)
  process.exit(1)
}

console.log(`Admin user created: ${email}`)
```

- [ ] **Step 2: Run it (requires Task 2's `.env.local` to be filled in)**

```bash
node --env-file=.env.local scripts/seed-admin.mjs you@byc.example "Your Name" "SomeTempPass123!"
```

Expected output: `Admin user created: you@byc.example`

- [ ] **Step 3: Manually verify the full flow**

```bash
npm run dev
```

In the browser:
1. Visit `http://localhost:3000` — redirected to `/login`.
2. Log in with the email/password from Step 2 — redirected to `/leads`.
3. Create a lead via the form — it appears in the table below.
4. Click into the lead, add a note activity — it appears in the activity list.
5. Change the lead's stage to `won` — redirected back to the lead page, it now shows "Converted to client."
6. Click "Clients" in the nav — the new client appears.
7. Click into the client, add an activity — it appears in the activity list.
8. Click "Users" in the nav (visible because this account has role `admin`) — invite a second user with role `employee`, note the temp password shown once.
9. Sign out, log in as the new employee account — confirm "Users" is not in the nav (non-admin).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-admin.mjs
git commit -m "feat: add admin-seeding script"
```

---

### Task 12: Deploy to Vercel (MANUAL — human step)

Deploying requires a Vercel account/login, which the agent must not create or authenticate on the user's behalf.

- [ ] **Step 1: Human connects the repo to Vercel**

1. Push this repo to a GitHub/GitLab/Bitbucket remote (ask the user which one, and get explicit confirmation before pushing anywhere).
2. In the Vercel dashboard: New Project → import the repo.
3. Add environment variables (same three from `.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy.

- [ ] **Step 2: Verify the deployed app**

Visit the Vercel-assigned URL, confirm `/login` loads and the seeded admin can sign in.
