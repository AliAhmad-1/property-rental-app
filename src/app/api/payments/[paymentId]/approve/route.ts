import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, forbidden, notFound } from '@/lib/auth'
import { allocate } from '@/lib/allocation'
import { isUuid } from '@/lib/utils'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const auth = await getAuthContext()
  if (!auth) return unauthorized()
  if (auth.role !== 'manager') return forbidden()

  const { paymentId } = await params
  if (!isUuid(paymentId)) return notFound()

  const result = await prisma.$transaction(async (tx) => {
    // Lock the payment row FIRST to serialize concurrent approve/reject/void on the same payment
    const locked = await tx.$queryRaw<{ id: string; org_id: string; lease_id: string; status: string; amount_sen: bigint }[]>`
      SELECT id, org_id, lease_id, status, amount_sen FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE
    `
    const payment = locked[0]
    if (!payment || payment.org_id !== auth.orgId) return { error: 'not_found' }
    if (payment.status !== 'pending_verification') return { error: 'not_pending' }

    // Lock the lease row to serialize cap checks across concurrent payments on the same lease
    await tx.$executeRaw`SELECT id FROM leases WHERE id = ${payment.lease_id}::uuid FOR UPDATE`

    const invoices = await tx.invoice.findMany({ where: { leaseId: payment.lease_id } })
    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amountSen), 0)

    const allocs = await tx.paymentAllocation.findMany({
      where: { payment: { leaseId: payment.lease_id, status: 'approved' } },
    })
    const totalAllocated = allocs.reduce((s, a) => s + Number(a.amountSen), 0)
    const remaining = totalInvoiced - totalAllocated

    if (Number(payment.amount_sen) > remaining) return { error: 'over_cap' }

    await tx.payment.update({ where: { id: paymentId }, data: { status: 'approved' } })
    await allocate(tx, paymentId)
    await tx.auditLog.create({
      data: {
        orgId: auth.orgId!, actorId: auth.userId,
        action: 'payment_approved', entityId: paymentId,
        details: {},
      },
    })
    return { status: 'approved' }
  })

  if (result.error === 'not_found') return notFound()
  if (result.error === 'not_pending') return NextResponse.json({ error: 'Payment is not pending' }, { status: 409 })
  if (result.error === 'over_cap') return NextResponse.json({ error: 'Payment exceeds remaining balance' }, { status: 422 })

  return NextResponse.json({ status: result.status })
}
