-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table organizations (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table memberships (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id  uuid not null references organizations(id) on delete cascade,
  role    text not null check (role in ('manager','staff')),
  unique (user_id, org_id)
);

create table units (
  id     uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name   text not null
);

create table tenants (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete set null,
  full_name text not null,
  email     text not null,
  phone     text not null default ''
);

create table leases (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  unit_id          uuid not null references units(id),
  tenant_id        uuid not null references tenants(id),
  start_date       date not null,
  end_date         date not null,
  monthly_rent_sen bigint not null check (monthly_rent_sen > 0),
  deposit_sen      bigint not null check (deposit_sen >= 0),
  check (end_date >= start_date)
);

-- No overlapping leases on the same unit
create unique index leases_unit_no_overlap
  on leases (unit_id, start_date, end_date);

create table invoices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  lease_id     uuid not null references leases(id) on delete cascade,
  kind         text not null check (kind in ('deposit','rent')),
  period_index integer,
  period_start date,
  period_end   date,
  due_date     date not null,
  amount_sen   bigint not null check (amount_sen > 0)
);

create table payments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  lease_id         uuid not null references leases(id) on delete cascade,
  amount_sen       bigint not null check (amount_sen > 0),
  unapplied_sen    bigint not null default 0 check (unapplied_sen >= 0),
  method           text not null check (method in ('cash','bank_transfer','online')),
  status           text not null default 'pending_verification'
                     check (status in ('pending_verification','approved','rejected','voided')),
  received_at      timestamptz not null,
  slip_path        text,
  gateway_bill_id  uuid,
  rejection_reason text,
  void_reason      text,
  recorded_by      uuid references auth.users(id)
);

create table payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  payment_id  uuid not null references payments(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  amount_sen  bigint not null check (amount_sen > 0)
);

create table gateway_bills (
  id         uuid primary key,
  org_id     uuid not null references organizations(id) on delete cascade,
  lease_id   uuid not null references leases(id) on delete cascade,
  amount_sen bigint not null check (amount_sen > 0),
  status     text not null default 'pending' check (status in ('pending','paid','failed'))
);

create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  actor_id   uuid references auth.users(id),
  action     text not null,
  entity_id  uuid,
  details    jsonb,
  created_at timestamptz not null default now()
);
