-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get the org_id for the current user's membership (staff/manager)
create or replace function public.user_org_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select org_id from memberships where user_id = auth.uid() limit 1;
$$;

-- Get the role for the current user in their org
create or replace function public.user_org_role()
returns text language sql stable security definer
set search_path = public
as $$
  select role from memberships where user_id = auth.uid() limit 1;
$$;

-- Get the tenant id for the current user
create or replace function public.user_tenant_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select id from tenants where user_id = auth.uid() limit 1;
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================

alter table organizations        enable row level security;
alter table memberships          enable row level security;
alter table units                enable row level security;
alter table tenants              enable row level security;
alter table leases               enable row level security;
alter table invoices             enable row level security;
alter table payments             enable row level security;
alter table payment_allocations  enable row level security;
alter table gateway_bills        enable row level security;
alter table audit_log            enable row level security;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

create policy "members read own org" on organizations
  for select using (
    id = public.user_org_id()
    or id = (select org_id from tenants where user_id = auth.uid() limit 1)
  );

-- ============================================================
-- MEMBERSHIPS
-- ============================================================

create policy "staff/manager read own org memberships" on memberships
  for select using (org_id = public.user_org_id());

-- ============================================================
-- UNITS
-- ============================================================

-- staff/manager: own org
create policy "staff/manager read units" on units
  for select using (org_id = public.user_org_id());

-- tenant: only units they have a lease on
create policy "tenant read own unit" on units
  for select using (
    exists (
      select 1 from leases
      where leases.unit_id = units.id
        and leases.tenant_id = public.user_tenant_id()
    )
  );

-- ============================================================
-- TENANTS
-- ============================================================

create policy "staff/manager read tenants" on tenants
  for select using (org_id = public.user_org_id());

create policy "tenant read own row" on tenants
  for select using (user_id = auth.uid());

create policy "tenant update own phone" on tenants
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- LEASES
-- ============================================================

create policy "staff/manager read leases" on leases
  for select using (org_id = public.user_org_id());

create policy "tenant read own leases" on leases
  for select using (tenant_id = public.user_tenant_id());

-- ============================================================
-- INVOICES
-- ============================================================

create policy "staff/manager read invoices" on invoices
  for select using (org_id = public.user_org_id());

create policy "tenant read own invoices" on invoices
  for select using (
    exists (
      select 1 from leases
      where leases.id = invoices.lease_id
        and leases.tenant_id = public.user_tenant_id()
    )
  );

-- ============================================================
-- PAYMENTS
-- ============================================================

create policy "staff/manager read payments" on payments
  for select using (org_id = public.user_org_id());

create policy "tenant read own payments" on payments
  for select using (
    exists (
      select 1 from leases
      where leases.id = payments.lease_id
        and leases.tenant_id = public.user_tenant_id()
    )
  );

-- ============================================================
-- PAYMENT ALLOCATIONS
-- ============================================================

create policy "staff/manager read allocations" on payment_allocations
  for select using (org_id = public.user_org_id());

create policy "tenant read own allocations" on payment_allocations
  for select using (
    exists (
      select 1 from payments
      join leases on leases.id = payments.lease_id
      where payments.id = payment_allocations.payment_id
        and leases.tenant_id = public.user_tenant_id()
    )
  );

-- ============================================================
-- GATEWAY BILLS
-- ============================================================

create policy "staff/manager read gateway bills" on gateway_bills
  for select using (org_id = public.user_org_id());

create policy "tenant read own gateway bills" on gateway_bills
  for select using (
    exists (
      select 1 from leases
      where leases.id = gateway_bills.lease_id
        and leases.tenant_id = public.user_tenant_id()
    )
  );

-- ============================================================
-- AUDIT LOG
-- ============================================================

create policy "manager read audit log" on audit_log
  for select using (
    org_id = public.user_org_id()
    and public.user_org_role() = 'manager'
  );

-- append-only: no role can update or delete
create policy "no update audit_log" on audit_log
  as restrictive for update using (false);

create policy "no delete audit_log" on audit_log
  as restrictive for delete using (false);

-- ============================================================
-- GRANTS (Data API access)
-- ============================================================

-- anon: nothing
revoke all on all tables in schema public from anon;

-- authenticated: only allowed tables
grant select on organizations        to authenticated;
grant select on memberships          to authenticated;
grant select on units                to authenticated;
grant select, update (phone) on tenants to authenticated;
grant select on leases               to authenticated;
grant select on invoices             to authenticated;
grant select on payments             to authenticated;
grant select on payment_allocations  to authenticated;
grant select on gateway_bills        to authenticated;
grant select on audit_log            to authenticated;
