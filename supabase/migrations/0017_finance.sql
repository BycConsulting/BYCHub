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
