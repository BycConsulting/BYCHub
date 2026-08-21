alter table public.users add column if not exists is_active boolean not null default true;
