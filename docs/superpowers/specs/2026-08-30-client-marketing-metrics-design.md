# Client Marketing Metrics — Design Spec

**Date:** 2026-08-30
**Status:** Approved for planning

## Context

`/clients/[id]` today shows a client's status and a freeform Activity feed
(notes/calls/emails). There is no structured way to record the recurring
performance numbers a digital marketing engagement actually produces —
keyword rankings, ad spend, CPL, open rates, follower growth, and so on —
month over month, per client. Employees currently have nowhere to put this
data, and no way to show a client their trend over time without building a
one-off spreadsheet by hand.

This sub-project adds that: a monthly metric log per client, spanning every
common digital-marketing channel, and an in-app dashboard that turns those
entries into per-metric trend charts an employee can screenshot or
print-to-PDF and send to the client.

## Scope of this sub-project

- A "Metrics" section on the existing `/clients/[id]` page: pick a month,
  log any number of metrics against it (channel + metric from a catalog, or
  a custom one), edit/delete existing entries for that month.
- `/clients/[id]/dashboard`: per-client view, metrics grouped by channel,
  one line chart per metric with 2+ months of data.
- A seeded catalog of ~40 common metrics across 8 channels, with a "Custom…"
  escape hatch for anything not in the catalog.
- No new module key — reuses the existing `clients` module gate.

## Decisions from brainstorming

- **Catalog + custom fallback, not fixed columns per channel.** A
  `client_metric_catalog` table seeded with common metrics gives dashboard
  charts consistent identity across months (the same "CPL" every time, not
  "CPL" vs "cost per lead" as separate series from typos). A "Custom…" entry
  point covers anything the catalog misses without needing a migration.
  Hardcoded per-channel columns were rejected — "all metrics" then means a
  migration every time a new one comes up, which works against the stated
  goal.
- **Any employee can log/view any client's metrics.** Matches how
  `clients`/`leads`/`activities` already work in this app — all-employee
  RLS, no ownership gate. No new access-control surface.
- **Internal dashboard, manual export — no public link, no automated
  email.** Consistent with every module built so far staying entirely
  behind login. The employee views the dashboard in-app and exports via
  browser print/PDF (or a screenshot) to send to the client directly. A
  public/token-based shareable client view, or automated email delivery, is
  a distinct future sub-project with its own access-control and
  infrastructure questions (e.g. an email-sending integration this app
  doesn't have yet) — not bundled into v1.
- **Charts, via a new dependency (`recharts`).** A client-facing "dashboard"
  is expected to show trend lines, not just a table of numbers. This is the
  first charting library in this app; it's a small, well-established,
  purely presentational React library with no backend/infra implications.
- **No new module key.** Metrics live under the existing `clients` module
  gate (`requireModule('clients')`) since they're a property of a client,
  not an independent process — unlike Recruitment, which got its own module
  because it isn't a sub-view of an existing entity.
- **One entry per metric per client per month — upsert, not append.**
  Re-submitting the same channel+metric for a month an employee already
  logged updates that value rather than creating a duplicate row. This
  keeps "how many entries exist for CPL this month" always answerable as
  "zero or one," which the dashboard's per-metric trend line depends on.

## Architecture

```
app/(app)/clients/[id]/
  page.tsx                      existing — gains a Metrics section: month
                                 picker, entry form, this month's entries
                                 (edit/delete)
  metrics-actions.ts            addClientMetric (upsert), deleteClientMetric
  dashboard/
    page.tsx                    per-client dashboard: recharts line chart
                                 per metric (2+ data points), else a single
                                 number; grouped by channel
lib/metric-catalog.ts           typed catalog fetch/lookup helper, grouped
                                 by channel for the entry form's dropdown
supabase/migrations/
  0015_client_metrics.sql       creates client_metric_catalog (seeded),
                                 client_metrics, RLS (all-employees pattern
                                 matching clients/leads/activities)
package.json                    + recharts dependency
```

## Data model

```sql
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

-- Seed: ~40 metrics across 8 channels. sort_order controls display order
-- within a channel; channel order in the UI follows first-appearance order
-- below (SEO, Google Ads, Meta Ads, LinkedIn Ads, Email, Social, Content,
-- Web/CRO).
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

`period` is always stored as the first of the month (e.g. `2026-08-01`) —
the entry form's month picker writes that convention, never a specific day.

`metric_key` defaults to `'custom'` for employee-typed metrics (no catalog
row); catalog-sourced entries carry the catalog's `metric_key` so a future
catalog-management feature could join back to it, though v1 has no such
feature. `metric_label` is what actually drives the unique constraint and
the dashboard's per-metric grouping — it's always populated, whether copied
from the catalog or typed by the employee.

## Access control

- `requireModule('clients')` gates both the Metrics section and the
  dashboard route — identical to today's `/clients/[id]`. No new module
  key, no `role_module_access` migration.
- All reads/writes use the RLS-scoped client (`createClient()`), matching
  the existing all-employee pattern already in place for
  `clients`/`leads`/`activities` — no service-role client needed here since
  there's nothing more sensitive than what those tables already expose.

## Dashboard

`/clients/[id]/dashboard` groups this client's `client_metrics` rows by
channel, then by `metric_label` within channel. For each metric:

- 2 or more distinct `period` values → a `recharts` `LineChart` (period on
  the X axis, value on Y), labeled with the metric's `unit`.
- Exactly 1 data point → just the number and its period, no chart (a
  single-point line chart is not useful).

Channels appear in catalog `sort_order`/first-appearance order; metrics
within a channel in catalog `sort_order`. Custom metrics (not in the
catalog) are grouped under their own `channel` value as typed, appended
after the catalog channels.

## Testing

Manual QA, consistent with the rest of this app (no automated test suite):
add several metrics for a client across two different months, including at
least one custom (non-catalog) metric; confirm the dashboard renders a line
chart for anything with 2+ months of data and a plain number for anything
with only 1; confirm re-entering the same channel+metric for a month
already logged updates that value instead of creating a duplicate row;
confirm deleting an entry removes it from both the month's list and the
dashboard; confirm a different employee (not this client's
`owner_user_id`) can also add and view metrics.

## Out of scope for this sub-project

- Public/token-based shareable client-facing dashboard link.
- Automated email delivery of the dashboard (needs an email-sending
  integration this app doesn't have).
- A catalog-management UI — adding a new catalog metric means a new
  migration in v1.
- Bulk/historical import of past months' data.
- Ownership-restricted access (only the client's owner can log metrics).
- Multi-client rollup/agency-wide dashboard (this is one client at a time).
