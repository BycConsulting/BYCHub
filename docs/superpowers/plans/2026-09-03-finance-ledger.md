# Finance Ledger (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only income/expense ledger to BYC Hub — transactions, admin-editable categories, receipt uploads, and a per-currency P&L view.

**Architecture:** Two new Postgres tables (`finance_categories`, `finance_transactions`) plus a private Supabase Storage bucket (`finance-receipts`), gated end-to-end by `requireAdminRole()`. All reads and writes go through the service-role client (`createAdminSupabaseClient()`) — the tables have RLS enabled with **zero policies**, so a regular per-request client gets nothing either way. This is a plan-level correction from the spec's literal SQL snippet, which drafted a `select`-only RLS policy; that contradicts the spec's own stated intent ("matching how `hr_config`... already work") — `hr_config` and `role_module_access` both use zero-policy RLS with service-role-only access, and this plan follows that actually-established pattern instead.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Storage), zod v4, Tailwind v4, shadcn/ui components (`components/ui/*`).

**Spec:** [docs/superpowers/specs/2026-09-03-finance-ledger-design.md](../specs/2026-09-03-finance-ledger-design.md)

## Global Constraints

- Admin-only, everywhere: every route and every server action starts with `await requireAdminRole()` (from `lib/access.ts`) — no exceptions, no `role_module_access` wiring.
- Multi-currency, no conversion: each transaction stores its own 3-letter `currency` code (default `INR`). Totals are grouped by currency, never summed across currencies.
- Categories are admin-editable, never hardcoded in UI — seed six rows (Salaries, Rent, Software, Travel — expense; Client Revenue — income; Other — both, see Task 1) but the categories page must let admin add/retire/reactivate more.
- `client_id` on a transaction is only valid when `type = 'income'` — enforced by a DB check constraint AND revalidated in the server action (defense in depth, matches this codebase's existing double-enforcement pattern e.g. `managerId !== userId` in `updateEmployeeProfileSchema`).
- No automated test suite exists in this repo. `npm run build` and `npm run lint` succeeding is the acceptance bar for every task, exactly as for every prior feature in this codebase. Where a task also needs behavioral verification, use this repo's established throwaway-preview-route technique (see Task 6) — never claim a page "works" from code reading alone.
- Every new file/table follows the naming and structural conventions of the existing `tasks` module (`app/hrm/tasks/`) and `client_metrics` (`app/(app)/clients/[id]/metrics-actions.ts`) — these are the two most recent, most directly analogous features in this codebase.

---

### Task 1: Database migration — tables, RLS, storage bucket, seed categories

**Files:**
- Create: `supabase/migrations/0017_finance.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: tables `public.finance_categories` (columns: `id uuid pk`, `name text`, `type text` check `('income','expense')`, `is_active boolean`, `created_at timestamptz`) and `public.finance_transactions` (columns: `id uuid pk`, `type text` check `('income','expense')`, `category_id uuid` FK to `finance_categories(id)`, `amount numeric(14,2)` check `> 0`, `currency text` default `'INR'` check 3-letter uppercase, `transaction_date date` default `current_date`, `client_id uuid` FK to `clients(id)` nullable, `note text` nullable, `receipt_path text` nullable, `created_by uuid` FK to `users(id)` nullable, `created_at timestamptz`), plus a private Storage bucket `finance-receipts`. Task 2 builds TypeScript types against these exact column names and types.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0017_finance.sql

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

-- RLS enabled with ZERO policies — same pattern as hr_config and
-- role_module_access. The regular per-request client gets no rows and no
-- writes either way; this module is read and written exclusively through
-- the service-role client in app/(app)/finance/actions.ts, which is itself
-- gated by requireAdminRole() before every call.
alter table public.finance_categories enable row level security;
alter table public.finance_transactions enable row level security;

insert into public.finance_categories (name, type) values
  ('Salaries', 'expense'),
  ('Rent', 'expense'),
  ('Software', 'expense'),
  ('Travel', 'expense'),
  ('Client Revenue', 'income'),
  ('Other', 'expense'),
  ('Other', 'income');

-- Private bucket: no public policy, no storage.objects RLS policy either —
-- every upload and every signed-URL request goes through the service-role
-- client, which bypasses Storage RLS the same way it bypasses table RLS.
insert into storage.buckets (id, name, public)
values ('finance-receipts', 'finance-receipts', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Hand off for manual execution**

This repo has no local Supabase credentials in this environment (established throughout this project) — every migration is run by hand by the user in the Supabase SQL editor. Print the full file content in chat for the user to paste and run, exactly as done for every prior migration (`0014_recruitment.sql`, `0015_client_metrics.sql`, etc.). Wait for the user to confirm success (e.g. "Success. No rows returned") before treating this task as verified — do not proceed to Task 2 on the assumption it worked.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_finance.sql
git commit -m "feat: add finance ledger schema (categories, transactions, receipts bucket)"
```

---

### Task 2: TypeScript types and zod validation schemas

**Files:**
- Modify: `types/database.ts` (insert after the `task_events` table block, i.e. after line 483 in the current file — the line reading `      }` that closes `task_events`, immediately before the `    }` that closes `Tables`)
- Modify: `lib/validation.ts` (append at end of file, after `forceDeleteUserSchema`)

**Interfaces:**
- Consumes: exact column names/types from Task 1's migration.
- Produces: `FinanceTransactionType` type, `Database['public']['Tables']['finance_categories']` and `['finance_transactions']` Row/Insert/Update shapes; `financeTransactionTypes`, `createFinanceCategorySchema`, `financeCategoryIdSchema`, `createFinanceTransactionSchema`, `deleteFinanceTransactionSchema` — Tasks 3, 4, and 5 import these by these exact names.

- [ ] **Step 1: Add the type aliases and table shapes to `types/database.ts`**

Add this line near the top, alongside the other type aliases (after line 14, `export type CandidateStage = ...`):

```typescript
export type FinanceTransactionType = 'income' | 'expense'
```

Insert this block into the `Tables` object, immediately after the `task_events` table's closing `}` (after the current line 483) and before the `Tables` object's own closing `}` (current line 484):

```typescript
      finance_categories: {
        Row: {
          id: string
          name: string
          type: FinanceTransactionType
          is_active: boolean
          created_at: string
        }
        Insert: {
          name: string
          type: FinanceTransactionType
          is_active?: boolean
        }
        Update: Partial<{
          name: string
          is_active: boolean
        }>
        Relationships: []
      }
      finance_transactions: {
        Row: {
          id: string
          type: FinanceTransactionType
          category_id: string
          amount: number
          currency: string
          transaction_date: string
          client_id: string | null
          note: string | null
          receipt_path: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          type: FinanceTransactionType
          category_id: string
          amount: number
          currency?: string
          transaction_date?: string
          client_id?: string | null
          note?: string | null
          receipt_path?: string | null
          created_by?: string | null
        }
        Update: never
        Relationships: []
      }
```

- [ ] **Step 2: Append the zod schemas to `lib/validation.ts`**

```typescript
export const financeTransactionTypes = ['income', 'expense'] as const

export const createFinanceCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  type: z.enum(financeTransactionTypes),
})

export const financeCategoryIdSchema = z.object({
  categoryId: z.string().uuid(),
})

export const createFinanceTransactionSchema = z
  .object({
    type: z.enum(financeTransactionTypes),
    categoryId: z.string().uuid(),
    amount: z.coerce.number({ error: 'Amount must be a number' }).positive('Amount must be greater than zero'),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code')
      .optional()
      .or(z.literal('')),
    transactionDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
      .optional()
      .or(z.literal('')),
    clientId: z.string().uuid().optional().or(z.literal('')),
    note: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .refine((data) => data.type === 'income' || !data.clientId, {
    message: 'Only income transactions can be linked to a client',
    path: ['clientId'],
  })

export const deleteFinanceTransactionSchema = z.object({
  transactionId: z.string().uuid(),
})
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript errors. (No page imports these yet, so this mainly checks the two files are internally well-formed — real consumption is verified in Tasks 3-5.)

- [ ] **Step 4: Commit**

```bash
git add types/database.ts lib/validation.ts
git commit -m "feat: add finance types and validation schemas"
```

---

### Task 3: Server actions — categories and transactions

**Files:**
- Create: `app/(app)/finance/actions.ts`

**Interfaces:**
- Consumes: `requireAdminRole` from `@/lib/access`; `createAdminSupabaseClient` from `@/lib/supabase/admin`; `createFinanceCategorySchema`, `financeCategoryIdSchema`, `createFinanceTransactionSchema`, `deleteFinanceTransactionSchema` from `@/lib/validation` (Task 2).
- Produces: `createCategory(formData: FormData)`, `retireCategory(formData: FormData)`, `reactivateCategory(formData: FormData)`, `createTransaction(formData: FormData)`, `deleteTransaction(formData: FormData)` — all exported `async function`s taking `FormData`, matching the Server Action signature every other `actions.ts` in this codebase uses. Tasks 4 and 5 import these by these exact names and wire them to `<form action={...}>`.

- [ ] **Step 1: Write the categories actions**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdminRole } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  createFinanceCategorySchema,
  financeCategoryIdSchema,
  createFinanceTransactionSchema,
  deleteFinanceTransactionSchema,
} from '@/lib/validation'

export async function createCategory(formData: FormData) {
  await requireAdminRole()

  const parsed = createFinanceCategorySchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
  })

  if (!parsed.success) {
    redirect('/finance/categories?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('finance_categories').insert({
    name: parsed.data.name,
    type: parsed.data.type,
  })

  if (error) {
    redirect('/finance/categories?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance/categories')
  revalidatePath('/finance')
  redirect('/finance/categories')
}

export async function retireCategory(formData: FormData) {
  await requireAdminRole()

  const parsed = financeCategoryIdSchema.safeParse({ categoryId: formData.get('categoryId') })
  if (!parsed.success) {
    redirect('/finance/categories?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('finance_categories')
    .update({ is_active: false })
    .eq('id', parsed.data.categoryId)

  if (error) {
    redirect('/finance/categories?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance/categories')
  redirect('/finance/categories')
}

export async function reactivateCategory(formData: FormData) {
  await requireAdminRole()

  const parsed = financeCategoryIdSchema.safeParse({ categoryId: formData.get('categoryId') })
  if (!parsed.success) {
    redirect('/finance/categories?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('finance_categories')
    .update({ is_active: true })
    .eq('id', parsed.data.categoryId)

  if (error) {
    redirect('/finance/categories?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance/categories')
  redirect('/finance/categories')
}
```

- [ ] **Step 2: Write the transaction actions (receipt upload + category-type cross-check)**

Append to the same file:

```typescript
export async function createTransaction(formData: FormData) {
  const user = await requireAdminRole()

  const parsed = createFinanceTransactionSchema.safeParse({
    type: formData.get('type'),
    categoryId: formData.get('categoryId'),
    amount: formData.get('amount'),
    currency: formData.get('currency'),
    transactionDate: formData.get('transactionDate'),
    clientId: formData.get('clientId'),
    note: formData.get('note'),
  })

  if (!parsed.success) {
    redirect('/finance?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { type, categoryId, amount, currency, transactionDate, clientId, note } = parsed.data
  const admin = createAdminSupabaseClient()

  const { data: category, error: categoryError } = await admin
    .from('finance_categories')
    .select('type')
    .eq('id', categoryId)
    .single()

  if (categoryError || !category) {
    redirect('/finance?error=' + encodeURIComponent('Category not found'))
  }

  if (category.type !== type) {
    redirect(
      '/finance?error=' +
        encodeURIComponent(`That category is for ${category.type} transactions, not ${type}`)
    )
  }

  let receiptPath: string | null = null
  const receipt = formData.get('receipt')

  if (receipt instanceof File && receipt.size > 0) {
    const path = `${crypto.randomUUID()}-${receipt.name}`
    const { error: uploadError } = await admin.storage
      .from('finance-receipts')
      .upload(path, receipt, { contentType: receipt.type || 'application/octet-stream' })

    if (uploadError) {
      redirect('/finance?error=' + encodeURIComponent('Receipt upload failed: ' + uploadError.message))
    }

    receiptPath = path
  }

  const { error: insertError } = await admin.from('finance_transactions').insert({
    type,
    category_id: categoryId,
    amount,
    currency: currency || 'INR',
    transaction_date: transactionDate || undefined,
    client_id: type === 'income' && clientId ? clientId : null,
    note: note || null,
    receipt_path: receiptPath,
    created_by: user.id,
  })

  if (insertError) {
    redirect('/finance?error=' + encodeURIComponent(insertError.message))
  }

  revalidatePath('/finance')
  redirect('/finance')
}

export async function deleteTransaction(formData: FormData) {
  await requireAdminRole()

  const parsed = deleteFinanceTransactionSchema.safeParse({
    transactionId: formData.get('transactionId'),
  })

  if (!parsed.success) {
    redirect('/finance?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('finance_transactions').delete().eq('id', parsed.data.transactionId)

  if (error) {
    redirect('/finance?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance')
  redirect('/finance')
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: succeeds — no page imports these actions yet, this checks the file itself type-checks cleanly against Task 2's types (e.g. `insert` payload shapes match `Insert` types, `.eq('id', ...)` argument types match `Row['id']`).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/finance/actions.ts"
git commit -m "feat: add finance server actions for categories and transactions"
```

---

### Task 4: Categories page

**Files:**
- Create: `app/(app)/finance/categories/page.tsx`

**Interfaces:**
- Consumes: `requireAdminRole` from `@/lib/access`; `createClient` from `@/lib/supabase/server`; `createCategory`, `retireCategory`, `reactivateCategory` from `./actions` (relative import reaching `app/(app)/finance/actions.ts` — Task 3); `financeTransactionTypes` from `@/lib/validation`; `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`; `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from `@/components/ui/table`; `Badge` from `@/components/ui/badge`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `FormSelect` from `@/components/ui/form-select`.
- Produces: the `/finance/categories` route. Task 5's page links to this route.

- [ ] **Step 1: Write the page**

```tsx
import Link from 'next/link'
import { requireAdminRole } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createCategory, retireCategory, reactivateCategory } from '../actions'
import { financeTransactionTypes } from '@/lib/validation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'

export default async function FinanceCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdminRole()
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('finance_categories')
    .select('id, name, type, is_active')
    .order('type')
    .order('name')

  const typeOptions = financeTransactionTypes.map((type) => ({ value: type, label: type }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Finance categories</h1>
        <Link href="/finance" className="text-sm text-slate-500 hover:underline">
          Back to ledger
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add category</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}
          <form action={createCategory} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-500">Name</label>
              <Input name="name" placeholder="Category name" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <FormSelect name="type" options={typeOptions} defaultValue="expense" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(categories ?? []).map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium text-slate-800">{category.name}</TableCell>
                <TableCell className="capitalize">{category.type}</TableCell>
                <TableCell>
                  <Badge variant={category.is_active ? 'default' : 'secondary'}>
                    {category.is_active ? 'Active' : 'Retired'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {category.is_active ? (
                    <form action={retireCategory}>
                      <input type="hidden" name="categoryId" value={category.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Retire
                      </Button>
                    </form>
                  ) : (
                    <form action={reactivateCategory}>
                      <input type="hidden" name="categoryId" value={category.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Reactivate
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript or lint errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/finance/categories/page.tsx"
git commit -m "feat: add finance categories page"
```

---

### Task 5: Transactions page — list, filters, P&L summary, add-transaction form

**Files:**
- Create: `app/(app)/finance/page.tsx`

**Interfaces:**
- Consumes: `requireAdminRole` from `@/lib/access`; `createClient` from `@/lib/supabase/server`; `createAdminSupabaseClient` from `@/lib/supabase/admin` (needed for signed receipt URLs — see Step 1 note); `createTransaction`, `deleteTransaction` from `./actions` (Task 3); `financeTransactionTypes` from `@/lib/validation`; same `components/ui/*` imports as Task 4, plus `FormSelect`.
- Produces: the `/finance` route — the module's landing page. Task 6's nav entry links here.

- [ ] **Step 1: Write the page**

Receipt links need signed URLs. `finance-receipts` is a private bucket with no storage RLS policy (Task 1), so only the service-role client can generate a signed URL — use `createAdminSupabaseClient()` for that one read, even though the rest of this page reads through the RLS'd `createClient()` for consistency with the rest of the codebase's page components (the RLS zero-policy design means the RLS'd client would return zero rows for `finance_transactions` too — so **use `createAdminSupabaseClient()` for every read on this page**, not `createClient()`, since this table has no select policy for any role, admin included, at the RLS layer).

```tsx
import Link from 'next/link'
import { requireAdminRole } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createTransaction, deleteTransaction } from './actions'
import { financeTransactionTypes } from '@/lib/validation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; type?: string; categoryId?: string; from?: string; to?: string }>
}) {
  await requireAdminRole()
  const { error, type, categoryId, from, to } = await searchParams
  const admin = createAdminSupabaseClient()

  const { data: categories } = await admin
    .from('finance_categories')
    .select('id, name, type, is_active')
    .eq('is_active', true)
    .order('type')
    .order('name')

  const { data: clients } = await admin.from('clients').select('id, name').order('name')

  let query = admin
    .from('finance_transactions')
    .select('id, type, category_id, amount, currency, transaction_date, client_id, note, receipt_path')
    .order('transaction_date', { ascending: false })

  if (type) query = query.eq('type', type)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (from) query = query.gte('transaction_date', from)
  if (to) query = query.lte('transaction_date', to)

  const { data: transactions } = await query

  const allTransactions = transactions ?? []
  const allCategories = categories ?? []
  const categoryNames = Object.fromEntries(allCategories.map((c) => [c.id, c.name]))
  const clientNames = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name]))

  const totalsByCurrency = allTransactions.reduce<Record<string, { income: number; expense: number }>>(
    (totals, transaction) => {
      const bucket = totals[transaction.currency] ?? { income: 0, expense: 0 }
      bucket[transaction.type] += transaction.amount
      totals[transaction.currency] = bucket
      return totals
    },
    {}
  )

  const receiptUrls = Object.fromEntries(
    await Promise.all(
      allTransactions
        .filter((t) => t.receipt_path)
        .map(async (t) => {
          const { data } = await admin.storage.from('finance-receipts').createSignedUrl(t.receipt_path!, 300)
          return [t.id, data?.signedUrl ?? null] as const
        })
    )
  )

  const typeFilterOptions = [{ value: '', label: 'All types' }, ...financeTransactionTypes.map((t) => ({ value: t, label: t }))]
  const categoryFilterOptions = [
    { value: '', label: 'All categories' },
    ...allCategories.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` })),
  ]
  const typeOptions = financeTransactionTypes.map((t) => ({ value: t, label: t }))
  const categoryOptions = allCategories.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` }))
  const clientOptions = [{ value: '', label: 'No client' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Finance</h1>
        <Link href="/finance/categories" className="text-sm text-slate-500 hover:underline">
          Manage categories
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">P&amp;L by currency</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(totalsByCurrency).length === 0 ? (
            <p className="text-sm text-slate-500">No transactions yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(totalsByCurrency).map(([currency, totals]) => (
                <div key={currency} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-medium text-slate-500">{currency}</div>
                  <div className="mt-1 text-sm text-slate-700">Income: {totals.income.toFixed(2)}</div>
                  <div className="text-sm text-slate-700">Expense: {totals.expense.toFixed(2)}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    Net: {(totals.income - totals.expense).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add transaction</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}
          <form action={createTransaction} encType="multipart/form-data" className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <FormSelect name="type" options={typeOptions} defaultValue="expense" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Category</label>
              <FormSelect name="categoryId" options={categoryOptions} defaultValue={categoryOptions[0]?.value ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Amount</label>
              <Input name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Currency</label>
              <Input name="currency" placeholder="INR" defaultValue="INR" maxLength={3} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Date</label>
              <Input name="transactionDate" type="date" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Client (income only)</label>
              <FormSelect name="clientId" options={clientOptions} defaultValue="" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-slate-500">Note</label>
              <Input name="note" placeholder="Optional note" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Receipt</label>
              <input
                name="receipt"
                type="file"
                className="block w-full text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-sm"
              />
            </div>
            <Button type="submit" className="col-span-4">
              Add transaction
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <FormSelect name="type" options={typeFilterOptions} defaultValue={type ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Category</label>
              <FormSelect name="categoryId" options={categoryFilterOptions} defaultValue={categoryId ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">From</label>
              <Input name="from" type="date" defaultValue={from ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">To</label>
              <Input name="to" type="date" defaultValue={to ?? ''} />
            </div>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allTransactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{transaction.transaction_date}</TableCell>
                <TableCell>
                  <Badge variant={transaction.type === 'income' ? 'default' : 'secondary'} className="capitalize">
                    {transaction.type}
                  </Badge>
                </TableCell>
                <TableCell>{categoryNames[transaction.category_id] ?? '—'}</TableCell>
                <TableCell>
                  {transaction.amount.toFixed(2)} {transaction.currency}
                </TableCell>
                <TableCell>{transaction.client_id ? clientNames[transaction.client_id] ?? '—' : '—'}</TableCell>
                <TableCell className="max-w-xs truncate">{transaction.note ?? '—'}</TableCell>
                <TableCell>
                  {receiptUrls[transaction.id] ? (
                    <a
                      href={receiptUrls[transaction.id]!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-600 hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <form action={deleteTransaction}>
                    <input type="hidden" name="transactionId" value={transaction.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript or lint errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/finance/page.tsx"
git commit -m "feat: add finance ledger page with P&L summary and filters"
```

---

### Task 6: Nav integration and manual verification

**Files:**
- Modify: `components/nav-links.tsx`
- Modify: `components/app-shell.tsx`

**Interfaces:**
- Consumes: `Wallet` icon from `lucide-react` (new import); the existing `NAV_ITEMS` array shape and `NavLinks`/`AppShell` prop signatures.
- Produces: an `isAdmin: boolean` prop on `NavLinks`; a "Finance" nav entry visible only to admins.

- [ ] **Step 1: Add the `adminOnly` field and Finance entry to `nav-links.tsx`**

In `components/nav-links.tsx`, add `Wallet` to the `lucide-react` import (line 5-19 block):

```typescript
import {
  LayoutDashboard,
  Target,
  Building2,
  LayoutGrid,
  CircleUserRound,
  CalendarDays,
  Clock,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Briefcase,
  ListTodo,
  Settings as SettingsIcon,
  Wallet,
} from 'lucide-react'
```

Change the `NAV_ITEMS` type (current lines 22-27) to add `adminOnly`:

```typescript
const NAV_ITEMS: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  module: Module | null
  adminOnly?: boolean
}[] = [
```

Add the Finance entry at the end of the `NAV_ITEMS` array, right before the closing `]` (after the current `{ href: '/settings', ... }` line):

```typescript
  { href: '/finance', label: 'Finance', icon: Wallet, module: null, adminOnly: true },
```

Update the `NavLinks` function signature and filter (current lines 43 and 48):

```typescript
export function NavLinks({ enabledModules, isAdmin }: { enabledModules: Module[]; isAdmin: boolean }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter(
        (item) =>
          (item.module === null || enabledModules.includes(item.module)) && (!item.adminOnly || isAdmin)
      ).map((item) => {
```

(The rest of the function body is unchanged.)

- [ ] **Step 2: Pass `isAdmin` through `app-shell.tsx`**

In `components/app-shell.tsx`, change line 33 from:

```typescript
        <NavLinks enabledModules={enabledModules} />
```

to:

```typescript
        <NavLinks enabledModules={enabledModules} isAdmin={user.role === 'admin'} />
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: succeeds with no TypeScript or lint errors.

- [ ] **Step 4: Manual verification via throwaway preview route**

This repo has no local Supabase credentials, so real login can't be tested locally. Follow this repo's established pattern (used for shadcn-ui, tasks-fix, and force-delete verification earlier in this project):

1. Temporarily create `app/dev-preview-scratch/page.tsx` that renders `<FinancePage searchParams={Promise.resolve({})} />` and `<FinanceCategoriesPage searchParams={Promise.resolve({})} />` directly (bypassing `requireAdminRole()` by not importing the real pages, but copying their JSX with mock data) — OR, simpler for this task, temporarily comment out the `await requireAdminRole()` line in both `app/(app)/finance/page.tsx` and `app/(app)/finance/categories/page.tsx` and add a temporary fake `.env.local` with placeholder Supabase values so the dev server boots.
2. Start the dev server, navigate to `/finance` and `/finance/categories`.
3. Confirm: the add-category form renders with the type dropdown; the add-transaction form renders with all fields including the file input; the filter form renders; the P&L card renders (will show "No transactions yet" against an empty/fake DB — that's expected, this is a rendering/DOM check, not a live-data check).
4. Revert every temporary change (the commented-out `requireAdminRole()` calls, the fake `.env.local`, any scratch route) before committing anything else. Confirm via `git status --porcelain` that only the intended files from Steps 1-2 remain modified.

- [ ] **Step 5: Commit**

```bash
git add components/nav-links.tsx components/app-shell.tsx
git commit -m "feat: add Finance nav entry, admin-only"
```

---

## Final Verification

After Task 6, run `npm run build` and `npm run lint` one more time on the full branch to confirm nothing regressed across tasks. Report the migration file path to the user and ask them to run it by hand in the Supabase SQL editor (per Task 1, Step 2) if they haven't already, before merging.
