create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  title text not null default 'New conversation',
  provider text not null check (provider in ('claude', 'chatgpt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

-- Private per employee: unlike the CRM tables (any employee reads/writes any row),
-- chats are only visible to the employee who created them. Plus the is_active
-- check 0005 requires on every per-employee policy: a deactivated employee's
-- public.users row is deliberately kept (0004) and their password still
-- authenticates at the Supabase Auth layer, so without this an offboarded
-- employee could keep reading/writing their own chat history straight through
-- the public anon key, bypassing the app entirely. (select auth.uid()) instead
-- of a bare call, matching 0005/0006/0009/0011, so Postgres caches it once per
-- query rather than re-evaluating per row.
create policy "chat_conversations_own" on public.chat_conversations
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.users u where u.id = user_id and u.is_active)
  )
  with check (user_id = (select auth.uid()));

create policy "chat_messages_own" on public.chat_messages
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.users u where u.id = user_id and u.is_active)
  )
  with check (user_id = (select auth.uid()));
