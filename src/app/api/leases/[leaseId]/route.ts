import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, notFound } from '@/lib/auth'
import { invoiceStatus } from '@/lib/billing'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const auth = await getAuthContext()
  if (!auth) return unauthorized()

  const { leaseId } = await params

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: true, tenant: true },
  })
  if (!lease || lease.orgId !== auth.orgId) return notFound()

  // Tenant can only see their own lease
  if (auth.role === 'tenant' && lease.tenantId !== auth.tenantId) return notFound()

  const invoices = await prisma.invoice.findMany({
    where: { leaseId },
    include: { allocations: true },
    orderBy: [{ dueDate: 'asc' }, { kind: 'asc' }, { periodIndex: 'asc' }],
  })

  const payments = await prisma.payment.findMany({
    where: { leaseId },
    orderBy: { receivedAt: 'asc' },
  })

  const now = new Date()

  return NextResponse.json({
    lease: {
      id: lease.id,
      orgId: lease.orgId,
      unitId: lease.unitId,
      tenantId: lease.tenantId,
      startDate: lease.startDate.toISOString().slice(0, 10),
      endDate:   lease.endDate.toISOString().slice(0, 10),
      monthlyRentSen: Number(lease.monthlyRentSen),
      depositSen:     Number(lease.depositSen),
      unit:   { id: lease.unit.id,   name: lease.unit.name },
      tenant: { id: lease.tenant.id, fullName: lease.tenant.fullName },
    },
    invoices: invoices.map(inv => {
      const paidSen = inv.allocations.reduce((s, a) => s + Number(a.amountSen), 0)
      return {
        id: inv.id,
        kind: inv.kind,
        periodIndex: inv.periodIndex,
        periodStart: inv.periodStart ? inv.periodStart.toISOString().slice(0, 10) : null,
        periodEnd:   inv.periodEnd   ? inv.periodEnd.toISOString().slice(0, 10)   : null,
        dueDate:     inv.dueDate.toISOString().slice(0, 10),
        amountSen:   Number(inv.amountSen),
        paidSen,
        status: invoiceStatus({ dueDate: inv.dueDate.toISOString().slice(0, 10), amountSen: Number(inv.amountSen), paidSen }, now),
      }
    }),
    payments: payments.map(p => ({
      id: p.id,
      amountSen:    Number(p.amountSen),
      unappliedSen: Number(p.unappliedSen),
      method:       p.method,
      status:       p.status,
      receivedAt:   p.receivedAt.toISOString(),
      slipPath:     p.slipPath ?? undefined,
    })),
  })
}
