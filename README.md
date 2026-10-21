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
# Then fill in the values from `npx supabase status`

# 5. Seed the database
npm run seed

# 6. Build and start
npm run build && npm start
```

Open [http://localhost:3000](http://localhost:3000).

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

- ✅ `lib/billing.ts` — `generateSchedule`, `invoiceStatus`, `parseRinggitToSen`
- ✅ Database migrations with RLS policies
- ✅ Storage bucket `payment-slips` with org-scoped policies
- ✅ Seed script creating all organizations, users, leases and payments
- ✅ HTTP API: POST /api/leases, GET /api/leases/:id, POST payments, approve, reject, void
- ✅ Collections report with Malaysia timezone grouping
- ✅ Gateway webhook with HMAC signature, idempotency, and concurrency lock
- ✅ POST /api/leases/:id/gateway-bills for online payments
- ✅ /payments/return page (read-only status display)
- ✅ Authorization: Bearer token support for API testing
- ✅ Server-side auth with memberships table (never user_metadata)

## What Is Incomplete / Skipped

- ⚠️ UI pages beyond `/payments/return` — dashboard, lease list, payment recording forms
- ⚠️ Tenant portal UI (phone update, pay now button)
- ⚠️ Slip upload UI (the API accepts `slipPath` but no file upload form)
- ⚠️ Realtime updates
- ⚠️ Unit tests for billing and allocation

## Known Issues

- The `LayoutProps<"/">` type in `layout.tsx` references a Next.js 16 internal type that may need updating if the type definition changes.

## What I Would Do Next

1. Complete the staff/manager dashboard with shadcn/ui DataTable
2. Add the tenant portal with Supabase client-side auth
3. Add file upload for bank transfer slips using Supabase Storage
4. Write unit tests for `lib/billing.ts` covering all edge cases
5. Add server-side search and pagination for the leases list
