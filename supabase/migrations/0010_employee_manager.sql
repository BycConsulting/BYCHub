-- Nullable: most employees have no manager assigned yet, which is the
-- existing behavior (routes to HR's shared queue) — assigning one is an
-- explicit HR/Admin action, not a default. No RLS change needed: this
-- column is read/written exclusively through the service-role client,
-- same as every other employee_profiles column — the table's existing
-- RLS policies (SELECT-own for the regular client, no write policy at
-- all) apply to new columns automatically.
alter table public.employee_profiles
  add column if not exists manager_id uuid references public.users(id);
