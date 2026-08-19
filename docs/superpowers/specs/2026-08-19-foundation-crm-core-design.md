# Foundation + CRM Core — Design Spec

**Date:** 2026-08-19
**Status:** Approved for planning
**Sub-project 1 of N** in the BYC internal SaaS platform (see decomposition below).

## Context

BYC runs multiple client engagements in digital marketing. This platform is meant to
become the single internal system for CRM/lead tracking, ROI/KPI dashboards, an ad
creative asset library, client-exportable dashboards, a CEO roll-up dashboard, future
AI agents, and a multi-model chatbot router. That is too large for one spec, so it is
decomposed into sub-projects, each with its own design → plan → implementation cycle:

1. **Foundation + CRM core** ← this spec
2. Dashboards + KPI/ROI engine (built on CRM data)
3. Client-export dashboards (branded external view of a subset of #2)
4. CEO dashboard (roll-up across all clients/engagements)
5. Ad creative hub (asset storage/tagging/search)
6. Multi-model chatbot router (Claude/ChatGPT/Codex, credit-aware switching)
7. AI agents layer (deferred, depends on #1-3)

This platform is a separate codebase from the existing `BYC Agent` folder, which holds
an unrelated lead-qualification chatbot demo and a LinkedIn lead-radar tool. Those are
staying separate for now (explicit decision — not being migrated into this CRM).

## Scope of this sub-project

Employee-only internal app covering: authentication, user/role management, and CRM
(leads pipeline through to active client engagements). Team size: 2-10 employees.

## Architecture

Single Next.js 14 (App Router, TypeScript) app. Supabase project provides Postgres,
Auth, and Storage. Vercel hosts the Next.js app. No separate backend server —
Next.js Server Actions / API routes handle business logic; Supabase client handles
CRUD and auth sessions.

```
Browser -> Next.js (Vercel) -> Supabase (Postgres, Auth, Storage)
```

No public signup route exists anywhere in the app. The first admin account is seeded
manually (via Supabase dashboard or a one-off script); admins invite subsequent users.

## Data model

```
users        id, email, role (admin|employee), name, created_at
             -- password/auth handled by Supabase Auth; this table stores app-level
             -- profile + role, linked 1:1 to auth.users by id

clients      id, name, status (prospect|active|paused|lost), owner_user_id, created_at

leads        id, client_id (nullable until converted to a client),
             source, contact_name, contact_email, contact_company,
             stage (new|contacted|qualified|proposal|won|lost),
             fit_score, assigned_user_id, notes, created_at, updated_at

activities   id, lead_id (nullable), client_id (nullable), user_id,
             type (note|call|email|stage_change), body, created_at
```

When a lead's stage becomes `won`, a `clients` row is created (or linked, if one
already exists) and the lead's `client_id` is set. From that point the `clients` row
carries the ongoing engagement — prospect and active-client tracking live in one
continuous record rather than two disconnected systems, per the decision that this CRM
covers both leads and active engagements.

Row Level Security in Supabase: any authenticated employee can read/write all rows.
No per-client access walls at this team size (2-10). The `role` column exists so
per-role restrictions can be added later without a schema migration.

## Auth

- Supabase Auth, email + password.
- Admin role can invite users: creates a Supabase Auth user and a matching `users`
  row with role `employee` (or `admin`).
- Session handled via Supabase's cookie-based auth helpers for Next.js.
- No self-service signup anywhere in the app.

## Error handling

- Supabase client errors surface as inline form errors (e.g. "wrong password",
  "lead not found").
- Server Actions validate input with zod before any DB write; malformed input is
  rejected with a form-level error, never a silent failure.

## Testing

- Manual QA in-browser for this first slice — CRUD surface is small and low-risk.
- Automated tests are deferred until the dashboards/reporting sub-project, where
  actual calculation logic (not just CRUD) creates real risk of silent bugs.

## Out of scope for this sub-project

- Dashboards, KPI/ROI calculations, CEO roll-up view, ad creative storage, chatbot
  router, AI agents — each is a separate future sub-project (see decomposition above).
- Per-client access restrictions / granular RBAC (deferred until team grows).
- Migrating the existing LinkedIn leadgen tool's `leads.json` into this CRM
  (explicit decision: kept separate for now).
