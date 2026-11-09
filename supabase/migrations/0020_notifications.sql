-- supabase/migrations/0020_notifications.sql
-- In-app notifications. Rows are created only by server code (service role);
-- authenticated users can read and update (mark read) only their own.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'task_assigned', 'task_support', 'task_blocked', 'task_completed', 'task_comment',
    'leave_pending', 'leave_approved', 'leave_rejected'
  )),
  title text not null,
  body text not null default '',
  link text not null,
  actor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
