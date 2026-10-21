# Rent Collection System

## How to Run

```bash
# 1. Start local Supabase (Docker must be running)
npx supabase start

# 2. Reset the database (applies all migrations)
npx supabase db reset

# 3. Install dependencies
npm install

# 4. Copy environment variables
cp .env.example .env.local
# Fill in the values from `npx supabase status`

# 5. Seed the database
npm run seed

# 6. Build and start
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000)  
Supabase Studio: [http://127.0.0.1:54323](http://127.0.0.1:54323)

## Seed Account Password

All seeded accounts share the password: **SeedPass123!**

Test account for submission: `manager@northwind.test` / `SeedPass123!`

## Gateway Simulator

```bash
GATEWAY_X_SIGNATURE_KEY=local_gateway_secret \
  node gateway-sim.mjs <bill_id> <amount_sen> [true|false]
```

## What Works

- ✅ `lib/billing.ts` — `generateSchedule`, `invoiceStatus`, `parseRinggitToSen` (pure, no I/O)
- ✅ Database migrations with full RLS policies
- ✅ Storage bucket `payment-slips` with org-scoped upload/read policies
- ✅ Seed script (`npm run seed`) creating all orgs, users, leases and payments
- ✅ HTTP API: all 8 endpoints (leases, payments, approve/reject/void, gateway-bills, collections, webhook)
- ✅ Concurrent lease creation protected with `pg_advisory_xact_lock` per unit
- ✅ Collections report grouped by Malaysia timezone
- ✅ Gateway webhook with HMAC-SHA256 signature, idempotency, and row-level lock for concurrency
- ✅ Authorization: Bearer token support for API testing
- ✅ Server-side auth from memberships table (never user_metadata)
- ✅ Staff/Manager UI: dashboard with overdue count + collections bar chart, leases list, lease detail with invoices and payments
- ✅ Payment recording form with amount in ringgit (parseRinggitToSen), MYT datetime picker, slip upload for bank transfers
- ✅ Manager actions: approve, reject (with reason), void (with reason + confirmation dialog)
- ✅ Slip viewing via signed URLs (60-second expiry)
- ✅ Tenant portal: lease view, invoice statuses, payments, amount due now, Pay Now button, phone number edit
- ✅ /payments/return page (read-only status from database, no side effects)
- ✅ All dates and times displayed in Malaysia time (Asia/Kuala_Lumpur), no hydration warnings
- ✅ REVIEW.md (Part B) — 9 issues ordered by severity
- ✅ DECISIONS.md (Part C) — all 6 questions answered

## What Is Skipped

- ⚠️ Realtime updates on tenant portal (bonus feature)
- ⚠️ Unit tests for `lib/billing.ts` (bonus feature)
- ⚠️ Server-side search and pagination for leases list (bonus feature)
- ⚠️ Create-lease form has live schedule preview (bonus feature — implemented)

## Known Issues

None known. All required features are implemented.

## What I Would Do Next

1. Add unit tests for `lib/billing.ts` edge cases (leap years, month-end anchors)
2. Add realtime payment status updates on the tenant portal using Supabase Realtime
3. Add server-side search and pagination for the leases list
