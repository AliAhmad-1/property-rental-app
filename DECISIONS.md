# Decisions

## 1. Duplicate paid=true webhook callbacks (5 ms apart)

When the first callback arrives, the webhook handler reads the bill, verifies the signature, checks `paid_amount` matches, then enters a `$transaction` and immediately runs `SELECT ... FROM gateway_bills WHERE id = ? FOR UPDATE` (`src/app/api/webhooks/gateway/route.ts`, line ~85). This row lock blocks the second concurrent transaction until the first commits.

The first transaction sees `status = 'pending'`, updates it to `'paid'`, creates the payment, and allocates. It then commits and releases the lock.

The second transaction now acquires the lock, re-reads the row, and sees `status = 'paid'`. It returns without creating a second payment or allocation. The response is still 200.

The guarantee is the combination of the `FOR UPDATE` lock and the re-check of `status` inside the transaction — not the pre-transaction check, which is only a fast-path optimization.

---

## 2. Two staff record RM 800 and RM 700 on a lease with RM 1,000 remaining

Both requests hit `POST /api/leases/:leaseId/payments` (`src/app/api/leases/[leaseId]/payments/route.ts`, line ~48).

Each transaction starts with `SELECT id FROM leases WHERE id = ? FOR UPDATE`, which serializes concurrent writes on the same lease. The first transaction to acquire the lock reads the cap: total invoiced − total allocated − total pending = RM 1,000. RM 800 ≤ RM 1,000, so it creates the payment (status: `pending_verification`) and commits, adding RM 800 to the pending total.

The second transaction now acquires the lock. It recalculates: RM 1,000 − 0 (nothing allocated yet) − RM 800 (pending) = RM 200 remaining. RM 700 > RM 200, so it throws `{ code: 'OVER_CAP' }` and the handler returns 422.

Result: only the RM 800 payment is accepted.

---

## 3. Every place "today" is computed or timezone conversions occur

| File | Line | Operation | Timezone | Why |
|------|------|-----------|----------|-----|
| `src/lib/billing.ts` | `invoiceStatus()` | Converts `now: Date` to MYT date string | UTC+8 offset | Overdue rule is defined in Malaysia time — an invoice due 2026-03-01 becomes overdue at MYT 2026-03-02 00:00 |
| `src/app/api/leases/[leaseId]/gateway-bills/route.ts` | ~line 34 | "today's Malaysia date" for due invoices | UTC+8 offset | Amount due is what's owed as of today MYT |
| `src/app/api/reports/collections/route.ts` | SQL | `received_at AT TIME ZONE 'Asia/Kuala_Lumpur'` | IANA tz via Postgres | Monthly grouping must match business calendar months in MYT |
| `seed.ts` | payment `receivedAt` | Literal UTC timestamps matching given MYT times | UTC (stored) | "received 2026-01-31 10:00 MYT" = `2026-01-31T02:00:00Z` |
| `src/app/api/webhooks/gateway/route.ts` | `paid_at` parsing | Parse gateway's `+0800` offset string to `Date` | +0800 | Gateway sends MYT; `new Date(iso)` preserves the offset |

The server never uses `new Date().toLocaleDateString()` or any machine-locale function. All MYT conversion is explicit offset arithmetic (`+8 * 3600 * 1000`) or Postgres `AT TIME ZONE 'Asia/Kuala_Lumpur'`.

---

## 4. Queries not subject to RLS

| Location | Why RLS does not apply | What enforces authorization instead |
|----------|----------------------|--------------------------------------|
| All `prisma.*` calls in route handlers | Prisma connects as `postgres` (database owner), which bypasses RLS | Route handlers call `getAuthContext()` first, check org membership, and filter every query with `where: { orgId: auth.orgId }` |
| `prisma.$queryRaw` in `collections/route.ts` | Same — database owner | `getAuthContext()` at the top of the handler verifies staff/manager role and supplies `auth.orgId` as a bind parameter |
| `prisma.$transaction` in webhook | Service-level operation; no user session | Webhook is authenticated by HMAC signature, not a user token; it only touches the bill and payment identified in the payload |
| `seed.ts` | Runs as database owner outside any request | Seed is a trusted admin script, not a user-facing endpoint |

---

## 5. Void with unapplied_sen from an online payment

When a void removes a payment's allocations (`src/app/api/payments/[paymentId]/void/route.ts`), `unapplied_sen` on the voided payment is set to 0. The previously unapplied amount is simply released — it is not redistributed to other payments.

If an online payment had `unapplied_sen > 0` (all invoices were fully paid, nothing left to allocate), voiding it simply removes the `unapplied_sen` record. No other payment's allocation changes. The invoices that were allocated by this payment are now partially or fully unpaid again.

I chose this because: (a) the spec says "other payments' allocations do not change" on void, (b) reallocating the unapplied amount would require deciding which payment absorbs it, which is ambiguous, and (c) the unapplied amount was only possible for online payments, where the gateway already settled the transaction — the money conversation with the tenant is separate from internal allocation accounting.

---

## 6. Two things the AI got wrong

**a) `auth.user_org_id()` in `supabase/migrations/20260001000001_rls.sql`**

The AI initially created helper functions in the `auth` schema (`create or replace function auth.user_org_id()`). Running `supabase db reset` immediately failed with `ERROR: permission denied for schema auth`. Migrations run as a non-superuser role that cannot create functions in the `auth` schema. I caught this from the error output and corrected all three helper functions to use the `public` schema. See `ai-logs/` for the correction.

**b) Prisma 7 `datasource url` in `schema.prisma`**

The AI wrote `url = env("DATABASE_URL")` inside the `datasource db {}` block in `schema.prisma`. Prisma 7 removed this — the connection URL must live in `prisma7.config.ts` under `datasource.url`, not in the schema file. Running `prisma generate` failed with `The datasource property url is no longer supported in schema files`. I caught this from the error output and removed the `url` and `directUrl` lines from the schema, leaving the connection URL only in `prisma7.config.ts`. See `ai-logs/`.
