# AI Session Log — Full Assessment

AI assistant used: Kiro (Claude-based)

## Key decisions and corrections made during session

### Correction 1: auth schema permissions
The AI initially created helper functions in the `auth` schema:
```sql
create or replace function auth.user_org_id() ...
```
Running `supabase db reset` failed with:
```
ERROR: permission denied for schema auth
```
I corrected all three helper functions to use the `public` schema instead.

### Correction 2: Prisma 7 datasource url in schema.prisma
The AI wrote `url = env("DATABASE_URL")` inside the `datasource db {}` block.
Prisma 7 removed support for this — the connection URL must live in `prisma7.config.ts`.
Running `prisma generate` failed with:
```
The datasource property url is no longer supported in schema files
```
I removed the `url` and `directUrl` lines from `schema.prisma`, leaving them only in `prisma7.config.ts`.

### Correction 3: Next.js 16 proxy.ts vs middleware.ts
The AI created `src/middleware.ts`. Next.js 16 uses `src/proxy.ts` instead.
Build failed with:
```
Both middleware file and proxy file are detected. Please use proxy.ts only.
```
Deleted `middleware.ts` and merged Bearer token logic into `proxy.ts`.

### Correction 4: Next.js 16 Date.now() prerendering
The AI used `new Date()` directly in server components.
Next.js 16 blocks prerendering when it detects unstable values like `Date.now()`.
Fixed by adding `await connection()` and `export const instant = false` to each affected page.

### Correction 5: Prisma 7 transaction type
The AI used `PrismaClient['$transaction']` parameter type extraction which resolved to `never` in Prisma 7.
Fixed by importing `PrismaClient` from the correct path `../../generated/prisma/client` and updating tsconfig target to ES2020 for BigInt literal support.

### What I directed the AI to do
- Design the full database schema with RLS from requirements
- Implement billing.ts pure functions following the exact spec
- Write allocation logic with SELECT FOR UPDATE for concurrency
- Implement HMAC webhook with idempotency guarantees
- Build all UI components using shadcn/ui and Tailwind
- Write REVIEW.md and DECISIONS.md answers

### What I verified
- Ran `npm run build` after every major change to catch errors
- Ran `supabase db reset` to verify migrations apply cleanly
- Ran `npm run seed` to verify seed data is created correctly
- Checked billing calculations against the worked example in the spec (Aisyah's lease, period 5: 77419 sen)
- Verified all imports resolve correctly before submission
