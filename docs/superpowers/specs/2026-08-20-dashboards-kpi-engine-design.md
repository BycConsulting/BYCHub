# Dashboards + KPI Engine — Design Spec

**Date:** 2026-08-20
**Status:** Approved for planning
**Sub-project 2 of 7** in the BYC internal SaaS platform (see decomposition in
[2026-08-19-foundation-crm-core-design.md](2026-08-19-foundation-crm-core-design.md)).

## Context

Sub-project 1 (Foundation + CRM core) shipped and is live: employee auth, and a CRM
covering leads (pipeline: new → contacted → qualified → proposal → won/lost) through to
active clients, with a shared activity log. No ad-spend, campaign, or ad-platform data
exists anywhere in the system yet — those arrive in later sub-projects (ad creative hub,
multi-model chatbot, AI agents). Consequently "ROI" in this sub-project can only mean
metrics derivable from CRM data (conversion rates, funnel counts, activity volume), not
true cost-vs-return. A manual ROI/spend-entry feature was considered and explicitly
rejected for this sub-project — deferred until real spend data sources exist.

## Scope of this sub-project

An internal, team-wide dashboard showing CRM funnel and activity metrics. No client-export
version (that's sub-project 3), no CEO roll-up across multiple client engagements (that's
sub-project 4 — this platform currently has at most one "engagement" per client, not
multiple). No date-range filtering — all-time totals only. No per-user filtering — every
employee sees the same team-wide numbers, consistent with the CRM's existing model where
any employee can already read all leads/clients (sub-project 1's RLS policies).

## Architecture

New route `app/(app)/dashboard/page.tsx`, a Server Component, added to the existing
authenticated layout's nav (`app/(app)/layout.tsx`, alongside Leads/Clients/Users). It
fetches full row sets from the existing `leads`, `clients`, `activities`, and `users`
tables via the existing `createClient` from `@/lib/supabase/server` — no new tables, no
new RLS policies (already covered by sub-project 1's employee-membership policies). A new
`lib/metrics.ts` module holds pure functions that take those raw rows and return computed
stats; the page component calls them and renders the results as Tailwind-styled stat tiles
and plain CSS bar visualizations (no charting library — consistent with the rest of the
app's zero-extra-dependency approach, and appropriate at this data volume).

```
Browser -> /dashboard (Server Component) -> Supabase (existing tables)
        -> lib/metrics.ts (pure JS aggregation) -> Tailwind stat tiles + CSS bars
```

## Metrics

```
leadsByStage    — count of leads grouped by stage (new/contacted/qualified/proposal/won/lost)
leadsBySource   — count of leads grouped by source (null -> "Unknown")
winRate         — won / (won + lost), as a percentage (in-progress leads excluded from
                  the denominator)
clientsByStatus — count of clients grouped by status (prospect/active/paused/lost)
avgTimeToWon    — for each won lead: time between the lead's created_at and its
                  "Stage changed to won" activity's created_at (an activities row with
                  type = 'stage_change' and body = 'Stage changed to won'), averaged
                  across all won leads with such an activity found
activityByUser  — count of activities grouped by user_id, joined to users.name for display
```

All aggregation happens in JS from the full row sets fetched per page load — no
pagination, no SQL views, no filtering. Appropriate for a 2-10 person team's data volume;
revisit (push aggregation into Postgres views) if/when data volume grows enough to matter.

## Error handling and empty states

- Zero leads/clients (fresh install, or right after sub-project 1's QA cleanup) renders
  stat tiles as `0` / "No data yet" rather than crashing on empty-array math — e.g. win
  rate with zero won+lost leads displays "—", not `NaN%`.
- If any Supabase query fails, the page renders a simple inline error message rather than
  crashing. (Full resolution of "list pages can't distinguish empty from failed query" —
  a backlog item from sub-project 1's final review — is out of scope here; this sub-project
  only needs to not crash on a failed query, not build a general solution.)

## Testing

Manual QA in the dev server, consistent with the platform's existing testing decision (no
automated test suite for CRUD/display sub-projects — see sub-project 1's spec). The pure
functions in `lib/metrics.ts` are simple enough to verify by eye against known data during
manual testing.

## Out of scope for this sub-project

- Client-export dashboards (branded external view) — sub-project 3.
- CEO roll-up dashboard across multiple client engagements — sub-project 4 (not yet
  meaningful: this platform currently models one engagement per client).
- Any ROI/spend tracking — no spend data source exists yet; deferred until the ad
  creative hub or ad-platform integrations land.
- Date-range filtering and per-user ("my numbers") filtering — explicit decisions to keep
  this sub-project simple; can be added later without restructuring.
- Charting library (Recharts or similar) — plain CSS bars chosen for zero new
  dependencies; swappable later if the team wants nicer visuals.
