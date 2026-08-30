# Client Marketing Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any employee log monthly digital-marketing metrics (SEO, ad
platforms, email, social, content, web/CRO — catalog-driven, plus custom)
against a client, and view a per-client dashboard of trend charts to
export/send to that client.

**Architecture:** Two new tables (`client_metric_catalog`, seeded;
`client_metrics`) under the existing `clients` module gate — no new module
key. A "Metrics" section is added to the existing `/clients/[id]` page for
entry, and a new `/clients/[id]/dashboard` route renders one `recharts`
line chart per metric with 2+ months of data.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (`@supabase/ssr`,
RLS-scoped client only — no service-role client needed for this
sub-project), Tailwind CSS v4, zod, `recharts` (new dependency, added in
Task 3).

**Spec:** `docs/superpowers/specs/2026-08-30-client-marketing-metrics-design.md`

## Global Constraints

- No automated test suite in this repo — `npm run build` succeeding with
  zero TypeScript errors is the acceptance bar for every task.
- Every single-row Supabase lookup (`.single()`) must capture the `error`
  and check `error.code !== 'PGRST116'` (throwing a real error) before
  falling through to `notFound()` on a genuinely missing row — never
  discard the error and call `notFound()` unconditionally. This is an
  established convention in this codebase (see
  `app/hrm/directory/[id]/page.tsx`); the existing `/clients/[id]` lookup
  predates it and gets fixed as part of Task 2 since that task already
  rewrites the file.
- All reads/writes in this sub-project use the RLS-scoped client
  (`createClient()` from `@/lib/supabase/server`), never
  `createAdminSupabaseClient()` — matches the existing all-employee access
  pattern already in place for `clients`/`leads`/`activities`.
- `client_metrics.period` is always stored as `YYYY-MM-01` (first of
  month). Forms use `<input type="month">`, which produces `YYYY-MM`; every
  write appends `-01` before it reaches the database.
- Re-submitting the same `client_id` + `period` + `channel` +
  `metric_label` upserts (Supabase `.upsert(row, { onConflict: '...' })`)
  instead of creating a duplicate row. This is the only "edit" mechanism
  for a metric value — there is no separate edit form; re-using the entry
  form for an already-logged metric/month overwrites it.

---

### Task 1: Migration, types, validation, and catalog helper

**Files:**
- Create: `supabase/migrations/0015_client_metrics.sql`
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`
- Create: `lib/metric-catalog.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this plan).
- Produces:
  - DB tables `client_metric_catalog` (columns: `id`, `channel`,
    `metric_key`, `label`, `unit`, `sort_order`) and `client_metrics`
    (columns: `id`, `client_id`, `period`, `channel`, `metric_key`,
    `metric_label`, `value`, `unit`, `notes`, `created_by`, `created_at`,
    `updated_at`), both typed in `Database['public']['Tables']` so
    `supabase.from('client_metric_catalog')` / `.from('client_metrics')`
    are fully typed in later tasks.
  - `lib/validation.ts`: `addClientMetricSchema` (fields: `clientId`,
    `period`, `channel`, `metricKey`, `metricLabel`, `value`, `unit`,
    `notes`) and `deleteClientMetricSchema` (fields: `metricId`,
    `clientId`) — exact zod shapes below, used verbatim by Task 2's
    actions.
  - `lib/metric-catalog.ts`: `export interface CatalogMetric { channel:
    string; metricKey: string; label: string; unit: string }` and
    `export async function getMetricCatalog(): Promise<CatalogMetric[]>` —
    returns every catalog row ordered by `channel`, then `sort_order`.
    Task 2's entry-form component groups this flat list by `channel`
    itself; this function does no grouping.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0015_client_metrics.sql`:

```sql
-- supabase/migrations/0015_client_metrics.sql

create table public.client_metric_catalog (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  metric_key text not null,
  label text not null,
  unit text not null default '',
  sort_order integer not null default 0,
  unique (channel, metric_key)
);

alter table public.client_metric_catalog enable row level security;

create policy "client_metric_catalog_select_authenticated" on public.client_metric_catalog
  for select to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())));

insert into public.client_metric_catalog (channel, metric_key, label, unit, sort_order) values
  ('SEO', 'organic_traffic', 'Organic traffic', 'sessions', 1),
  ('SEO', 'avg_keyword_position', 'Average keyword position', 'position', 2),
  ('SEO', 'keywords_top_10', 'Keywords ranking in top 10', 'keywords', 3),
  ('SEO', 'backlinks', 'Backlinks', 'links', 4),
  ('SEO', 'domain_authority', 'Domain authority', 'score', 5),
  ('SEO', 'organic_conversions', 'Organic conversions', 'conversions', 6),

  ('Google Ads', 'spend', 'Spend', '$', 1),
  ('Google Ads', 'impressions', 'Impressions', 'impressions', 2),
  ('Google Ads', 'clicks', 'Clicks', 'clicks', 3),
  ('Google Ads', 'ctr', 'CTR', '%', 4),
  ('Google Ads', 'cpc', 'CPC', '$', 5),
  ('Google Ads', 'cpl', 'CPL', '$', 6),
  ('Google Ads', 'conversions', 'Conversions', 'conversions', 7),
  ('Google Ads', 'conversion_rate', 'Conversion rate', '%', 8),
  ('Google Ads', 'roas', 'ROAS', 'x', 9),

  ('Meta Ads', 'spend', 'Spend', '$', 1),
  ('Meta Ads', 'impressions', 'Impressions', 'impressions', 2),
  ('Meta Ads', 'reach', 'Reach', 'people', 3),
  ('Meta Ads', 'clicks', 'Clicks', 'clicks', 4),
  ('Meta Ads', 'ctr', 'CTR', '%', 5),
  ('Meta Ads', 'cpc', 'CPC', '$', 6),
  ('Meta Ads', 'cpl', 'CPL', '$', 7),
  ('Meta Ads', 'conversions', 'Conversions', 'conversions', 8),
  ('Meta Ads', 'conversion_rate', 'Conversion rate', '%', 9),
  ('Meta Ads', 'roas', 'ROAS', 'x', 10),

  ('LinkedIn Ads', 'spend', 'Spend', '$', 1),
  ('LinkedIn Ads', 'impressions', 'Impressions', 'impressions', 2),
  ('LinkedIn Ads', 'clicks', 'Clicks', 'clicks', 3),
  ('LinkedIn Ads', 'ctr', 'CTR', '%', 4),
  ('LinkedIn Ads', 'cpc', 'CPC', '$', 5),
  ('LinkedIn Ads', 'cpl', 'CPL', '$', 6),
  ('LinkedIn Ads', 'leads', 'Leads', 'leads', 7),

  ('Email', 'emails_sent', 'Emails sent', 'emails', 1),
  ('Email', 'open_rate', 'Open rate', '%', 2),
  ('Email', 'click_rate', 'Click rate', '%', 3),
  ('Email', 'unsubscribe_rate', 'Unsubscribe rate', '%', 4),
  ('Email', 'conversions', 'Conversions', 'conversions', 5),

  ('Social', 'followers', 'Followers', 'followers', 1),
  ('Social', 'follower_growth', 'Follower growth', 'followers', 2),
  ('Social', 'engagement_rate', 'Engagement rate', '%', 3),
  ('Social', 'impressions', 'Impressions', 'impressions', 4),
  ('Social', 'posts_published', 'Posts published', 'posts', 5),

  ('Content', 'posts_published', 'Posts published', 'posts', 1),
  ('Content', 'page_views', 'Page views', 'views', 2),
  ('Content', 'avg_time_on_page', 'Average time on page', 'seconds', 3),
  ('Content', 'conversions', 'Conversions', 'conversions', 4),

  ('Web/CRO', 'sessions', 'Sessions', 'sessions', 1),
  ('Web/CRO', 'bounce_rate', 'Bounce rate', '%', 2),
  ('Web/CRO', 'conversion_rate', 'Conversion rate', '%', 3),
  ('Web/CRO', 'leads', 'Leads', 'leads', 4),
  ('Web/CRO', 'avg_session_duration', 'Average session duration', 'seconds', 5);

create table public.client_metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  period date not null,
  channel text not null,
  metric_key text not null default 'custom',
  metric_label text not null,
  value numeric not null,
  unit text not null default '',
  notes text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period, channel, metric_label)
);

alter table public.client_metrics enable row level security;

create policy "client_metrics_all_employees" on public.client_metrics
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid())));
```

This migration is NOT run automatically — this repo has no migration
runner. It is run by hand later, in the Supabase SQL editor, by the human
operator (documented in `README.md`'s "Database migrations" section).
Nothing in this task depends on it having been run yet — Steps 2-4 only
touch TypeScript, which compiles against the `Database` type, not a live
database.

- [ ] **Step 2: Add the new tables to `types/database.ts`**

Open `types/database.ts`. Add these two entries inside
`Database['public']['Tables']`, after the `offboarding_checklists` entry
(the last one in the file) and before the closing `}` of `Tables`:

```typescript
      client_metric_catalog: {
        Row: { id: string; channel: string; metric_key: string; label: string; unit: string; sort_order: number }
        Insert: { channel: string; metric_key: string; label: string; unit?: string; sort_order?: number }
        Update: never
        Relationships: []
      }
      client_metrics: {
        Row: {
          id: string
          client_id: string
          period: string
          channel: string
          metric_key: string
          metric_label: string
          value: number
          unit: string
          notes: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          client_id: string
          period: string
          channel: string
          metric_key?: string
          metric_label: string
          value: number
          unit?: string
          notes?: string
          created_by?: string | null
          updated_at?: string
        }
        Update: Partial<{
          value: number
          unit: string
          notes: string
          updated_at: string
        }>
        Relationships: []
      }
```

- [ ] **Step 3: Add the validation schemas to `lib/validation.ts`**

Append to the end of `lib/validation.ts`:

```typescript
export const addClientMetricSchema = z.object({
  clientId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Pick a month'),
  channel: z.string().trim().min(1, 'Channel is required'),
  metricKey: z.string().trim().optional().or(z.literal('')),
  metricLabel: z.string().trim().min(1, 'Metric name is required'),
  value: z.coerce.number({ error: 'Value must be a number' }),
  unit: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})

export const deleteClientMetricSchema = z.object({
  metricId: z.string().uuid(),
  clientId: z.string().uuid(),
})
```

- [ ] **Step 4: Write the catalog helper**

Create `lib/metric-catalog.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'

export interface CatalogMetric {
  channel: string
  metricKey: string
  label: string
  unit: string
}

export async function getMetricCatalog(): Promise<CatalogMetric[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('client_metric_catalog')
    .select('channel, metric_key, label, unit')
    .order('channel')
    .order('sort_order')

  return (data ?? []).map((row) => ({
    channel: row.channel,
    metricKey: row.metric_key,
    label: row.label,
    unit: row.unit,
  }))
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds with zero TypeScript errors. (There is no runtime
to exercise yet — `client_metric_catalog`/`client_metrics` aren't queried
from any page or action until Task 2, and the migration hasn't been run
against the database yet either.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_client_metrics.sql types/database.ts lib/validation.ts lib/metric-catalog.ts
git commit -m "Add client_metrics schema, types, validation, and catalog helper"
```

---

### Task 2: Metric entry on the client detail page

**Files:**
- Create: `app/(app)/clients/[id]/metrics-actions.ts`
- Create: `app/(app)/clients/[id]/metric-entry-form.tsx`
- Modify: `app/(app)/clients/[id]/page.tsx` (full replacement — see Step 3)

**Interfaces:**
- Consumes: `addClientMetricSchema`, `deleteClientMetricSchema` from
  `lib/validation.ts` (Task 1); `getMetricCatalog(): Promise<CatalogMetric[]>`
  and `CatalogMetric` from `lib/metric-catalog.ts` (Task 1); DB tables
  `client_metrics`/`client_metric_catalog` (Task 1).
- Produces: server actions `addClientMetric(formData: FormData)` and
  `deleteClientMetric(formData: FormData)` from
  `app/(app)/clients/[id]/metrics-actions.ts`, and the client component
  `MetricEntryForm` from `app/(app)/clients/[id]/metric-entry-form.tsx` —
  both consumed only by this task's own `page.tsx`. Task 3 does not import
  from this task; it only needs the `client_metrics` rows Task 2's action
  writes.

- [ ] **Step 1: Write the metric actions**

Create `app/(app)/clients/[id]/metrics-actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { addClientMetricSchema, deleteClientMetricSchema } from '@/lib/validation'

export async function addClientMetric(formData: FormData) {
  const user = await requireModule('clients')

  const rawClientId = formData.get('clientId')

  const parsed = addClientMetricSchema.safeParse({
    clientId: rawClientId,
    period: formData.get('period'),
    channel: formData.get('channel'),
    metricKey: formData.get('metricKey'),
    metricLabel: formData.get('metricLabel'),
    value: formData.get('value'),
    unit: formData.get('unit'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(`/clients/${rawClientId}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { clientId, period, channel, metricKey, metricLabel, value, unit, notes } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('client_metrics').upsert(
    {
      client_id: clientId,
      period: `${period}-01`,
      channel,
      metric_key: metricKey || 'custom',
      metric_label: metricLabel,
      value,
      unit: unit || '',
      notes: notes || '',
      created_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,period,channel,metric_label' }
  )

  if (error) {
    redirect(`/clients/${clientId}?error=` + encodeURIComponent(error.message))
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/clients/${clientId}/dashboard`)
  redirect(`/clients/${clientId}?period=${period}`)
}

export async function deleteClientMetric(formData: FormData) {
  await requireModule('clients')

  const rawClientId = formData.get('clientId')

  const parsed = deleteClientMetricSchema.safeParse({
    metricId: formData.get('metricId'),
    clientId: rawClientId,
  })

  if (!parsed.success) {
    redirect(`/clients/${rawClientId}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { metricId, clientId } = parsed.data

  const supabase = await createClient()
  const { data: deleted, error } = await supabase
    .from('client_metrics')
    .delete()
    .eq('id', metricId)
    .select('id')
    .single()

  if (!deleted) {
    const message = !error || error.code === 'PGRST116' ? 'Metric not found' : error.message
    redirect(`/clients/${clientId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/clients/${clientId}/dashboard`)
  redirect(`/clients/${clientId}`)
}
```

- [ ] **Step 2: Write the entry-form client component**

Create `app/(app)/clients/[id]/metric-entry-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { CatalogMetric } from '@/lib/metric-catalog'

export function MetricEntryForm({
  action,
  clientId,
  period,
  catalog,
}: {
  action: (formData: FormData) => void
  clientId: string
  period: string
  catalog: CatalogMetric[]
}) {
  const [selected, setSelected] = useState('')
  const [customChannel, setCustomChannel] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customUnit, setCustomUnit] = useState('')

  const isCustom = selected === '__custom__'
  const picked = catalog.find((option) => `${option.channel}|${option.metricKey}` === selected)

  const channel = isCustom ? customChannel : (picked?.channel ?? '')
  const metricKey = isCustom ? '' : (picked?.metricKey ?? '')
  const metricLabel = isCustom ? customLabel : (picked?.label ?? '')
  const unit = isCustom ? customUnit : (picked?.unit ?? '')

  const channelsInOrder = Array.from(new Set(catalog.map((option) => option.channel)))

  return (
    <form action={action} className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="metricKey" value={metricKey} />
      <input type="hidden" name="metricLabel" value={metricLabel} />
      <input type="hidden" name="unit" value={unit} />

      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        required
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
      >
        <option value="" disabled>
          Select a metric…
        </option>
        {channelsInOrder.map((channelName) => (
          <optgroup key={channelName} label={channelName}>
            {catalog
              .filter((option) => option.channel === channelName)
              .map((option) => (
                <option key={`${option.channel}|${option.metricKey}`} value={`${option.channel}|${option.metricKey}`}>
                  {option.label}
                </option>
              ))}
          </optgroup>
        ))}
        <option value="__custom__">Custom…</option>
      </select>

      {isCustom && (
        <div className="grid grid-cols-3 gap-2">
          <input
            value={customChannel}
            onChange={(event) => setCustomChannel(event.target.value)}
            placeholder="Channel (e.g. TikTok Ads)"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder="Metric name"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            value={customUnit}
            onChange={(event) => setCustomUnit(event.target.value)}
            placeholder="Unit (optional)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          name="value"
          type="number"
          step="any"
          placeholder="Value"
          required
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
        />
        <input
          name="notes"
          placeholder="Notes (optional)"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Add metric
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Rewrite the client detail page**

Replace the full contents of `app/(app)/clients/[id]/page.tsx` with:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addActivity } from '../../leads/actions'
import { addClientMetric, deleteClientMetric } from './metrics-actions'
import { MetricEntryForm } from './metric-entry-form'
import { requireModule } from '@/lib/access'
import { getMetricCatalog } from '@/lib/metric-catalog'

function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; period?: string }>
}) {
  await requireModule('clients')
  const { id } = await params
  const { error, period: periodParam } = await searchParams
  const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentMonthValue()
  const supabase = await createClient()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, status')
    .eq('id', id)
    .single()

  if (clientError && clientError.code !== 'PGRST116') {
    throw new Error(clientError.message)
  }

  if (!client) notFound()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, body, created_at')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const catalog = await getMetricCatalog()

  const { data: metrics } = await supabase
    .from('client_metrics')
    .select('id, channel, metric_label, value, unit, notes')
    .eq('client_id', id)
    .eq('period', `${period}-01`)
    .order('channel')

  return (
    <div className="max-w-3xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">{client.name}</h1>
        <p className="text-sm text-slate-500">Status: {client.status}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Metrics</h2>
          <Link
            href={`/clients/${id}/dashboard`}
            className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
          >
            View dashboard →
          </Link>
        </div>

        <form className="mt-3 flex items-center gap-2">
          <input
            type="month"
            name="period"
            defaultValue={period}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Go
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(metrics ?? []).map((metric) => (
            <li
              key={metric.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm"
            >
              <span>
                <span className="text-slate-400">{metric.channel} — </span>
                <span className="font-medium text-slate-800">{metric.metric_label}</span>
                <span className="text-slate-600">
                  {' '}
                  = {metric.value}
                  {metric.unit ? ` ${metric.unit}` : ''}
                </span>
                {metric.notes && <span className="text-slate-400"> ({metric.notes})</span>}
              </span>
              <form action={deleteClientMetric}>
                <input type="hidden" name="metricId" value={metric.id} />
                <input type="hidden" name="clientId" value={id} />
                <button type="submit" className="text-red-600 underline">
                  Delete
                </button>
              </form>
            </li>
          ))}
          {(metrics ?? []).length === 0 && (
            <li className="text-sm text-slate-400">No metrics logged for {period} yet.</li>
          )}
        </ul>

        <MetricEntryForm action={addClientMetric} clientId={id} period={period} catalog={catalog} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Activity</h2>
        <form action={addActivity} className="mt-3 space-y-2">
          <input type="hidden" name="clientId" value={client.id} />
          <select
            name="type"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
          <textarea
            name="body"
            placeholder="What happened?"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add activity
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(activities ?? []).map((activity) => (
            <li key={activity.id} className="rounded-lg border border-slate-100 p-2 text-sm">
              <span className="font-medium text-slate-800">{activity.type}</span>{' '}
              <span className="text-slate-600">— {activity.body}</span>
              <div className="text-xs text-slate-400">{new Date(activity.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

This replacement preserves the existing Activity feed untouched (same
markup, same `addActivity` import) and fixes the pre-existing swallowed-
error bug in the client lookup per Global Constraints (captures
`clientError`, throws on a real error, only 404s on a genuine miss). The
`/clients/${id}/dashboard` link points at Task 3's route, which does not
exist until that task lands — that is expected; this task's own build and
manual check do not depend on it resolving.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/clients/\[id\]/metrics-actions.ts app/\(app\)/clients/\[id\]/metric-entry-form.tsx app/\(app\)/clients/\[id\]/page.tsx
git commit -m "Add metric entry (catalog + custom) to the client detail page"
```

---

### Task 3: Metrics dashboard

**Files:**
- Create: `app/(app)/clients/[id]/dashboard/page.tsx`
- Create: `app/(app)/clients/[id]/dashboard/metric-chart.tsx`
- Modify: `package.json` (via `npm install recharts`)

**Interfaces:**
- Consumes: DB table `client_metrics` (Task 1); no imports from Task 2 —
  this task only reads rows Task 2's action wrote, via its own Supabase
  query.
- Produces: route `/clients/[id]/dashboard`, already linked from Task 2's
  `page.tsx`. Nothing later in this plan consumes this task's exports —
  it's the last task.

- [ ] **Step 1: Install recharts**

Run: `npm install recharts`
Expected: `package.json` gains a `recharts` dependency; `npm install` exits
0.

- [ ] **Step 2: Write the chart component**

Create `app/(app)/clients/[id]/dashboard/metric-chart.tsx`:

```tsx
'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function MetricChart({ points }: { points: { period: string; value: number }[] }) {
  return (
    <div className="mt-2 h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#1e293b" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Write the dashboard page**

Create `app/(app)/clients/[id]/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { MetricChart } from './metric-chart'

interface MetricPoint {
  period: string
  value: number
}

export default async function ClientMetricsDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule('clients')
  const { id } = await params
  const supabase = await createClient()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .single()

  if (clientError && clientError.code !== 'PGRST116') {
    throw new Error(clientError.message)
  }

  if (!client) notFound()

  const { data: metrics } = await supabase
    .from('client_metrics')
    .select('channel, metric_label, unit, period, value')
    .eq('client_id', id)
    .order('period', { ascending: true })

  const byChannel = new Map<string, Map<string, { unit: string; points: MetricPoint[] }>>()

  for (const row of metrics ?? []) {
    const channelMap = byChannel.get(row.channel) ?? new Map()
    const metric = channelMap.get(row.metric_label) ?? { unit: row.unit, points: [] as MetricPoint[] }
    metric.points.push({ period: row.period, value: row.value })
    channelMap.set(row.metric_label, metric)
    byChannel.set(row.channel, channelMap)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Link href={`/clients/${id}`} className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          ← Back to {client.name}
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-slate-800">{client.name} — Metrics dashboard</h1>
      </div>

      {byChannel.size === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          No metrics logged for this client yet.
        </p>
      )}

      {Array.from(byChannel.entries()).map(([channel, metricMap]) => (
        <div key={channel} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">{channel}</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            {Array.from(metricMap.entries()).map(([label, metric]) => (
              <div key={label} className="rounded-lg border border-slate-100 p-3">
                <h3 className="text-sm font-medium text-slate-600">
                  {label}
                  {metric.unit ? ` (${metric.unit})` : ''}
                </h3>
                {metric.points.length >= 2 ? (
                  <MetricChart points={metric.points} />
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-slate-800">
                    {metric.points[0]?.value}
                    <span className="ml-2 text-xs font-normal text-slate-400">{metric.points[0]?.period}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/\(app\)/clients/\[id\]/dashboard/page.tsx app/\(app\)/clients/\[id\]/dashboard/metric-chart.tsx
git commit -m "Add per-client metrics dashboard with recharts trend lines"
```

---

### Task 4: Manual QA (human operator)

This task is reserved for the user — no subagent has real login
credentials for this app. Run the migration by hand first, then:

- [ ] Run `supabase/migrations/0015_client_metrics.sql` in the Supabase SQL
  editor.
- [ ] Open a client, log a catalog metric (e.g. Google Ads → CPL) for the
  current month, confirm it appears in the month's list.
- [ ] Log a custom metric (not in the catalog) for the same client/month,
  confirm it appears too.
- [ ] Re-submit the same catalog metric for the same month with a
  different value — confirm it updates in place (still one row, new
  value), not a duplicate.
- [ ] Use the month picker to switch to a different month and log a second
  data point for the same metric.
- [ ] Open `/clients/[id]/dashboard` — confirm the metric with 2 months of
  data renders a line chart, and any metric with only 1 data point shows
  as a plain number instead.
- [ ] Delete a metric entry from the client page — confirm it disappears
  from both the entry list and the dashboard.
- [ ] Log in as a different employee (not this client's `owner_user_id`)
  and confirm they can also add and view this client's metrics.
- [ ] Confirm `npm run build` is green on the final branch state.
