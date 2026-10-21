# Code Review

Ordered from most to least severe.

---

## 1. Role taken from `user_metadata` — broken access control (CRITICAL)

**File:** `app/api/leases/[leaseId]/late-fees/route.ts`, line 11

```ts
if (user?.user_metadata.role !== 'manager') {
```

**What goes wrong:** `user_metadata` is writable by the user via `supabase.auth.updateUser()`. Any authenticated user can set `user_metadata.role = 'manager'` and gain full access to this endpoint.

**Fix:** Read the role from the `memberships` table, never from user metadata:

```ts
const membership = await prisma.membership.findFirst({ where: { userId: user.id } })
if (membership?.role !== 'manager') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**Severity:** Critical — complete auth bypass.

---

## 2. No organization check on the lease — IDOR vulnerability (CRITICAL)

**File:** `app/api/leases/[leaseId]/late-fees/route.ts`, lines 14–17

```ts
const lease = await prisma.lease.findUnique({
  where: { id: leaseId },
  ...
})
if (!lease) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```

**What goes wrong:** After fixing the role check, a manager from Org A can still add late fees to Org B's leases by knowing a lease UUID. There is no `orgId` filter on the lookup.

**Fix:**

```ts
const lease = await prisma.lease.findFirst({
  where: { id: leaseId, orgId: membership.orgId },
  ...
})
if (!lease) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```

**Severity:** Critical — cross-organization data mutation.

---

## 3. Webhook logs full payload including secret key (HIGH)

**File:** `app/api/webhooks/gateway/route.ts`, line 14

```ts
console.error('Invalid signature', { fields, expected })
```

`fields` contains all form fields. If `x_signature` is the only field filtered during source computation but the raw `fields` object is logged, the signature itself and all payment details are written to logs. More importantly, if the secret key were ever accidentally included in a field, it would be logged. The brief explicitly states: *Never log the secret key or whole callback payloads.*

**Fix:** Log only non-sensitive identifiers:

```ts
console.error('Invalid signature for bill', fields['id'] ?? 'unknown')
```

**Severity:** High — violates explicit security requirement; payload logging can leak sensitive data.

---

## 4. Race condition: `paid=true` bill processed twice creates two payments (HIGH)

**File:** `app/api/webhooks/gateway/route.ts`, lines 18–32

```ts
if (bill.status === 'paid') return NextResponse.json({ ok: true })

await prisma.$transaction(async (tx) => {
  await tx.gatewayBill.update(...)
  const payment = await tx.payment.create(...)
  await allocate(tx, payment.id)
})
```

**What goes wrong:** Two concurrent callbacks both read `bill.status === 'pending'`, pass the idempotency check, and both enter the transaction. Without a row-level lock, both can create a payment, resulting in two allocations for one bill.

**Fix:** Use `SELECT ... FOR UPDATE` inside the transaction to lock the bill row before checking its status:

```ts
await prisma.$transaction(async (tx) => {
  const locked = await tx.$queryRaw`SELECT status FROM gateway_bills WHERE id = ${bill.id} FOR UPDATE`
  if (locked[0].status === 'paid') return  // already handled
  await tx.gatewayBill.update(...)
  ...
})
```

**Severity:** High — double-charges the tenant and double-allocates invoices.

---

## 5. `paid=false` branch returns early without checking bill existence (MEDIUM)

**File:** `app/api/webhooks/gateway/route.ts`, lines 17–18

```ts
if (fields.paid !== 'true') return NextResponse.json({ ok: true })
```

**What goes wrong:** An unknown bill ID with `paid=false` returns 200 instead of 404. The spec requires 404 for unknown bill IDs regardless of `paid` value.

**Fix:** Look up the bill before branching on `paid`:

```ts
const bill = await prisma.gatewayBill.findUnique({ where: { id: fields.id } })
if (!bill) return NextResponse.json({ error: 'Unknown bill' }, { status: 404 })
if (fields.paid !== 'true') { /* handle failed */ return NextResponse.json({ ok: true }) }
```

**Severity:** Medium — incorrect HTTP response; may cause gateway retry loops.

---

## 6. `getCollections` does not filter by Malaysia timezone (MEDIUM)

**File:** `app/(staff)/dashboard/actions.ts`, lines 6–12

```sql
received_at >= ${from}::date AND received_at < ${to}::date + interval '1 month'
```

**What goes wrong:** `received_at` is `timestamptz` stored in UTC. Casting it to `::date` truncates in the database's session timezone (UTC), not Malaysia time (UTC+8). A payment received at `2026-03-01 00:30 MYT` is stored as `2026-02-28T16:30:00Z` and would be counted in February instead of March.

**Fix:** Convert to Malaysia time before truncating:

```sql
AND received_at AT TIME ZONE 'Asia/Kuala_Lumpur' >= ${from}::date
AND received_at AT TIME ZONE 'Asia/Kuala_Lumpur' < ${to}::date + interval '1 month'
```

With `GROUP BY to_char(received_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM')`.

**Severity:** Medium — wrong monthly totals for payments near midnight MYT.

---

## 7. `nextReference` has a race condition and is called inside `Promise.all` (MEDIUM)

**File:** `app/api/leases/[leaseId]/late-fees/route.ts`, lines 41–45

```ts
reference: await nextReference(lease.orgId),
```

Called once per invoice but outside any transaction. Two concurrent requests can read the same `last` invoice and generate duplicate reference numbers. Also, `nextReference` queries the database N times outside the main transaction, so if the transaction fails the references are already "consumed" by the query (though not persisted).

**Fix:** Generate all references inside a single transaction using a sequence or `MAX(reference) FOR UPDATE`.

**Severity:** Medium — duplicate invoice reference numbers under concurrent load.

---

## 8. Late fee rounding uses floating-point arithmetic on money (LOW)

**File:** `app/api/leases/[leaseId]/late-fees/route.ts`, line 36

```ts
const fee = Math.round((Number(invoice.amountSen - paid) * 2) / 100)
```

`invoice.amountSen` and `paid` are `bigint`. Converting large bigint values to `Number` loses precision for amounts above 2^53 sen (~90 trillion MYR). The spec requires integer sen arithmetic throughout.

**Fix:**

```ts
const fee = (invoice.amountSen - paid) * 2n / 100n
// If rounding is needed: (unpaid * 2n + 99n) / 100n  for ceiling
```

**Severity:** Low — only affects astronomically large invoices in practice, but violates the "no floating-point money" rule.

---

## 9. `0.995` paid threshold uses floating-point comparison on money (LOW)

**File:** `app/api/leases/[leaseId]/late-fees/route.ts`, line 33

```ts
if (Number(paid) / Number(invoice.amountSen) >= 0.995) continue
```

This introduces floating-point imprecision. An invoice of 1000 sen with 995 sen paid would give `0.995` exactly in most cases but is fragile.

**Fix:** Use integer comparison: `if (invoice.amountSen - paid <= 5n) continue` (skip if ≤ 5 sen unpaid).

**Severity:** Low — edge case, but money comparisons must be integer.
