# Finance Ledger (Phase 1) — Design Spec

**Status:** Approved by user 2026-09-03, ready for planning.

## Context

BYC Hub has no financial tracking today. This is Phase 1 of a larger
"financials" initiative the user scoped down (via brainstorming) into four
independent sub-projects, each to be brainstormed/spec'd/built separately:

1. **Ledger core** (this spec) — income/expense transactions, categories, P&L view.
2. Budgets — per-category monthly budgets + overspend flags. Depends on (1).
3. Invoicing — bill clients, invoice lifecycle. Depends on (1).
4. Payroll run tracking — salary payments as expense entries. Depends on (1).

This spec covers **only Phase 1**. Phases 2–4 are out of scope and must not
be implemented as part of this plan.

## Decisions (from brainstorming)

- **Access:** Admin-only. Not wired into the `role_module_access` toggle
  system — a hard `requireAdminRole()` gate, matching how `/settings` write
  actions and the `deleteUser`/`forceDeleteUser` actions already work in
  this codebase. RLS on both new tables also restricts `select` to
  `role = 'admin'`; there are no insert/update/delete RLS policies, so all
  writes go through service-role server actions — the same pattern already
  used for `hr_config` and `role_module_access`.
- **Currency:** Multi-currency. Each transaction stores its own 3-letter
  currency code (default `INR`). No FX conversion — the P&L view groups
  and totals by currency rather than collapsing to one number. Conversion
  is explicitly deferred, not forgotten.
- **Categories:** Admin-editable (add / rename / retire), not hardcoded.
  Seeded with: Salaries, Rent, Software, Travel, Client Revenue, Other.
- **Client linking:** Income transactions may optionally link to an
  existing `clients` row (nullable `client_id`). Expense transactions
  cannot carry a `client_id` — enforced with a check constraint, not just
  UI convention.
- **Receipts:** File upload is in scope for Phase 1. Files live in a
  private Supabase Storage bucket (`finance-receipts`). No public bucket
  policy — upload and signed-URL download both happen server-side via the
  service-role client, same trust boundary as the rest of the app.
- **Out of scope for Phase 1** (confirmed with user, do not build):
  currency conversion, recurring/templated transactions, budgets,
  invoicing, payroll integration.

## Data Model

New migration file (next sequential number after the existing 16 —
confirm the actual next number at plan/implementation time by listing
`supabase/migrations/`).

```sql
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('income', 'expense')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null references public.finance_categories(id),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  transaction_date date not null default current_date,
  client_id uuid references public.clients(id),
  note text,
  receipt_path text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint client_link_income_only check (client_id is null or type = 'income')
);

alter table public.finance_categories enable row level security;
alter table public.finance_transactions enable row level security;

create policy "finance_categories_select_admin" on public.finance_categories
  for select using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'admin'));

create policy "finance_transactions_select_admin" on public.finance_transactions
  for select using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role = 'admin'));

-- No insert/update/delete policies: all writes go through the service-role
-- client in server actions (requireAdminRole() gate before every write).
```

Storage: create a private bucket `finance-receipts` (via Supabase
dashboard or a `storage.buckets` insert in the migration — follow
whatever this repo's existing convention is; there is no prior Storage
usage in this codebase yet, so check the Supabase dashboard for
buckets already present before assuming none exist).

Category `type` matching the transaction's `type` (an income transaction
must use an income category) is enforced in the server action, not the
database — a cross-table check constraint would need a trigger, which is
unnecessary complexity for an admin-only, low-volume table.

## Routes & Components

- `app/(app)/finance/page.tsx` — server component. Lists transactions
  (most recent first), with filter controls (type, category, date range,
  currency) as a GET form like the existing Tasks assignee filter. Shows a
  P&L summary block above the list: for each currency present, total
  income, total expense, net. Includes an "Add transaction" form (reusing
  `FormSelect`, `Input`, `Button` from `components/ui/*`, matching the
  Tasks/Clients page patterns already in this codebase).
- `app/(app)/finance/categories/page.tsx` — server component. Lists
  categories grouped by type, with an add-category form and a
  retire/reactivate toggle per row (soft delete via `is_active`, never a
  hard delete — matches this app's general pattern of not hard-deleting
  referenced rows).
- `app/(app)/finance/actions.ts` — server actions, each starting with
  `await requireAdminRole()`:
  - `createTransaction(formData)` — validates via a new Zod schema in
    `lib/validation.ts`, uploads the receipt file (if present) to
    `finance-receipts` via the service-role client, inserts the row.
  - `deleteTransaction(formData)` — hard delete (these are admin-only,
    low-volume, correctable mistakes — no soft-delete/audit trail
    requirement was raised, so don't build one).
  - `createCategory(formData)` / `retireCategory(formData)` /
    `reactivateCategory(formData)`.

## Navigation & Access Control

- `requireAdminRole()` (already exists in `lib/access.ts`) gates both
  page components directly — this is intentionally **not** added to the
  `Module` union / `moduleKeys` / `role_module_access` system, since the
  user chose flat admin-only over the configurable-via-role_module_access
  option.
- `components/nav-links.tsx`: `NAV_ITEMS` entries currently show/hide
  based on `module` membership in `enabledModules`. Add an `adminOnly?:
  boolean` field to the item type; a Finance entry sets `adminOnly: true,
  module: null`. `NavLinks` gains an `isAdmin: boolean` prop; the filter
  becomes `(item.module === null || enabledModules.includes(item.module))
  && (!item.adminOnly || isAdmin)`.
- `components/app-shell.tsx` already receives `user: CurrentUser` (which
  has `.role`) — pass `isAdmin={user.role === 'admin'}` through to
  `NavLinks`.

## Testing

No automated test suite exists in this repo (confirmed throughout this
project's history) — `npm run build` and `npm run lint` succeeding is the
acceptance bar, same as every prior feature here. Manual verification
follows the established pattern for this codebase: since there are no
local Supabase credentials, use a throwaway unauthenticated preview route
+ temporary middleware exclusion (both reverted before commit) to confirm
the page renders and the form/filter DOM behaves as expected, then rely
on code review for the server-action/RLS logic. The user runs the new
migration by hand in the Supabase SQL editor, same as every prior
migration in this project, and reports back.

## Self-Review Notes

- No placeholders — every table, route, and action above is fully
  specified with exact types/constraints.
- Scope: single subsystem (ledger core), consistent with the phase
  decomposition agreed with the user; not too large for one plan.
- Ambiguity resolved: category/transaction type-matching enforced in the
  server action (documented above) rather than left unspecified.
