import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth'
import { generateSchedule } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (auth.role !== 'manager') return forbidden()

  let body: {
    unitId: string; tenantId: string; startDate: string; endDate: string
    monthlyRentSen: number; depositSen: number
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { unitId, tenantId, startDate, endDate, monthlyRentSen, depositSen } = body

  // Validate input
  if (!unitId || !tenantId || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate billing
  let schedule
  try {
    schedule = generateSchedule({ startDate, endDate, monthlyRentSen, depositSen })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // Unit and tenant must belong to manager's org
  const unit = await prisma.unit.findFirst({ where: { id: unitId, orgId: auth.orgId } })
  if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, orgId: auth.orgId } })
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check for overlapping leases on the same unit (inclusive dates)
  const overlap = await prisma.lease.findFirst({
    where: {
      unitId,
      startDate: { lte: new Date(endDate) },
      endDate:   { gte: new Date(startDate) },
    },
  })
  if (overlap) {
    return NextResponse.json({ error: 'Lease overlaps an existing lease on this unit' }, { status: 409 })
  }

  // Create lease + invoices atomically
  try {
    const lease = await prisma.$transaction(async (tx) => {
      const l = await tx.lease.create({
        data: {
          orgId: auth.orgId!,
          unitId,
          tenantId,
          startDate: new Date(startDate),
          endDate:   new Date(endDate),
          monthlyRentSen: BigInt(monthlyRentSen),
          depositSen:     BigInt(depositSen),
        },
      })
      await tx.invoice.createMany({
        data: schedule.map(inv => ({
          orgId:       auth.orgId!,
          leaseId:     l.id,
          kind:        inv.kind,
          periodIndex: inv.periodIndex,
          periodStart: inv.periodStart ? new Date(inv.periodStart) : null,
          periodEnd:   inv.periodEnd   ? new Date(inv.periodEnd)   : null,
          dueDate:     new Date(inv.dueDate),
          amountSen:   BigInt(inv.amountSen),
        })),
      })
      await tx.auditLog.create({
        data: {
          orgId:    auth.orgId!,
          actorId:  auth.userId,
          action:   'lease_created',
          entityId: l.id,
          details:  { unitId, tenantId, startDate, endDate },
        },
      })
      return l
    })
    return NextResponse.json({ id: lease.id }, { status: 201 })
  } catch (e: unknown) {
    const msg = (e as Error).message ?? ''
    if (msg.includes('unique') || msg.includes('overlap') || msg.includes('exclusion') || msg.includes('leases_no_overlap')) {
      return NextResponse.json({ error: 'Lease overlaps an existing lease on this unit' }, { status: 409 })
    }
    throw e
  }
}
