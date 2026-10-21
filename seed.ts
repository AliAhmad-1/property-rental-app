/**
 * npm run seed
 * Creates all seed data through normal code paths.
 * Runs on a freshly reset database.
 */
import 'dotenv/config'
// Load .env.local explicitly for tsx compatibility
import { createClient } from '@supabase/supabase-js'
import { prisma } from './src/lib/prisma'
import { generateSchedule } from './src/lib/billing'
import { allocate } from './src/lib/allocation'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY! ?? process.env.SUPABASE_SERVICE_ROLE_KEY!
const SEED_PASSWORD = 'SeedPass123!'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function createUser(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  return data.user.id
}

async function main() {
  console.log('Seeding...')

  // ── Organizations ──────────────────────────────────────────
  const northwind = await prisma.organization.create({ data: { name: 'Northwind Properties' } })
  const beta      = await prisma.organization.create({ data: { name: 'Beta Realty' } })

  // ── Auth users ─────────────────────────────────────────────
  const [
    nwManagerId, nwStaffId, aisyahUserId, benUserId, probeUserId,
    betaManagerId, chenUserId,
  ] = await Promise.all([
    createUser('manager@northwind.test'),
    createUser('staff@northwind.test'),
    createUser('aisyah@northwind.test'),
    createUser('ben@northwind.test'),
    createUser('probe@northwind.test'),
    createUser('manager@beta.test'),
    createUser('chen@beta.test'),
  ])

  // ── Memberships ────────────────────────────────────────────
  await prisma.membership.createMany({
    data: [
      { userId: nwManagerId,   orgId: northwind.id, role: 'manager' },
      { userId: nwStaffId,     orgId: northwind.id, role: 'staff'   },
      { userId: betaManagerId, orgId: beta.id,      role: 'manager' },
    ],
  })

  // ── Tenants ────────────────────────────────────────────────
  const [aisyah, ben, probe, chen] = await Promise.all([
    prisma.tenant.create({ data: { orgId: northwind.id, userId: aisyahUserId, fullName: 'Aisyah Rahman', email: 'aisyah@northwind.test', phone: '' } }),
    prisma.tenant.create({ data: { orgId: northwind.id, userId: benUserId,    fullName: 'Ben Lim',        email: 'ben@northwind.test',    phone: '' } }),
    prisma.tenant.create({ data: { orgId: northwind.id, userId: probeUserId,  fullName: 'Probe Tenant',   email: 'probe@northwind.test',  phone: '' } }),
    prisma.tenant.create({ data: { orgId: beta.id,      userId: chenUserId,   fullName: 'Chen Wei',       email: 'chen@beta.test',        phone: '' } }),
  ])

  // ── Units ──────────────────────────────────────────────────
  const units = await Promise.all([
    prisma.unit.create({ data: { orgId: northwind.id, name: 'A-12-3' } }),
    prisma.unit.create({ data: { orgId: northwind.id, name: 'B-05-1' } }),
    prisma.unit.create({ data: { orgId: northwind.id, name: 'C-01-7' } }),
    prisma.unit.create({ data: { orgId: northwind.id, name: 'D-03-2' } }), // intentionally unleased
    prisma.unit.create({ data: { orgId: beta.id,      name: 'KL-1'   } }),
  ])
  const [unitA, unitB, unitC, , unitKL1] = units

  // ── Leases + Invoices ──────────────────────────────────────
  async function createLease(data: {
    orgId: string; unitId: string; tenantId: string
    startDate: string; endDate: string
    monthlyRentSen: number; depositSen: number
  }) {
    const schedule = generateSchedule({
      startDate: data.startDate,
      endDate: data.endDate,
      monthlyRentSen: data.monthlyRentSen,
      depositSen: data.depositSen,
    })

    return prisma.$transaction(async (tx) => {
      const lease = await tx.lease.create({
        data: {
          orgId:          data.orgId,
          unitId:         data.unitId,
          tenantId:       data.tenantId,
          startDate:      new Date(data.startDate),
          endDate:        new Date(data.endDate),
          monthlyRentSen: BigInt(data.monthlyRentSen),
          depositSen:     BigInt(data.depositSen),
        },
      })

      await tx.invoice.createMany({
        data: schedule.map(inv => ({
          orgId:       data.orgId,
          leaseId:     lease.id,
          kind:        inv.kind,
          periodIndex: inv.periodIndex,
          periodStart: inv.periodStart ? new Date(inv.periodStart) : null,
          periodEnd:   inv.periodEnd   ? new Date(inv.periodEnd)   : null,
          dueDate:     new Date(inv.dueDate),
          amountSen:   BigInt(inv.amountSen),
        })),
      })

      return lease
    })
  }

  const [leaseAisyah, leaseBen, leaseProbe, leaseChen] = await Promise.all([
    createLease({ orgId: northwind.id, unitId: unitA.id, tenantId: aisyah.id, startDate: '2026-01-31', endDate: '2026-07-15', monthlyRentSen: 150000, depositSen: 300000 }),
    createLease({ orgId: northwind.id, unitId: unitB.id, tenantId: ben.id,    startDate: '2026-01-01', endDate: '2026-04-15', monthlyRentSen: 100029, depositSen: 0      }),
    createLease({ orgId: northwind.id, unitId: unitC.id, tenantId: probe.id,  startDate: '2026-02-28', endDate: '2027-02-27', monthlyRentSen: 200000, depositSen: 400000 }),
    createLease({ orgId: beta.id,      unitId: unitKL1.id, tenantId: chen.id, startDate: '2026-03-15', endDate: '2027-03-14', monthlyRentSen: 220000, depositSen: 440000 }),
  ])

  // unitD has no lease — intentional

  // ── Payments on Aisyah's lease ─────────────────────────────

  // Payment 1: Cash RM 3,000 by manager (approved immediately)
  // received 2026-01-31 10:00 MYT = 2026-01-31T02:00:00Z
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orgId:      northwind.id,
        leaseId:    leaseAisyah.id,
        amountSen:  300000n,
        method:     'cash',
        status:     'approved',
        receivedAt: new Date('2026-01-31T02:00:00Z'),
        recordedBy: nwManagerId,
      },
    })
    await allocate(tx, payment.id)
    await tx.auditLog.create({
      data: {
        orgId:    northwind.id,
        actorId:  nwManagerId,
        action:   'payment_approved',
        entityId: payment.id,
        details:  { method: 'cash', amountSen: 300000, note: 'Recorded and auto-approved by manager' },
      },
    })
    return payment
  })

  // Payment 2: Bank transfer RM 2,000 by staff, then approved by manager
  // received 2026-03-01 00:30 MYT = 2026-02-28T16:30:00Z
  // The brief requires "a slip file": upload a real 1x1 PNG to the private bucket.
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const slipFileName = `seed-slip-${Date.now()}.png`
  const slipPath = `${northwind.id}/${slipFileName}`
  const { error: slipErr } = await supabase.storage
    .from('payment-slips')
    .upload(slipPath, PNG_1x1, { contentType: 'image/png' })
  if (slipErr) throw new Error(`slip upload: ${slipErr.message}`)

  const p2 = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orgId:      northwind.id,
        leaseId:    leaseAisyah.id,
        amountSen:  200000n,
        method:     'bank_transfer',
        status:     'pending_verification',
        receivedAt: new Date('2026-02-28T16:30:00Z'),
        slipPath,
        recordedBy: nwStaffId,
      },
    })
    await tx.auditLog.create({
      data: {
        orgId:    northwind.id,
        actorId:  nwStaffId,
        action:   'payment_recorded',
        entityId: payment.id,
        details:  { method: 'bank_transfer', amountSen: 200000 },
      },
    })
    return payment
  })

  // Manager approves p2
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: p2.id }, data: { status: 'approved' } })
    await allocate(tx, p2.id)
    await tx.auditLog.create({
      data: {
        orgId:    northwind.id,
        actorId:  nwManagerId,
        action:   'payment_approved',
        entityId: p2.id,
        details:  { approvedBy: 'manager@northwind.test' },
      },
    })
  })

  // Audit log for lease creations
  await prisma.auditLog.createMany({
    data: [
      { orgId: northwind.id, actorId: nwManagerId, action: 'lease_created', entityId: leaseAisyah.id, details: { unit: 'A-12-3' } },
      { orgId: northwind.id, actorId: nwManagerId, action: 'lease_created', entityId: leaseBen.id,    details: { unit: 'B-05-1' } },
      { orgId: northwind.id, actorId: nwManagerId, action: 'lease_created', entityId: leaseProbe.id,  details: { unit: 'C-01-7' } },
      { orgId: beta.id,      actorId: betaManagerId, action: 'lease_created', entityId: leaseChen.id, details: { unit: 'KL-1'   } },
    ],
  })

  console.log('✅ Seed complete.')
  console.log(`   Seed password: ${SEED_PASSWORD}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
