# Meta Ads Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull Meta Ads metrics into BYC Hub and let the team build a free-form, A4-aligned report per client, exportable to PDF.

**Architecture:** Server-only Meta Insights client (one system-user token) feeds per-widget queries; results are saved in `report_data_cache` and only change when someone presses Refresh. Reports are JSON layouts of widgets on a 12-column grid inside fixed A4 pages; a print route renders the same pages for browser Save-as-PDF.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` first), Supabase, zod 4, recharts (installed), `react-grid-layout` (new), vitest (new, dev, for pure `lib/meta` logic only).

**Spec:** `docs/superpowers/specs/2026-11-08-meta-ads-reports-design.md`

## Global Constraints

- Gate every page and server action with `requireModule('clients')`; no new module key.
- `META_ACCESS_TOKEN` is read only in `lib/meta/*` server code; never passed to client components or logged. Pinned `META_API_VERSION` constant in `lib/meta/client.ts`.
- `ad_account_id` must match `^act_\d+$`.
- RLS on every new table: the "active employee" policy used in `0016_tasks.sql`.
- Migration file `supabase/migrations/0019_meta_reports.sql`, applied by hand in Supabase.
- A4 boxes: landscape 1123×794 px, portrait 794×1123 px (96 dpi); 12 columns; widgets cannot leave their page.
- No creatives, no writes to Meta, no auto-fetch, no scheduled sync.
- Follow existing patterns: theme tokens (no raw colors), `PageHeader`/`StatTile`, server actions with `redirect('?error=')`, types in `types/database.ts`, schemas in `lib/validation/<module>.ts`.

## Review Focus

- Client has no ad account mapped: report shows a clear "map an ad account first" state, no crash.
- Date range never refreshed: widgets show "No data yet — press Refresh", not zeros.
- Meta returns an empty `data` array (no spend in range): KPIs show 0 / "—", charts render empty, no divide-by-zero in CPL/ROAS/change%.
- Previous-period value is 0: change shows "—", not `Infinity%`.
- One widget's query fails (expired token, rate limit): only that widget shows the error; the rest render.

---

### Task 1: Ad accounts mapping, schema and types

**Files:**
- Create: `supabase/migrations/0019_meta_reports.sql`, `lib/validation/meta.ts`, `app/(app)/clients/[id]/ad-accounts.tsx`, `app/(app)/clients/[id]/ad-accounts-actions.ts`
- Modify: `types/database.ts`, `lib/validation/index.ts`, `app/(app)/clients/[id]/page.tsx`

**Interfaces:**
- Produces: tables `client_ad_accounts`, `report_layouts`, `report_data_cache` (columns per spec); `addAdAccountSchema` / `removeAdAccountSchema`; actions `addAdAccount(formData)`, `removeAdAccount(formData)`.

- [ ] **Step 1:** Write the migration: three tables from the spec's Data model, unique `(client_id, ad_account_id)` and `(layout_id, query_key)`, active-employee RLS, indexes on `client_id` / `layout_id`.
- [ ] **Step 2:** Add row/insert/update types for the three tables to `types/database.ts`.
- [ ] **Step 3:** In `lib/validation/meta.ts` export `addAdAccountSchema` (`clientId` uuid, `adAccountId` regex `^act_\d+$` with message "Ad account IDs look like act_1234567890", `label` trimmed ≤80) and `removeAdAccountSchema` (`id` uuid, `clientId` uuid); re-export from `index.ts`.
- [ ] **Step 4:** Implement the two server actions (insert / delete, revalidate the client page) and an "Ad accounts" card on the client page listing accounts with add and remove forms.
- [ ] **Step 5:** Run `npx tsc --noEmit && npx eslint app lib`; expect no output. Apply the migration in Supabase; add `act_123` via the UI; expect it listed; add `bad` and expect the error message.
- [ ] **Step 6:** Commit `feat: client ad accounts and meta report tables`.

### Task 2: Meta client and pure logic (tested)

**Files:**
- Create: `lib/meta/client.ts`, `lib/meta/metrics.ts`, `lib/meta/ranges.ts`, `lib/meta/query.ts`, `lib/meta/*.test.ts`, `vitest.config.ts`
- Modify: `package.json` (add `vitest` dev dependency and `"test": "vitest run"`)

**Interfaces:**
- Produces:
  - `type DateRange = { from: string; to: string }` (YYYY-MM-DD, inclusive)
  - `presetRange(preset: 'last_7'|'last_30'|'this_week'|'last_week'|'this_month'|'last_month', today: string): DateRange`
  - `previousPeriod(range: DateRange): DateRange` (same length, ending the day before `range.from`)
  - `changePercent(current: number, previous: number): number | null` (null when previous is 0)
  - `type WidgetQuery = { level: 'account'|'campaign'|'adset'|'ad'; metrics: string[]; breakdown?: 'publisher_platform'|'platform_position'|'age'|'gender'|'country'; timeIncrement?: 'day' }`
  - `queryKey(accountId: string, query: WidgetQuery, range: DateRange, compare: boolean): string` (stable sha-256 hex)
  - `METRIC_CATALOG: Record<string, { label: string; unit: string; fields: string[]; derive: (row: RawRow) => number }>` covering spend, impressions, reach, frequency, clicks, link_clicks, ctr, cpc, cpm, results (leads/purchases via `actions`), cost_per_result, roas
  - `fetchInsights(accountId: string, query: WidgetQuery, range: DateRange): Promise<InsightRow[]>` (server only; pages through `paging.next`; throws `MetaError { kind: 'token'|'rate_limit'|'permission'|'other'; message: string }`)

- [ ] **Step 1:** Add vitest and `vitest.config.ts` (node environment, alias `@` to repo root).
- [ ] **Step 2:** Write failing tests: `previousPeriod({from:'2026-11-01',to:'2026-11-30'})` is `2026-10-02..2026-10-31`; `presetRange('last_7','2026-11-08')` is `2026-11-01..2026-11-07`; `changePercent(10,0)` is `null` and `changePercent(110,100)` is `10`; CPL/ROAS derive returns `0` when leads or spend is 0; `queryKey` is identical for equal inputs and differs when `compare` or the range changes; error mapping maps Meta code 190 to `kind:'token'` and 4/17/32/613 to `'rate_limit'`.
- [ ] **Step 3:** Run `npx vitest run`; expect FAIL (modules missing).
- [ ] **Step 4:** Implement the modules. `fetchInsights` calls `GET /{META_API_VERSION}/{accountId}/insights` with `time_range`, `level`, `fields` from the catalog, optional `breakdowns` and `time_increment`, `limit=500`; token from `process.env.META_ACCESS_TOKEN` (throw `MetaError{kind:'token'}` if unset). Error mapping lives in an exported pure `mapMetaError(code: number, message: string): MetaError` so it is testable.
- [ ] **Step 5:** Run `npx vitest run`; expect all PASS.
- [ ] **Step 6:** Commit `feat: meta insights client and report logic`.

### Task 3: Layout model, standard template, create report

**Files:**
- Create: `lib/meta/layout.ts`, `lib/meta/standard-template.ts`, `lib/meta/layout.test.ts`, `app/(app)/clients/[id]/reports/actions.ts`
- Modify: `lib/validation/meta.ts`

**Interfaces:**
- Consumes: `WidgetQuery` (Task 2).
- Produces:
  - `type Widget = { id: string; type: 'kpi'|'line'|'bar'|'donut'|'table'|'text'; x: number; y: number; w: number; h: number; config: WidgetConfig }`; `type Page = Widget[]`
  - `widgetSchema` / `pagesSchema` (zod) validating bounds (`x+w ≤ 12`, `y+h ≤` page rows, `w,h ≥ 1`)
  - `STANDARD_PAGES: Page[]` (per spec's Standard template) and `pageRows(orientation): number` (row height 24 px → landscape 33, portrait 46)
  - action `createReport(formData)` (clientId, adAccountId) → inserts `report_layouts` from `STANDARD_PAGES`, redirects to `/clients/[id]/reports/[reportId]`

- [ ] **Step 1:** Write failing tests: `pagesSchema.parse(STANDARD_PAGES)` succeeds; a widget with `x:10,w:4` fails; a widget below the last row fails; ids across pages are unique.
- [ ] **Step 2:** Run `npx vitest run lib/meta/layout.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the types, schemas and template (`WidgetConfig` = discriminated by type: metric keys, `WidgetQuery`, title, text body); implement `createReport` (requires a mapped ad account, else `?error=Map an ad account first`).
- [ ] **Step 4:** Run `npx vitest run`; expect PASS. Run `npx tsc --noEmit`; expect no output.
- [ ] **Step 5:** Commit `feat: report layout model and standard template`.

### Task 4: Refresh and cached data loading

**Files:**
- Create: `lib/meta/report-data.ts`
- Modify: `app/(app)/clients/[id]/reports/actions.ts`

**Interfaces:**
- Consumes: Task 2 (`fetchInsights`, `queryKey`, `previousPeriod`), Task 3 layout types.
- Produces:
  - `collectQueries(pages: Page[]): { widgetId: string; query: WidgetQuery }[]`
  - `loadReportData(layoutId: string, accountId: string, pages: Page[], range: DateRange, compare: boolean): Promise<Record<string, { rows: InsightRow[]; previous?: InsightRow[]; error?: string; fetchedAt: string } | undefined>>` keyed by widget id (undefined = never refreshed)
  - action `refreshReport(formData)` (layoutId, from, to, compare): fetches all queries in parallel (`Promise.allSettled`), upserts one cache row per query key (error text stored in `payload.error` for failed ones), revalidates the report page

- [ ] **Step 1:** Write failing test for `collectQueries`: dedupes identical queries and returns one entry per widget with a query (text widgets excluded).
- [ ] **Step 2:** Run it; expect FAIL. Implement `collectQueries`, `loadReportData`, `refreshReport`; when `compare` is true also fetch `previousPeriod(range)` for KPI queries.
- [ ] **Step 3:** Run `npx vitest run`; expect PASS. `npx tsc --noEmit`; expect no output.
- [ ] **Step 4:** Commit `feat: refresh and cache report data`.

### Task 5: Read-only report page and widgets

**Files:**
- Create: `app/(app)/clients/[id]/reports/[reportId]/page.tsx`, `report-toolbar.tsx`, `components/report/widgets.tsx` (one file per widget type if over ~150 lines), `components/report/page-canvas.tsx`
- Modify: `app/(app)/clients/[id]/page.tsx` (list reports, "New Meta report" button → `createReport`)

**Interfaces:**
- Consumes: Task 4 `loadReportData`, `refreshReport`; Task 2 `presetRange`, `METRIC_CATALOG`, `changePercent`.
- Produces: `<PageCanvas orientation page data editable={false}/>` renders a fixed-size A4 box with widgets absolutely placed from grid `x,y,w,h` (col width = box width/12, row = 24 px); `<ReportWidget widget data/>` renders each type, with states "No data yet — press Refresh" and per-widget error.

- [ ] **Step 1:** Report page reads `from`, `to`, `compare` from `searchParams` (default `last_30`), loads layout and cached data, renders toolbar (range presets + custom dates, compare toggle, ad account label, "Last updated hh:mm", Refresh form, Export PDF link) and one `PageCanvas` per page, scaled to fit the screen width with CSS `transform`.
- [ ] **Step 2:** Implement widgets: KPI tile with change chip (green/red via theme tokens, "—" when `changePercent` is null), recharts line/bar/donut, table with metric columns, text.
- [ ] **Step 3:** Run `npx tsc --noEmit && npx eslint app components lib`; expect no output.
- [ ] **Step 4:** With a real token: map an account, create a report, press Refresh, confirm numbers match Meta Ads Manager for the same range; before Refresh confirm "No data yet" everywhere.
- [ ] **Step 5:** Commit `feat: meta report page and widgets`.

### Task 6: Editor

**Files:**
- Create: `app/(app)/clients/[id]/reports/[reportId]/edit/page.tsx`, `report-editor.tsx` (client), `widget-config-dialog.tsx`
- Modify: `reports/actions.ts` (add `saveReport`), `package.json` (`react-grid-layout`)

**Interfaces:**
- Consumes: Task 3 `pagesSchema`, `pageRows`; Task 5 `PageCanvas`.
- Produces: action `saveReport(layoutId: string, name: string, orientation: 'landscape'|'portrait', pages: Page[]): Promise<{ error: string | null }>` (validates with `pagesSchema`)

- [ ] **Step 1:** Install `react-grid-layout`; build the editor: one grid per A4 page (12 cols, 24 px rows, drag + resize, `isBounded`, collision prevention), widget palette to add, delete button, "Add page" and "Remove page", orientation toggle, rename.
- [ ] **Step 2:** Widget config dialog: title, metric picker from `METRIC_CATALOG`, level and breakdown selects, table columns; changes update the widget's `config.query`.
- [ ] **Step 3:** `saveReport` rejects invalid layouts; the editor shows its error. Run `npx tsc --noEmit && npx eslint app components lib`; expect no output.
- [ ] **Step 4:** Manually: drag, resize past the page edge (blocked), add a widget, save, reload, layout persists; widgets whose query changed show "No data yet" until Refresh.
- [ ] **Step 5:** Commit `feat: free-form report editor`.

### Task 7: Print route and Export PDF

**Files:**
- Create: `app/(app)/clients/[id]/reports/[reportId]/print/page.tsx`, `print-trigger.tsx` (client, calls `window.print()` on mount)
- Modify: `app/globals.css` (print rules)

**Interfaces:**
- Consumes: Task 5 `PageCanvas`, Task 4 `loadReportData`.

- [ ] **Step 1:** Print page renders pages unscaled (exact A4 px), one page per printed sheet (`break-after: page`), no shell: add a `print:` hide for sidebar/top bar and `@page { size: A4 landscape|portrait; margin: 0 }` chosen from the layout's orientation; force light theme for print.
- [ ] **Step 2:** Export PDF link opens the print route in a new tab with the same `from/to/compare` params; `print-trigger` opens the dialog.
- [ ] **Step 3:** Manually save as PDF in Chrome and Safari: page count equals editor page count, no widget cut off, charts sharp, matches the on-screen report.
- [ ] **Step 4:** Commit `feat: print-to-PDF report export`.

### Task 8: Docs and release check

**Files:**
- Modify: `.env.local.example`, `README.md`

- [ ] **Step 1:** Add `META_ACCESS_TOKEN=` to `.env.local.example`; document in README the system-user setup (`ads_read`), where to set the token (`.env.local`, Vercel), and applying `0019`.
- [ ] **Step 2:** Run `npx vitest run && npx tsc --noEmit && npx eslint .`; expect all clean.
- [ ] **Step 3:** Push the branch for a Vercel preview, set `META_ACCESS_TOKEN` in Vercel (Preview and Production), re-check Task 5 step 4 on the preview.
- [ ] **Step 4:** Commit `docs: meta reports setup`.
