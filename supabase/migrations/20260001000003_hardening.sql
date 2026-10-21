-- ============================================================
-- SECURITY & INTEGRITY HARDENING
-- ============================================================

-- ── 1. Lease overlap: real exclusion constraint ─────────────
-- The old unique index (unit_id, start_date, end_date) only blocked
-- exact-duplicate date triples, not genuine overlaps.
-- btree_gist lets us exclude overlapping dateranges on the same unit.
create extension if not exists btree_gist;

drop index if exists leases_unit_no_overlap;

alter table leases
  add constraint leases_no_overlap
  exclude using gist (
    unit_id with =,
    daterange(start_date, end_date, '[]') with &&
  );

-- ── 2. audit_log: append-only for EVERY role, incl. owner ──
-- Restrictive RLS policies do not apply to the table owner (postgres /
-- Prisma) because FORCE ROW LEVEL SECURITY is off. A trigger fires for
-- every role including the owner and the service role.
create or replace function public.audit_log_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function public.audit_log_block_mutation();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function public.audit_log_block_mutation();

-- Belt and braces: even if RLS is ever disabled, owner still blocked by trigger.

-- ── 3. Data API grants: least privilege ────────────────────
-- Supabase default ACL grants authenticated full DML on public tables.
-- The earlier revoke only covered anon. Now revoke all DML from
-- authenticated too, then grant exactly the matrix from the brief.

revoke all on all tables in schema public from anon, authenticated;

-- Table grants matching the brief's access matrix
grant select on organizations        to authenticated;
grant select on memberships          to authenticated;
grant select on units                to authenticated;
-- tenants: staff/manager SELECT whole org; tenant SELECT own + UPDATE phone only
grant select on tenants              to authenticated;
grant update (phone) on tenants      to authenticated;
grant select on leases               to authenticated;
grant select on invoices             to authenticated;
grant select on payments             to authenticated;
grant select on payment_allocations  to authenticated;
grant select on gateway_bills        to authenticated;
-- audit_log: RLS limits SELECT to managers of own org
grant select on audit_log            to authenticated;

-- Column-level: tenant may only change phone.
-- (Revoke above removed full UPDATE; this grants just one column.)
-- with check in the RLS policy still ensures user_id = auth.uid().

-- ── 4. Future tables: do not auto-expose ───────────────────
-- PostgREST's auto_expose_new_tables would grant anon/authenticated
-- defaults on any future table. Revoke default privileges so new
-- tables start closed.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

-- ── 5. Unique gateway_bill_id on payments ──────────────────
-- One bill → at most one payment, ever (belt and braces on top of
-- the webhook's FOR UPDATE re-check).
create unique index if not exists payments_gateway_bill_id_key
  on payments (gateway_bill_id)
  where gateway_bill_id is not null;
