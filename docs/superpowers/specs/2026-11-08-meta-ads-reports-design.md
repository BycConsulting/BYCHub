# Meta Ads Reports — Design Spec

**Date:** 2026-11-08
**Status:** Draft for approval

## Intent

BYC runs every client's Meta (Facebook/Instagram) campaigns inside one BYC
Meta Business Manager. Today the team reports on them by hand: the existing
`/clients/[id]/dashboard` shows only numbers someone typed into
`client_metrics`. This sub-project pulls real Meta Ads data into BYC Hub and
lets the team build a detailed, customised report per client, then hand the
client a PDF.

## Goals

- Pull account, campaign, ad set and ad **metrics** from the Meta Marketing
  API for each client's ad account(s).
- A report editor: a free-form grid of widgets laid out on A4 pages, where
  what the team sees on screen is exactly what prints.
- Pick the period: preset (last 7/30 days, this/last week, this/last month)
  or custom dates, with an optional comparison to the previous period.
- Export a PDF the client can receive.
- A standard template every client starts from, which the team then edits
  per client.

## Non-goals

- No client logins. Clients only ever see the exported PDF.
- No ad creatives (images, video, ad copy). Metrics only.
- No writing to Meta (no creating or pausing campaigns).
- No stored history of Meta data beyond the last fetch (see Data flow).
- No automatic refresh or scheduled sync.
- No multi-user live editing of one report.

## Anti-goals (a failure even if it technically works)

- The PDF differs visibly from the on-screen report.
- The Meta token is ever sent to the browser or logged.
- A widget silently shows stale or partial numbers without saying so.

## Constraints

- Stack as-is: Next.js 16 (read `node_modules/next/dist/docs/` before
  writing route/server code), Supabase (RLS: active employees only), Vercel.
- Access is internal only: gate with `requireModule('clients')`. No new
  module key.
- Serverless time limits: no single request may fetch everything. Each
  widget fetches its own data.
- Meta Marketing API rate limits apply per ad account and per app.

## Approaches considered

**Data source.** (A) live from Meta per view, (B) synced copy in our DB on a
schedule, (C) sync plus live for today. **Chosen: A**, with a manual
Refresh button and the last fetch saved so reloads and the PDF reuse it.
Trade-off accepted: heavy accounts can be slow and rate-limited; B can be
added later behind the same widgets.

**Layout model.** (A) free-form grid, (B) switchable sections, (C) sections
holding widgets. **Chosen: A**, constrained to A4 pages so the PDF matches.

**PDF.** (1) Server-side headless Chromium, (2) the browser's print-to-PDF
from a dedicated print page. **Chosen: 2** (builder's call, see below).

## How it works

### Connection

One Meta **system-user access token** (read-only, `ads_read`) for the BYC
Business Manager, stored in the server env var `META_ACCESS_TOKEN`
(Vercel + `.env.local`). The Graph API version is the constant
`META_API_VERSION` (default pinned in code). The token is only used in
server code (`lib/meta/`), never exposed to client components.

Each client is mapped to one or more ad accounts in a new table
`client_ad_accounts` (`client_id`, `ad_account_id` like `act_123456`,
`label`). A small "Ad accounts" panel on the client page adds/removes them;
`ad_account_id` is validated against `^act_\d+$`.

### Data model (migration `0019_meta_reports.sql`)

- `client_ad_accounts`: as above. Unique `(client_id, ad_account_id)`.
- `report_layouts`: `id`, `client_id`, `name`, `orientation`
  (`landscape` | `portrait`), `pages jsonb`, `ad_account_id`, timestamps.
  `pages` is an array of pages; each page is a list of widgets
  `{ id, type, x, y, w, h, config }` on a 12-column grid.
- `report_data_cache`: `layout_id`, `query_key` (hash of the widget query +
  account + date range + compare flag), `payload jsonb`, `fetched_at`.
  Unique `(layout_id, query_key)`.
- All tables use the standard "active employee" RLS policy used elsewhere.
- A standard template lives in code (`lib/meta/standard-template.ts`);
  creating a client's first report copies it into `report_layouts`.

### Widgets

KPI tile (value + change vs previous period), line chart (metric(s) by
day), bar chart (breakdown), donut (share by breakdown), table (rows at
account/campaign/ad set/ad level with chosen metric columns), text/notes.

Metric catalog: spend, impressions, reach, frequency, clicks, link clicks,
CTR, CPC, CPM, plus **results** by action type (leads, purchases, etc.) and
derived cost-per-result and ROAS. Breakdowns: platform, placement, age,
gender, country. Derived values are computed server-side from raw Insights
fields.

### Standard template

Page 1 (landscape): KPI row (spend, reach, clicks, leads, CPL), spend and
leads by day (line), spend by platform (donut), campaign table.
Page 2: ad set table, results by placement (bar), results by age/gender
(bar), a notes box.

### Data flow

1. Open a report: server loads the layout and the cached payloads for the
   selected date range. Anything not cached shows "No data yet — press
   Refresh" (it does not auto-fetch).
2. **Refresh** (server action) fetches every widget's query from the Meta
   Insights API in parallel (paged, with time_increment for series),
   overwrites the cache rows, and updates "Last updated".
3. Changing the date range or compare flag changes the query keys; data
   for a range not yet fetched also needs a Refresh.
4. A failed query marks only that widget with an error (token expired,
   rate limit, permission) and a plain message; other widgets still render.

### Editor and PDF

The editor uses `react-grid-layout` (new dependency, builder's call) with
drag, resize and snap on the 12-column grid; each page is a fixed A4 box
(1123×794 px landscape / 794×1123 portrait at 96 dpi) and widgets cannot
leave it. A separate print route renders the same pages with `@page` A4
and no app chrome; **Export PDF** opens it and triggers the browser print
dialog (Save as PDF). Charts are SVG (recharts) so they print sharp.

### Errors and security

- Token only in server env; server actions re-check `requireModule`.
- Ad account IDs validated; widget query configs validated with zod before
  reaching Meta.
- Meta errors mapped to messages: token invalid (code 190), rate limit
  (4/17/32/613), permission (200/10), other.

## Decided by the user

Internal only; PDF for clients; one Business Manager token; free-form grid
aligned to the PDF; no creatives; live data with a manual Refresh button
(no timer); one standard template, edited per client later; periods weekly,
monthly or custom.

## Builder's calls (not yet confirmed — please check)

- Gate with the existing `clients` module; no new module key.
- Save fetched data in Supabase (`report_data_cache`) rather than server memory.
- Landscape A4 default; per-report portrait option.
- Print-to-PDF from the browser instead of server-side Chromium (no extra
  infrastructure; the user clicks Save as PDF in the print dialog).
- `react-grid-layout` for the grid; `recharts` (already installed) for charts.
- Data for a date range that was never refreshed shows an empty state
  instead of auto-fetching.
- Metrics "results" = Meta action types, picked per widget.

## Needed from the user before it works against real data

- A Meta **system user** in the BYC Business Manager with `ads_read` on the
  clients' ad accounts, and its access token (set as `META_ACCESS_TOKEN` in
  `.env.local` and Vercel).
- Each client's ad account ID(s). I believe a system user on your own
  Business Manager does not need Meta app review for your own ad accounts;
  confirm when creating the token.

## Left to the builder

Visual styling inside the BYC Hub theme, widget configuration UI, exact
metric list order, empty and loading states, and the print stylesheet
details.
