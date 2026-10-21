import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext, unauthorized, forbidden, notFound } from '@/lib/auth'
import { isUuid } from '@/lib/utils'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const auth = await getAuthContext(req)
  if (!auth) return unauthorized()
  if (auth.role !== 'manager') return forbidden()

  const { paymentId } = await params
  if (!isUuid(paymentId)) return notFound()

  let body: { reason: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.reason || body.reason.trim().length < 5) {
    return NextResponse.json({ error: 'Reason must be at least 5 characters' }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    // Lock the payment row to serialize concurrent approve/reject/void
    const locked = await tx.$queryRaw<{ org_id: string; status: string }[]>`
      SELECT org_id, status FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE
    `
    const payment = locked[0]
    if (!payment || payment.org_id !== auth.orgId) return { error: 'not_found' }
    if (payment.status !== 'approved') return { error: 'not_approved' }

    // Remove allocations for this payment only
    await tx.paymentAllocation.deleteMany({ where: { paymentId } })
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'voided', voidReason: body.reason, unappliedSen: 0n },
    })
    await tx.auditLog.create({
      data: {
        orgId: auth.orgId!, actorId: auth.userId,
        action: 'payment_voided', entityId: paymentId,
        details: { reason: body.reason },
      },
    })
    return { status: 'voided' }
  })

  if (result.error === 'not_found') return notFound()
  if (result.error === 'not_approved') return NextResponse.json({ error: 'Payment is not approved' }, { status: 409 })

  return NextResponse.json({ status: 'voided' })
}
