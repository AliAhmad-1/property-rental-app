import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, forbidden, notFound } from '@/lib/auth'
import { invoiceStatus } from '@/lib/billing'
import { randomUUID } from 'node:crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const auth = await getAuthContext()
  if (!auth) return unauthorized()
  if (auth.role !== 'tenant') return forbidden()

  const { leaseId } = await params

  const lease = await prisma.lease.findUnique({ where: { id: leaseId } })
  if (!lease || lease.orgId !== auth.orgId) return notFound()
  if (lease.tenantId !== auth.tenantId) return notFound()

  const now = new Date()

  const invoices = await prisma.invoice.findMany({
    where: { leaseId },
    include: { allocations: true },
    orderBy: [{ dueDate: 'asc' }, { kind: 'asc' }, { periodIndex: 'asc' }],
  })

  // Amount due: unpaid invoices due on or before today's MYT date
  const myt = new Date(now.getTime() + 8 * 3600 * 1000)
  const todayMyt =
    `${myt.getUTCFullYear()}-` +
    `${String(myt.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(myt.getUTCDate()).padStart(2, '0')}`

  let amountDueSen = 0
  for (const inv of invoices) {
    const dueDate = inv.dueDate.toISOString().slice(0, 10)
    if (dueDate > todayMyt) continue
    const paidSen = inv.allocations.reduce((s, a) => s + Number(a.amountSen), 0)
    const status = invoiceStatus({ dueDate, amountSen: Number(inv.amountSen), paidSen }, now)
    if (status === 'paid') continue
    amountDueSen += Number(inv.amountSen) - paidSen
  }

  if (amountDueSen === 0) {
    return NextResponse.json({ error: 'No amount due today' }, { status: 422 })
  }

  // Generate unguessable bill id (uuid v4 — 122 bits of entropy)
  const billId = randomUUID()

  const bill = await prisma.gatewayBill.create({
    data: {
      id:        billId,
      orgId:     auth.orgId!,
      leaseId,
      amountSen: BigInt(amountDueSen),
      status:    'pending',
    },
  })

  return NextResponse.json({ billId: bill.id, amountSen: Number(bill.amountSen) }, { status: 201 })
}
