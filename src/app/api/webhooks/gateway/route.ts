import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { allocate } from '@/lib/allocation'
import { isUuid } from '@/lib/utils'

export async function POST(req: NextRequest) {
  // Parse form data (application/x-www-form-urlencoded)
  const formData = await req.formData()
  const fields: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    fields[k] = String(v)
  }

  // ── Signature verification ─────────────────────────────────
  const signature = fields['x_signature']
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  const secretKey = process.env.GATEWAY_X_SIGNATURE_KEY
  if (!secretKey) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 })
  }

  // Spec: sort every field except x_signature by key, write key+value, join with |
  const source = Object.keys(fields)
    .filter(k => k !== 'x_signature')
    .sort()
    .map(k => `${k}${fields[k]}`)
    .join('|')

  const expected = createHmac('sha256', secretKey).update(source).digest('hex')

  // Constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expected, 'hex')
  const signatureBuf = Buffer.from(signature, 'hex')
  if (
    expectedBuf.length !== signatureBuf.length ||
    !timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    // Never log the secret key or the whole callback payload
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const billId = fields['id']
  if (!billId) return NextResponse.json({ error: 'Missing bill id' }, { status: 400 })
  if (!isUuid(billId)) return NextResponse.json({ error: 'Unknown bill' }, { status: 404 })

  // ── paid=false: mark failed (idempotent; paid never reverts) ─
  if (fields['paid'] !== 'true') {
    const bill = await prisma.gatewayBill.findUnique({ where: { id: billId } })
    if (!bill) return NextResponse.json({ error: 'Unknown bill' }, { status: 404 })

    if (bill.status === 'pending') {
      await prisma.gatewayBill.update({ where: { id: billId }, data: { status: 'failed' } })
    }
    // 'failed' → already failed, repeat delivery: 200 no effect
    // 'paid'   → a paid bill never goes back: 200 no effect
    return NextResponse.json({ ok: true })
  }

  // ── paid=true ──────────────────────────────────────────────
  const bill = await prisma.gatewayBill.findUnique({ where: { id: billId } })
  if (!bill) return NextResponse.json({ error: 'Unknown bill' }, { status: 404 })

  // Amount must match the bill exactly
  const paidAmount = parseInt(fields['paid_amount'], 10)
  if (paidAmount !== Number(bill.amountSen)) {
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 422 })
  }

  // Idempotent fast path: already paid → 200, no effect
  if (bill.status === 'paid') {
    return NextResponse.json({ ok: true })
  }

  // Parse paid_at (format: "2026-04-01 00:30:12 +0800") → received_at = paid_at
  let receivedAt: Date
  const paidAtStr = fields['paid_at']
  if (paidAtStr) {
    const iso = paidAtStr.replace(' ', 'T').replace(' +', '+').replace(' -', '-')
    const parsed = new Date(iso)
    receivedAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  } else {
    receivedAt = new Date()
  }

  // Atomic: SELECT FOR UPDATE prevents double-payment on concurrent callbacks
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM gateway_bills WHERE id = ${billId}::uuid FOR UPDATE
    `
    if (!locked[0] || locked[0].status === 'paid') return // already processed

    await tx.gatewayBill.update({ where: { id: billId }, data: { status: 'paid' } })

    const payment = await tx.payment.create({
      data: {
        orgId:         bill.orgId,
        leaseId:       bill.leaseId,
        amountSen:     BigInt(paidAmount),
        method:        'online',
        status:        'approved',
        receivedAt,
        gatewayBillId: bill.id,
      },
    })

    await allocate(tx, payment.id)

    await tx.auditLog.create({
      data: {
        orgId:    bill.orgId,
        actorId:  null,
        action:   'payment_approved',
        entityId: payment.id,
        details:  { method: 'online', gatewayBillId: bill.id, transactionId: fields['transaction_id'] ?? null },
      },
    })
  })

  return NextResponse.json({ ok: true })
}
