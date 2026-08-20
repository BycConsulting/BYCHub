# Dashboards + KPI Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a team-wide `/dashboard` page showing CRM funnel and activity metrics, computed from the existing `leads`/`clients`/`activities`/`users` tables.

**Architecture:** A new Server Component route fetches the full row sets from existing tables and hands them to a pure-function metrics module; the page renders the results as Tailwind stat tiles and plain CSS bars.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase (existing tables only), Tailwind CSS. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-08-20-dashboards-kpi-engine-design.md](../specs/2026-08-20-dashboards-kpi-engine-design.md)

## Global Constraints

- No new database tables, columns, or RLS policies — this sub-project reads the existing `leads`, `clients`, `activities`, `users` tables, already covered by sub-project 1's employee-membership RLS policies.
- All-time totals only: no date-range filtering, no per-user ("my numbers") filtering.
- No charting library: plain Tailwind-styled `<div>` bars, matching the app's zero-extra-dependency pattern.
- Testing: manual QA in the dev server (platform-wide decision, carried forward from sub-project 1's spec) — no automated test suite.
- Empty data must not crash: zero leads/clients renders `0` / "No data yet", not a JS error from empty-array math (e.g. win rate with 0 won+lost shows `—`, not `NaN%`).
- A failed Supabase query must render an inline error message, not crash the page.

---

### Task 1: Metrics module

**Files:**
- Create: `lib/metrics.ts`

**Interfaces:**
- Consumes: `LeadStage`, `ClientStatus` types from `@/types/database` (already exist from sub-project 1).
- Produces (all pure functions, no I/O):
  - `leadStageOrder: readonly LeadStage[]` — `['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']`
  - `countLeadsByStage(leads: LeadRow[]): Record<LeadStage, number>`
  - `countLeadsBySource(leads: LeadRow[]): { source: string; count: number }[]` — sorted descending by count
  - `computeWinRate(leads: LeadRow[]): number | null` — percentage 0-100, or `null` if won+lost is 0
  - `countClientsByStatus(clients: ClientRow[]): Record<ClientStatus, number>`
  - `computeAvgTimeToWonDays(leads: LeadRow[], activities: ActivityRow[]): number | null` — average days, or `null` if no won lead has a matching stage-change activity
  - `countActivitiesByUser(activities: ActivityRow[], users: UserRow[]): { name: string; count: number }[]` — sorted descending by count
  - Row types `LeadRow`, `ClientRow`, `ActivityRow`, `UserRow` (exported, used by Task 2's Supabase `.select()` calls to know exactly which columns to fetch)

- [ ] **Step 1: Write the metrics module**

Create `lib/metrics.ts`:

```ts
import type { LeadStage, ClientStatus } from '@/types/database'

export interface LeadRow {
  id: string
  stage: LeadStage
  source: string | null
  created_at: string
}

export interface ClientRow {
  status: ClientStatus
}

export interface ActivityRow {
  lead_id: string | null
  type: string
  body: string | null
  user_id: string
  created_at: string
}

export interface UserRow {
  id: string
  name: string
}

export const leadStageOrder: readonly LeadStage[] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost',
]

export function countLeadsByStage(leads: LeadRow[]): Record<LeadStage, number> {
  const counts: Record<LeadStage, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    proposal: 0,
    won: 0,
    lost: 0,
  }
  for (const lead of leads) {
    counts[lead.stage] += 1
  }
  return counts
}

export function countLeadsBySource(leads: LeadRow[]): { source: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const lead of leads) {
    const key = lead.source?.trim() || 'Unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}

export function computeWinRate(leads: LeadRow[]): number | null {
  const won = leads.filter((lead) => lead.stage === 'won').length
  const lost = leads.filter((lead) => lead.stage === 'lost').length
  const total = won + lost
  if (total === 0) return null
  return (won / total) * 100
}

export function countClientsByStatus(clients: ClientRow[]): Record<ClientStatus, number> {
  const counts: Record<ClientStatus, number> = {
    prospect: 0,
    active: 0,
    paused: 0,
    lost: 0,
  }
  for (const client of clients) {
    counts[client.status] += 1
  }
  return counts
}

export function computeAvgTimeToWonDays(leads: LeadRow[], activities: ActivityRow[]): number | null {
  const wonLeads = leads.filter((lead) => lead.stage === 'won')
  const durations: number[] = []

  for (const lead of wonLeads) {
    const wonActivity = activities.find(
      (activity) =>
        activity.lead_id === lead.id &&
        activity.type === 'stage_change' &&
        activity.body === 'Stage changed to won'
    )
    if (!wonActivity) continue

    const createdMs = new Date(lead.created_at).getTime()
    const wonMs = new Date(wonActivity.created_at).getTime()
    const days = (wonMs - createdMs) / (1000 * 60 * 60 * 24)
    if (days >= 0) durations.push(days)
  }

  if (durations.length === 0) return null
  return durations.reduce((sum, days) => sum + days, 0) / durations.length
}

export function countActivitiesByUser(
  activities: ActivityRow[],
  users: UserRow[]
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    counts.set(activity.user_id, (counts.get(activity.user_id) ?? 0) + 1)
  }

  const nameById = new Map(users.map((user) => [user.id, user.name]))

  return Array.from(counts.entries())
    .map(([userId, count]) => ({ name: nameById.get(userId) ?? 'Unknown', count }))
    .sort((a, b) => b.count - a.count)
}
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
```

Expected: succeeds (this module isn't wired into any page yet, but must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add lib/metrics.ts
git commit -m "feat: add dashboard metrics computation module"
```

---

### Task 2: Dashboard page + nav link

**Files:**
- Create: `app/(app)/dashboard/page.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (sub-project 1); `leadStageOrder`, `countLeadsByStage`, `countLeadsBySource`, `computeWinRate`, `countClientsByStatus`, `computeAvgTimeToWonDays`, `countActivitiesByUser` and the `LeadRow`/`ClientRow`/`ActivityRow`/`UserRow` types from `@/lib/metrics` (Task 1).

- [ ] **Step 1: Write the dashboard page**

Create `app/(app)/dashboard/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import {
  leadStageOrder,
  countLeadsByStage,
  countLeadsBySource,
  computeWinRate,
  countClientsByStatus,
  computeAvgTimeToWonDays,
  countActivitiesByUser,
} from '@/lib/metrics'

const clientStatusOrder = ['prospect', 'active', 'paused', 'lost'] as const

export default async function DashboardPage() {
  const supabase = await createClient()

  const [leadsRes, clientsRes, activitiesRes, usersRes] = await Promise.all([
    supabase.from('leads').select('id, stage, source, created_at'),
    supabase.from('clients').select('status'),
    supabase.from('activities').select('lead_id, type, body, user_id, created_at'),
    supabase.from('users').select('id, name'),
  ])

  const queryError = leadsRes.error || clientsRes.error || activitiesRes.error || usersRes.error
  if (queryError) {
    return (
      <div className="rounded bg-red-50 p-4 text-sm text-red-600">
        Failed to load dashboard data: {queryError.message}
      </div>
    )
  }

  const leads = leadsRes.data ?? []
  const clients = clientsRes.data ?? []
  const activities = activitiesRes.data ?? []
  const users = usersRes.data ?? []

  const byStage = countLeadsByStage(leads)
  const bySource = countLeadsBySource(leads)
  const winRate = computeWinRate(leads)
  const byStatus = countClientsByStatus(clients)
  const avgDays = computeAvgTimeToWonDays(leads, activities)
  const byUser = countActivitiesByUser(activities, users)

  const maxStageCount = Math.max(1, ...Object.values(byStage))
  const maxSourceCount = Math.max(1, ...bySource.map((entry) => entry.count))
  const maxUserCount = Math.max(1, ...byUser.map((entry) => entry.count))

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Total leads</div>
          <div className="text-2xl font-semibold">{leads.length}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Win rate</div>
          <div className="text-2xl font-semibold">
            {winRate === null ? '—' : `${winRate.toFixed(0)}%`}
          </div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Avg time to won</div>
          <div className="text-2xl font-semibold">
            {avgDays === null ? '—' : `${avgDays.toFixed(1)}d`}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Leads by stage</h2>
        <div className="mt-3 space-y-2">
          {leadStageOrder.map((stage) => (
            <div key={stage} className="flex items-center gap-2">
              <div className="w-24 text-sm capitalize">{stage}</div>
              <div className="h-4 flex-1 rounded bg-gray-100">
                <div
                  className="h-4 rounded bg-black"
                  style={{ width: `${(byStage[stage] / maxStageCount) * 100}%` }}
                />
              </div>
              <div className="w-8 text-right text-sm">{byStage[stage]}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Leads by source</h2>
        {bySource.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No data yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {bySource.map(({ source, count }) => (
              <div key={source} className="flex items-center gap-2">
                <div className="w-24 truncate text-sm">{source}</div>
                <div className="h-4 flex-1 rounded bg-gray-100">
                  <div
                    className="h-4 rounded bg-black"
                    style={{ width: `${(count / maxSourceCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-sm">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Clients by status</h2>
        <div className="mt-3 grid grid-cols-4 gap-4">
          {clientStatusOrder.map((status) => (
            <div key={status} className="rounded border p-4">
              <div className="text-sm capitalize text-gray-500">{status}</div>
              <div className="text-xl font-semibold">{byStatus[status]}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Activity by teammate</h2>
        {byUser.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No activity yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {byUser.map(({ name, count }) => (
              <div key={name} className="flex items-center gap-2">
                <div className="w-24 truncate text-sm">{name}</div>
                <div className="h-4 flex-1 rounded bg-gray-100">
                  <div
                    className="h-4 rounded bg-black"
                    style={{ width: `${(count / maxUserCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-sm">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the nav link**

In `app/(app)/layout.tsx`, the nav currently reads:

```tsx
        <div className="flex items-center gap-4">
          <span className="font-semibold">BYC Hub</span>
          <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
            Leads
          </Link>
```

Change it to add a "Dashboard" link right after the "BYC Hub" span and before the "Leads" link:

```tsx
        <div className="flex items-center gap-4">
          <span className="font-semibold">BYC Hub</span>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
            Dashboard
          </Link>
          <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
            Leads
          </Link>
```

(Everything else in the file — Clients link, admin-gated Users link, sign-out form — stays unchanged.)

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors. Route table should now include `/dashboard`.

- [ ] **Step 4: Manually verify**

```bash
npm run dev
```

Log in with the seeded admin account. Click "Dashboard" in the nav. Expected:
- Page loads with no error, even with zero leads/clients (stat tiles show `0`, win rate shows `—`, avg time to won shows `—`, the source/activity sections show "No data yet." / "No activity yet.").
- Create a couple of test leads with different sources and stages via the Leads page, convert one to `won`, add an activity or two, then reload `/dashboard` — confirm the stage/source bar widths and counts update correctly, win rate becomes a real percentage, and "Activity by teammate" shows your name with the right count.
- Clean up any test data you created via the Leads/Clients pages when done, so the live database stays clean (consistent with how sub-project 1's QA was left).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" "app/(app)/layout.tsx"
git commit -m "feat: add team dashboard with CRM funnel and activity metrics"
```
