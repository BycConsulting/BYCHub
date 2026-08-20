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
-- chats are only visible to the employee who created them. Direct auth.uid() = user_id
-- checks on both tables, no EXISTS/subquery, avoiding the join-based-RLS pattern.
create policy "chat_conversations_own" on public.chat_conversations
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chat_messages_own" on public.chat_messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
