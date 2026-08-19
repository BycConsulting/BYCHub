-- Remediation for the already-provisioned project (yvnfiihppvderdjhzdyy), which
-- was created from 0001_init.sql before its RLS policies were corrected.
--
-- The original policies authorized on `auth.role() = 'authenticated'`, which is
-- true for ANY Supabase Auth session — not just employees. Because the anon key
-- is public and the project accepts email signup, a stranger could self-register
-- against the Auth REST API (bypassing this app's requireUser/requireAdmin
-- entirely) and then get full CRUD on leads, clients and activities through
-- /rest/v1/... with the anon key plus their own session. Verified exploitable
-- against the live project on 2026-08-19.
--
-- Rows in public.users are only ever written with the service-role key by an
-- admin's invite action, so "has a public.users row" == "is a real employee".
--
-- Idempotent: safe to run on a fresh database that already has 0001's corrected
-- policies, and safe to re-run.

drop policy if exists "clients_all_authenticated" on public.clients;
drop policy if exists "leads_all_authenticated" on public.leads;
drop policy if exists "activities_all_authenticated" on public.activities;

drop policy if exists "clients_all_employees" on public.clients;
drop policy if exists "leads_all_employees" on public.leads;
drop policy if exists "activities_all_employees" on public.activities;

create policy "clients_all_employees" on public.clients
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid())));

create policy "leads_all_employees" on public.leads
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid())));

create policy "activities_all_employees" on public.activities
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = (select auth.uid())))
  with check (exists (select 1 from public.users u where u.id = (select auth.uid())));
