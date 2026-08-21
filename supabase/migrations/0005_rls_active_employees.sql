-- Enforce employee deactivation at the RLS layer, not just in the Next.js app.
--
-- 0002 authorized on "has a row in public.users" == "is a real employee". That
-- is no longer sufficient: 0004 introduced soft deletion (users.is_active), and
-- a deactivated employee's public.users row is deliberately KEPT so that
-- activities keep a valid, permanent author. The 0002 predicate therefore stays
-- true for an offboarded employee.
--
-- Combined with the public anon key and the fact that a deactivated employee's
-- password still authenticates at the Supabase Auth layer, an offboarded
-- employee could mint a real access token straight from the Auth API and hit
-- /rest/v1/leads, /rest/v1/clients and /rest/v1/activities with full read/write/
-- delete — bypassing the app entirely and the is_active check in lib/access.ts.
--
-- Fix: require u.is_active in the membership predicate for all three tables.
--
-- NOTE: this migration deliberately does NOT touch "users_select_authenticated".
-- That policy is ON public.users itself, so adding an
-- `exists (select 1 from public.users ... and is_active)` subquery there would
-- be self-referential — a row's visibility under the SELECT policy would depend
-- on that same row already being visible under RLS to satisfy the subquery,
-- which is a genuine Postgres RLS recursion risk. Tightening it correctly needs
-- a `security definer` helper function and is tracked separately.
--
-- Idempotent: safe to re-run.

drop policy if exists "clients_all_employees" on public.clients;
create policy "clients_all_employees" on public.clients
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

drop policy if exists "leads_all_employees" on public.leads;
create policy "leads_all_employees" on public.leads
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));

drop policy if exists "activities_all_employees" on public.activities;
create policy "activities_all_employees" on public.activities
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.is_active));
